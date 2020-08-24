package main

import (
	"bytes"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"fmt"
	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/dgrijalva/jwt-go"
	_ "github.com/go-sql-driver/mysql"
	"golang.org/x/crypto/bcrypt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// Only used for implementing trait for serveHTTP
type awaitMessageHandler struct {
}

// Message A message sent by a user
type Message struct {
	SenderName     string
	Text           string
	AttachmentPath string
	TimeStamp      time.Time
}

// Listener Client waiting for when new data is available
type Listener struct {
	Writer  http.ResponseWriter
	Request *http.Request
	Name    string
	Used    bool
	Sent    time.Time
	Expires time.Time
}

// Room A room that clients connect to
type Room struct {
	Name         string
	Messages     []Message
	Listeners    []*Listener
	Subscribers  []Subscriber
	ImageCount   int
	MessageCount int
}

// Subscriber A web push subscription with name of subscriber
type Subscriber struct {
	Name   string
	WebSub *webpush.Subscription
}

// NotificationContents Contains all the information that is sent through web push
type NotificationContents struct {
	Sender string
	Text   string
	Name   string // The name of the reciever
	Room   string
}

// SignupFields The fields required to create an account
type SignupFields struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

const listenerLifetime = 60 * time.Second
const messageLimit = 300
const roomImageLimit = 10
const roomImageTimeLimit = 48 * time.Hour
const bcryptCost = 12
const authTokenLifetime = 24 * 31 * time.Hour

// Global variables
var rooms map[string]*Room = map[string]*Room{}
var vapidPublic string
var vapidPrivate string
var hmacshaPrivate []byte
var sqlDB *sql.DB

func main() {
	fmt.Println("サーバーをスタートします…")
	initWebPush()
	openMySQLDatabase()
	generateHMACPrivateKey()

	http.HandleFunc("/", serveRequest)
	http.HandleFunc("/signup", respondToSignUp)
	http.HandleFunc("/login", respondToLogIn)
	http.HandleFunc("/sendmessage/", respondToSendMessage)
	http.HandleFunc("/messages/", respondToGetMessages)
	http.HandleFunc("/subscribe/", respondToSubscribePush)
	http.HandleFunc("/images/", respondToGetImage)
	http.HandleFunc("/vapid/", respondToGetVapidPublic)
	http.HandleFunc("/uploadfile/", respondToUploadFile)
	http.Handle("/awaitmessages/", http.TimeoutHandler(awaitMessageHandler{}, listenerLifetime, "Timeout"))

	fmt.Println("1337のポートを待機しています...")
	err := http.ListenAndServe(":1337", nil)
	if err != nil {
		log.Fatal(err)
	}
}

func generateHMACPrivateKey() {
	bytes := make([]byte, 256)
	_, err := rand.Read(bytes)
	if err != nil {
		log.Fatal("Failed to generate HMACキーを", err)
	}
	hmacshaPrivate = bytes
}

func openMySQLDatabase() {
	db, err := sql.Open("mysql", "benim:liksomvadeupposv@(127.0.0.1:3306)/echeveria?parseTime=true")
	if err != nil {
		log.Fatal(err)
	}
	err = db.Ping()
	if err != nil {
		log.Fatal(err)
	}
	sqlDB = db

	fmt.Println("「echeveria」というなMySQLデータベースにコネクトしました")

	createTable("users", `id INT AUTO_INCREMENT,
		name VARCHAR(25) NOT NULL UNIQUE,
		password VARCHAR(60) NOT NULL,
		email VARCHAR(64) NOT NULL UNIQUE,
		created_at DATETIME,
		PRIMARY KEY (id)`)
}

func createTable(name, fields string) {
	query := "CREATE TABLE " + name + " ( " + fields + " );"
	if _, err := sqlDB.Exec(query); err != nil {
		fmt.Println(err)
	} else {
		fmt.Println("「", name, "」というなテーブルを作った")
	}

}

func (handler awaitMessageHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 5 {
		serveBadRequest(w, r)
		return
	}
	roomName, err := url.QueryUnescape(split[2])
	userName, err := url.QueryUnescape(split[3])
	timeStamp := split[4]

	ms, err := strconv.ParseInt(timeStamp, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}

	sent := time.Unix(0, 0)
	sent = sent.Add(time.Duration(ms) * time.Millisecond)
	expires := time.Now().Add(listenerLifetime)

	room := rooms[roomName]
	listener := &Listener{
		Writer:  w,
		Request: r,
		Name:    userName,
		Used:    false,
		Sent:    sent,
		Expires: expires,
	}

	room.Listeners = append(room.Listeners, listener)
	for !listener.Used {
		time.Sleep(100 * time.Millisecond)
	}
	cleanupListeners(room)
}

func respondToGetVapidPublic(w http.ResponseWriter, r *http.Request) {
	fmt.Fprint(w, vapidPublic)
}

func createUserJWT(id int64) string {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"id":  strconv.FormatInt(id, 10),
		"exp": time.Now().Add(authTokenLifetime).Unix(),
	})

	// Sign and get the complete encoded token as a string using the secret
	tokenString, err := token.SignedString(hmacshaPrivate)
	if err != nil {
		fmt.Println(err)
		return ""
	}

	return tokenString
}

func initWebPush() {
	var err error
	vapidPrivate, vapidPublic, err = webpush.GenerateVAPIDKeys()
	if err != nil {
		fmt.Println("ウェブプッシュを開始するできませんでした", err)
		return
	}
	fmt.Println("ウェブプッシュを開始しました")
}

func respondToSignUp(w http.ResponseWriter, r *http.Request) {
	// Decode request body
	buf := new(bytes.Buffer)
	buf.ReadFrom(r.Body)
	signupJSON := buf.String()
	signup := &SignupFields{}
	err := json.Unmarshal([]byte(signupJSON), signup)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}

	// Hash pasword
	// BCrypt automatically salts passwords
	hash, err := bcrypt.GenerateFromPassword([]byte(signup.Password), bcryptCost)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}
	signup.Password = string(hash)

	// Store user in database
	// Errors if someone else is using the same email or name
	query := `INSERT INTO users (email, password, name, created_at) VALUES (?, ?, ?, ?);`
	result, err := sqlDB.Exec(query, signup.Email, signup.Password, signup.Name, time.Now())
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}

	// Get the unique ID of the newly created user
	id, err := result.LastInsertId()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, err)
		return
	}

	// Create and send authentication token
	token := createUserJWT(id)
	// Expires after 31 days (one month)
	cookie := &http.Cookie{Name: "auth", Value: token, Expires: time.Now().Add(authTokenLifetime), Path: "/"}
	http.SetCookie(w, cookie)
	fmt.Fprint(w, "Success! ▼・ᴥ・▼")
}

func respondToLogIn(w http.ResponseWriter, r *http.Request) {
	// Decode request body
	buf := new(bytes.Buffer)
	buf.ReadFrom(r.Body)
	loginJSON := buf.String()
	login := &SignupFields{}
	err := json.Unmarshal([]byte(loginJSON), login)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}

	rows, err := sqlDB.Query("SELECT id, password FROM users WHERE email=?", login.Email)
	// TODO SEE WHAT HAPPENS WHEN YOU SEARCH FOR A USER THAT DOES NOT EXIST
	if err != nil {
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, "Could not find a user with that combination of email and password")
	}
	defer rows.Close()
	rows.Next()
	var id, password string
	if err := rows.Scan(&id, &password); err != nil {
		fmt.Fprint(w, err)
	}

	// Check if password is correct
	err = bcrypt.CompareHashAndPassword([]byte(password), []byte(login.Password))
	if err != nil {
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, "Could not find a user with that combination of email and password")
	} else {
		// Succesfully authenticated
		idInt, err := strconv.Atoi(id)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprint(w, err)
		}

		// Create and send authentication token
		token := createUserJWT(int64(idInt))
		// Expires after 31 days (one month)
		cookie := &http.Cookie{Name: "auth", Value: token, Expires: time.Now().Add(authTokenLifetime), Path: "/"}
		http.SetCookie(w, cookie)
		fmt.Fprintln(w, "Authenticated!")
	}
}

func respondToSubscribePush(w http.ResponseWriter, r *http.Request) {
	url := r.URL.Path
	split := strings.Split(url, "/")
	if len(split) != 4 {
		serveBadRequest(w, r)
		return
	}
	roomName := split[2]
	userName := split[3]
	room := rooms[roomName]

	// Decode subscription
	buf := new(bytes.Buffer)
	buf.ReadFrom(r.Body)
	subscriptionJSON := buf.String()
	subscription := &webpush.Subscription{}
	err := json.Unmarshal([]byte(subscriptionJSON), subscription)
	if err != nil {
		serveBadRequest(w, r)
		return
	}

	sub := Subscriber{
		Name:   userName,
		WebSub: subscription,
	}

	room.Subscribers = append(room.Subscribers, sub)
}

func serveRequest(w http.ResponseWriter, r *http.Request) {
	url := r.URL.Path
	fp := filepath.Join("static", filepath.Clean(url))

	// First try to serve from static folder
	info, err := os.Stat(fp)
	if err == nil {
		// Serve static file
		if !info.IsDir() {
			http.ServeFile(w, r, fp)
		} else {
			serveFromPages(w, r)
		}
	} else {
		if os.IsNotExist(err) {
			// If static file does not exist try pages folder
			serveFromPages(w, r)
		} else {
			serveInternalError(w, r)
		}
	}
}

func serveFromPages(w http.ResponseWriter, r *http.Request) {
	url := r.URL.Path
	if url == "/" {
		fp := filepath.Join("pages", filepath.Clean(url), "index.html")
		http.ServeFile(w, r, fp)
		return
	}

	fp := filepath.Join("pages", filepath.Clean(url))
	_, err := os.Stat(fp)
	if err == nil {
		http.ServeFile(w, r, fp)
	} else {
		if os.IsNotExist(err) {
			serveNotFound(w, r)
		}
	}
}

func serveNotFound(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusNotFound)
	http.ServeFile(w, r, filepath.Join("pages", "404.html"))
}

func serveInternalError(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusInternalServerError)
	http.ServeFile(w, r, filepath.Join("pages", "error.html"))
}

func serveBadRequest(w http.ResponseWriter, r *http.Request) {
	w.WriteHeader(http.StatusBadRequest)
	http.ServeFile(w, r, filepath.Join("pages", "bad.html"))
}

func cleanupListeners(room *Room) {
	unused := []*Listener{}
	for _, listener := range room.Listeners {
		// If not used and not expired
		if !listener.Used && listener.Expires.After(time.Now()) {
			unused = append(unused, listener)
		}
	}
	room.Listeners = unused
}

func indexOf(slice []*Listener, elm *Listener) int {
	for i := 0; i < len(slice)-1; i++ {
		if slice[i] == elm {
			return i
		}
	}
	return -1
}

func createRoom(name string, user string) {
	rooms[name] = &Room{
		Name:         name,
		Messages:     []Message{},
		Listeners:    []*Listener{},
		Subscribers:  []Subscriber{},
		ImageCount:   0,
		MessageCount: 0,
	}
}

func respondToGetMessages(w http.ResponseWriter, r *http.Request) {
	url := r.URL.Path
	split := strings.Split(url, "/")
	if len(split) != 4 {
		serveBadRequest(w, r)
		return
	}
	roomName := split[2]
	userName := split[3]

	room, ok := rooms[roomName]
	if !ok {
		createRoom(roomName, userName)
		room = rooms[roomName]
	}

	res, err := json.Marshal(room.Messages)
	if err == nil {
		json.NewEncoder(w).Encode(res)
	} else {
		serveInternalError(w, r)
	}
}

func respondToGetImage(w http.ResponseWriter, r *http.Request) {
	url := r.URL.Path
	file := filepath.Join("images/", strings.Split(url, "/")[2])
	info, err := os.Stat(file)
	if err == nil {
		http.ServeFile(w, r, file)
		// Remove image if it is old
		if (info.ModTime().Add(roomImageTimeLimit)).Before(time.Now()) {
			err := os.Remove(file)
			if err != nil {
				fmt.Println("写真を削除できませんでした", err)
			}
		}
	} else {
		if os.IsNotExist(err) {
			// Respond with an image saying that the previous image was removed
			noImage := filepath.Join("static", "imgs", "removed.png")
			http.ServeFile(w, r, noImage)
		} else {
			serveInternalError(w, r)
		}
	}
}

func respondToUploadFile(w http.ResponseWriter, r *http.Request) {
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 4 {
		serveBadRequest(w, r)
		return
	}
	roomName, err := url.QueryUnescape(split[2])
	fileName := split[3]

	path := filepath.Join("images", roomName+"_"+fileName)
	file, err := os.Create(path)
	if err != nil {
		fmt.Println("ファイルのアップロード失敗した", err)
		serveInternalError(w, r)
	}
	defer file.Close()

	room := rooms[roomName]
	room.ImageCount++
	// Remove oldest image if the room image limit
	if room.ImageCount > roomImageLimit {
		for i := len(room.Messages) - 1; i >= 0; i-- {
			if room.Messages[i].AttachmentPath != "" {
				removePath := room.Messages[i].AttachmentPath
				// Maybe insecure TODO check security
				if strings.HasPrefix(removePath, "images") {
					err := os.Remove(removePath)
					if err != nil {
						fmt.Println(err)
					} else {
						room.ImageCount--
					}
				}
			}
		}
	}

	bytes := make([]byte, 1024)
	for {
		_, err := r.Body.Read(bytes)
		_, err2 := file.Write(bytes)

		if err == io.EOF {
			break
		}
		if err2 != nil {
			fmt.Println("ファイルを書くの失敗した", err)
			break
		}
	}

	file.Sync()

	info, err := os.Stat(path)
	if err != nil {
		fmt.Println(err)
	} else {
		fmt.Println(info.ModTime())
	}

	// Send the path to the created file to the client
	fmt.Fprint(w, "images/"+roomName+"_"+fileName)
}

func respondToSendMessage(w http.ResponseWriter, r *http.Request) {
	// Decode message
	decoder := json.NewDecoder(r.Body)
	var message Message
	err := decoder.Decode(&message)
	if err != nil {
		serveBadRequest(w, r)
		return
	}

	// Set timestamp
	message.TimeStamp = time.Now()

	// Store message in room
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 3 {
		serveBadRequest(w, r)
		return
	}

	roomName := split[2]
	room := rooms[roomName]
	sendMessage(message, room)

	// Keep messages within limit
	room.MessageCount++
	if room.MessageCount > messageLimit {
		// Remove oldest message
		room.Messages = room.Messages[1:]
	}

	// Respond with success
	fmt.Fprint(w, "アウストラロピテクス")
}

func sendMessage(message Message, room *Room) {
	room.Messages = append(room.Messages, message)
	notifyRoomMembers(message, room)
}

func notifyRoomMembers(message Message, room *Room) {
	fmt.Println(room.Name, "に新しいメッセージが", message.SenderName, "から来た")
	fmt.Println(room.Name, "のルームには", len(room.Listeners), "つリスナーがあります")
	handleListeners(room)
	sendNotificationsInRoom(message, room)
}

func handleListeners(room *Room) {
	for _, listener := range room.Listeners {
		// If not used and not expired
		if !listener.Used && listener.Expires.After(time.Now()) {
			notRecieved := []*Message{}
			for i := 0; i < len(room.Messages); i++ {
				msg := room.Messages[i]
				if msg.TimeStamp.After(listener.Sent) {
					notRecieved = append(notRecieved, &msg)
				}
			}
			if len(notRecieved) == 0 {
				return
			}
			res, err := json.Marshal(notRecieved)
			if err == nil {
				json.NewEncoder(listener.Writer).Encode(res)
				listener.Used = true
			} else {
				serveInternalError(listener.Writer, listener.Request)
			}
		}
	}
}

func sendNotificationsInRoom(message Message, room *Room) {
	for _, subscriber := range room.Subscribers {
		// Don't send notification to the sender
		if subscriber.Name == message.SenderName {
			continue
		}

		// Build notification payload
		notifContents := &NotificationContents{
			Sender: message.SenderName,
			Text:   message.Text,
			Name:   subscriber.Name,
			Room:   room.Name,
		}
		text, err := json.Marshal(notifContents)
		if err != nil {
			fmt.Println("おかしいなあ", err)
		}

		// Send Notification
		subscription := subscriber.WebSub
		resp, err := webpush.SendNotification(text, subscription, &webpush.Options{
			TTL:             30,
			Topic:           room.Name,
			Subscriber:      "ebinbellini@airmail.cc",
			VAPIDPublicKey:  vapidPublic,
			VAPIDPrivateKey: vapidPrivate,
		})
		if err != nil {
			fmt.Println("通知を送信できませんでした", err)
			return
		}
		fmt.Println("通知を送信できました　いいね！", resp.Status)
		defer resp.Body.Close()
	}
}
