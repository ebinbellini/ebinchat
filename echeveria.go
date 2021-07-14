package main

import (
	"bytes"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io/ioutil"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	webpush "github.com/SherClockHolmes/webpush-go"
	"github.com/dgrijalva/jwt-go"
	_ "github.com/go-sql-driver/mysql"
	"golang.org/x/crypto/bcrypt"
)

// Only used for implementing trait for serveHTTP
type awaitMessageHandler struct {
}

// Message A message sent by a user
type Message struct {
	ID             string    `json:"ID"`
	SenderID       string    `json:"senderID"`
	GroupID        string    `json:"groupID"`
	Text           string    `json:"text"`
	AttachmentPath string    `json:"path"`
	TimeStamp      time.Time `json:"timestamp"`
}

// Listener Client waiting for when new data is available
type Listener struct {
	Writer    http.ResponseWriter
	Request   *http.Request
	Name      string
	UserID    int64
	Used      bool
	LastMsgID int64
	Expires   time.Time
}

// ListenerGroup All listeners in one group
type ListenerGroup struct {
	Listeners []*Listener
}

// Subscriber A web push subscription with name of subscriber
type Subscriber struct {
	Name   string
	WebSub *webpush.Subscription
}

type SubscriptionUpdate struct {
	OldEndpoint string
	WebSub      *webpush.Subscription
}

// NotificationContents Contains all the information that is sent through web push
type NotificationContents struct {
	Title  string
	Text   string
	Image  string
	Name   string // The name of the reciever
	Action string
}

// PublicUserInfo The information about users that everyone can see
type PublicUserInfo struct {
	Name  string `json:"name"`
	ID    int    `json:"id"`
	Image string `json:"image"`
}

// SignupFields The fields required to create an account
type SignupFields struct {
	Email    string `json:"email"`
	Password string `json:"password"`
	Name     string `json:"name"`
}

// GroupData The group data sent to the user
type GroupData struct {
	GroupID       string    `json:"groupID"`
	GroupName     string    `json:"groupName"`
	ImageURL      string    `json:"imageURL"`
	IsDirect      bool      `json:"isDirect"`
	LastMessage   string    `json:"lastMessage"`
	LastEventTime time.Time `json:"lastEventTime"`
	CreatedAt     time.Time `json:"createdAt"`
}

// CreateGroupData The data required to create a group
type CreateGroupData struct {
	GroupName string  `json:"groupName"`
	Members   []int64 `json:"members"`
}

const listenerLifetime = 60 * time.Second
const messageLimit = 300
const roomImageLimit = 10
const roomImageTimeLimit = 48 * time.Hour
const bcryptCost = 12
const authTokenLifetime = 24 * 31 * time.Hour

// Global variables
var listenergroups map[string]*ListenerGroup = map[string]*ListenerGroup{}
var vapidPublic string
var vapidPrivate string
var hmacshaPrivate []byte
var sqlDB *sql.DB

func main() {
	fmt.Println("サーバーをスタートします…")
	openMySQLDatabase()
	generateHMACPrivateKey()
	initWebPush()

	http.HandleFunc("/", serveRequest)
	http.HandleFunc("/signup", respondToSignUp)
	http.HandleFunc("/login", respondToLogIn)
	http.HandleFunc("/sendmessage/", respondToSendMessage)
	http.HandleFunc("/searchuser/", respondToSearchUsers)
	http.HandleFunc("/sendfriendrequest/", respondToSendFriendRequest)
	http.HandleFunc("/fetchfriendrequests/", respondToFetchFriendRequests)
	http.HandleFunc("/acceptfriendrequest/", respondToAcceptFriendRequest)
	http.HandleFunc("/fetchcontactlist/", respondToFetchContactList)
	http.HandleFunc("/fetchfriendlist/", respondToFetchFriendList)
	http.HandleFunc("/fetchgroupdata/", respondToFetchGroupData)
	http.HandleFunc("/creategroup/", respondToCreateGroup)
	http.HandleFunc("/validatejwt/", respondToValidateJWT)
	http.HandleFunc("/profilepics/", respondToProfilePics)
	http.HandleFunc("/profilepicurl/", respondToProfilePicURL)
	http.HandleFunc("/images/", respondToGetImage)
	http.HandleFunc("/vapid/", respondToGetVapidPublic)
	http.Handle("/awaitmessages/", http.TimeoutHandler(awaitMessageHandler{}, listenerLifetime, "Timeout"))
	http.HandleFunc("/messages/", respondToGetMessages)
	http.HandleFunc("/subscribegroup/", respondToSubscribeToGroup)
	http.HandleFunc("/amisubscribedtogroup/", respondToAmISubscribedToGroup)
	http.HandleFunc("/subscribepush/", respondToSubscribePush)
	http.HandleFunc("/updatepush/", respondToUpdatePush)

	//http.HandleFunc("/uploadfile/", respondToUploadFile)

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
		log.Fatal("HMACキーを作る失敗した", err)
	}
	hmacshaPrivate = bytes
}

func openMySQLDatabase() {
	// Password for test database. Won't work on the real server.
	// benim:liksomvadeupposv@localhost:3306/echeveria

	// TODO put back this: root:thispasswordisprivate@(127.0.0.1:3306)/echeveria?parseTime=true
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
		image TEXT,
		created_at DATETIME,
		PRIMARY KEY (id)`)

	createTable("friends", `id1 INT,
		id2 INT,
		created_at DATETIME`)

	createTable("friend_requests", `id INT AUTO_INCREMENT,
		sender INT,
		reciever INT,
		created_at DATETIME,
		PRIMARY KEY (id)`)

	createTable("chat_groups", `id INT AUTO_INCREMENT,
		group_name VARCHAR(60),
		image TEXT,
		is_direct BOOLEAN,
		message_count INT,
		last_message VARCHAR(60) NOT NULL,
		last_event_time DATETIME,
		created_at DATETIME,
		PRIMARY KEY (id)`)

	createTable("group_members", `group_id INT,
		user_id INT,
		created_at DATETIME,
		PRIMARY KEY (group_id, user_id)`)

	createTable("messages", `id INT AUTO_INCREMENT,
		sender_id INT,
		group_id INT,
		text VARCHAR(1024),
		attachment_path VARCHAR(64),
		timestamp DATETIME,
		PRIMARY KEY (id)`)

	createTable("push_subscribers", `user_id INT,
		subscription VARCHAR(2048),
		PRIMARY KEY (user_id)`)

	createTable("convo_notif_subscribers", `user_id INT,
		group_id INT,
		PRIMARY KEY (user_id, group_id)`)

	createTable("server_data", `data_key VARCHAR(50),
		value VARCHAR(2048),
		PRIMARY KEY (data_key)`)

	// Enable searching for usernames
	_, err = sqlDB.Exec(`CREATE FULLTEXT INDEX name_fulltext ON users(name)`)
	if err != nil {
		fmt.Println("インデックスを作る時にこのエラーが出てきた " + err.Error())
	} else {
		fmt.Println("ユーザー名前のインデックスを作った")
	}
}

func createTable(name, fields string) {
	query := "CREATE TABLE " + name + " ( " + fields + " );"
	if _, err := sqlDB.Exec(query); err != nil {
		if strings.Contains(err.Error(), "already exists") {
			fmt.Println("「" + name + "」というなテーブルはもうありますから作れない")
		} else {
			fmt.Println("「" + name + "」を作る時にこのエラーが出てきた " + err.Error())
		}
	} else {
		fmt.Println("「" + name + "」というなテーブルを作った")
	}
}

func (handler awaitMessageHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 5 {
		serveBadRequest(w, r)
		return
	}

	tokenString := split[2]
	claims := validateJWTClaims(tokenString)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprintln(w, "failed to validate")
		return
	}

	// Calculate timestamp in milliseconds at the moment of sending the request
	lastMsgIDString := split[3]
	lastMsgID, err := strconv.ParseInt(lastMsgIDString, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}

	// Calculate expiry timestamp
	expires := time.Now().Add(listenerLifetime)

	// ID of requester
	userID, err := strconv.ParseInt((*claims)["id"].(string), 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, err)
		return
	}

	listener := &Listener{
		Writer:    w,
		Request:   r,
		UserID:    userID,
		Used:      false,
		LastMsgID: lastMsgID,
		Expires:   expires,
	}

	// ID of the group to listen to
	groupID := split[4]

	// Is the user in this group?
	if !isUserInGroup(strconv.FormatInt(userID, 10), groupID) {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "You're not in that group")
		return
	}

	// Initialize if none exists
	if listenergroups[groupID] == nil {
		listenergroups[groupID] = &ListenerGroup{[]*Listener{}}
	}
	lGroup := listenergroups[groupID]

	lGroup.Listeners = append(lGroup.Listeners, listener)

	for !listener.Used && listener.Expires.After(time.Now()) {
		time.Sleep(100 * time.Millisecond)
	}
	cleanupListeners(lGroup)
}

func respondToGetVapidPublic(w http.ResponseWriter, r *http.Request) {
	fmt.Fprint(w, vapidPublic)
}

func createUserJWT(id int64, name string, email string) string {
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"id":  strconv.FormatInt(id, 10),
		"aud": email,
		"sub": name,
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
	// Should keys be generated
	gen := false

	query := "SELECT value FROM server_data WHERE data_key='vapid_public'"
	err := sqlDB.QueryRow(query).Scan(&vapidPublic)
	if err != nil {
		fmt.Println(err)
		gen = true
	}

	query = "SELECT value FROM server_data WHERE data_key='vapid_private'"
	err = sqlDB.QueryRow(query).Scan(&vapidPrivate)
	if err != nil {
		fmt.Println(err)
		gen = true
	}

	if gen {
		// Retrieving vapid keys failed. It is time to generate new keys.
		vapidPrivate, vapidPublic, err = webpush.GenerateVAPIDKeys()
		if err != nil {
			fmt.Println("ウェブプッシュを開始するできませんでした", err)
			return
		}

		// Store new keys in database
		query = "INSERT INTO server_data (data_key, value) VALUE (?, ?)"
		_, err = sqlDB.Exec(query, "vapid_public", vapidPublic)
		if err != nil {
			fmt.Println(err)
			return
		}

		query = "INSERT INTO server_data (data_key, value) VALUE (?, ?)"
		_, err = sqlDB.Exec(query, "vapid_private", vapidPrivate)
		if err != nil {
			fmt.Println(err)
			return
		}
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
	query := `INSERT INTO users (email, password, name, image, created_at) VALUES (?, ?, ?, ?, ?);`
	result, err := sqlDB.Exec(query, signup.Email, signup.Password, signup.Name, "default.svg", time.Now())
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}

	// Get the unique ID of the newly created user
	id, err := result.LastInsertId()
	if err != nil {
		fmt.Println("det blir fel")
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, err)
		return
	}

	// Create and send authentication token
	token := createUserJWT(id, signup.Name, signup.Email)
	// Expires after 31 days (one month)
	/*cookie := &http.Cookie{Name: "auth", Value: token, Expires: time.Now().Add(authTokenLifetime), Path: "/"}
	http.SetCookie(w, cookie)
	fmt.Fprint(w, "Success! ▼・ᴥ・▼")*/
	fmt.Fprintln(w, token)
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

	row := sqlDB.QueryRow("SELECT id, password, name FROM users WHERE email=?", login.Email)
	if err != nil {
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, "Could not find a user with that combination of email and password")
		return
	}
	var id, password, name string
	if err := row.Scan(&id, &password, &name); err != nil {
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, "Could not find a user with that combination of email and password")
		return
	}

	// The user does not send a username when logging in
	login.Name = name

	// Check if password is correct
	err = bcrypt.CompareHashAndPassword([]byte(password), []byte(login.Password))
	if err != nil {
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, "Could not find a user with that combination of email and password")
		return
	}

	// Succesfully authenticated
	idInt, err := strconv.Atoi(id)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, err)
	}

	// Create and send authentication token
	token := createUserJWT(int64(idInt), login.Name, login.Email)

	// Expires after 31 days (one month)
	/*cookie := &http.Cookie{Name: "auth", Value: token, Expires: time.Now().Add(authTokenLifetime), Path: "/"}
	http.SetCookie(w, cookie)
	fmt.Fprintln(w, "Authenticated!")*/
	fmt.Fprintln(w, token)
}

func respondToSendFriendRequest(w http.ResponseWriter, r *http.Request) {
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 4 {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "err...?")
		return
	}

	tokenString := split[2]
	claims := validateJWTClaims(tokenString)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprintln(w, "failed to validate")
		return
	}

	recieverID, err := url.QueryUnescape(split[3])
	if err != nil {
		fmt.Fprintln(w, err)
		return
	}
	senderID := (*claims)["id"].(string)

	// Check if already friends
	query := "SELECT id1 FROM friends WHERE (id1=? AND id2=?) OR (id2=? AND id1=?)"
	rows1, err := sqlDB.Query(query, senderID, recieverID, (*claims)["id"], recieverID)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}
	defer rows1.Close()
	if rows1.Next() {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "You're already friends!")
		return
	}

	// Check if such a friend request already exists
	query = "SELECT id FROM friend_requests WHERE (sender=? AND reciever=?)"
	rows2, err := sqlDB.Query(query, senderID, recieverID)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}
	defer rows2.Close()
	if rows2.Next() {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "You have already sent a friend request to this user!")
		return
	}

	// Send friend request
	query = "INSERT INTO friend_requests (sender, reciever, created_at) VALUES (?, ?, ?)"
	sqlDB.Exec(query, senderID, recieverID, time.Now())
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}

	sendFriendRequestNotification(senderID, recieverID)
}

func sendFriendRequestNotification(senderID string, recieverID string) {
	sid, err := strconv.Atoi(senderID)
	if err != nil {
		fmt.Println(err)
		return
	}

	rid, err := strconv.Atoi(recieverID)
	if err != nil {
		fmt.Println(err)
		return
	}

	name, image := getUserNameAndImage(sid)
	text := name + " wants to be your fren! ＼(＾▽＾)／"

	sendNotificationToUser(text, rid, "fren", "New friend request", "Friend requests", image)
}

func respondToFetchFriendRequests(w http.ResponseWriter, r *http.Request) {
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 3 {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "err...?")
		return
	}

	tokenString := split[2]
	claims := validateJWTClaims(tokenString)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	query := "SELECT sender FROM friend_requests WHERE reciever=?"
	rows, err := sqlDB.Query(query, (*claims)["id"])
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}

	defer rows.Close()
	senders := []int{}
	for rows.Next() {
		var senderID int
		err := rows.Scan(&senderID)
		if err != nil {
			fmt.Fprint(w, "No requests")
			return
		}
		senders = append(senders, senderID)
	}

	profiles := []PublicUserInfo{}
	for _, senderID := range senders {
		name, image := getUserNameAndImage(senderID)
		profiles = append(profiles, PublicUserInfo{
			Name:  name,
			Image: image,
			ID:    senderID,
		})
	}

	res, err := json.Marshal(profiles)
	if err == nil {
		json.NewEncoder(w).Encode(res)
	} else {
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, err)
	}
}

func getUserNameAndImage(userID int) (name string, image string) {
	row := sqlDB.QueryRow("SELECT name, image FROM users WHERE id=?", userID)
	err := row.Scan(&name, &image)
	if err != nil {
		fmt.Println(err)
	}
	return
}

func getUserName(userID string) (name string) {
	row := sqlDB.QueryRow("SELECT name FROM users WHERE id=?", userID)
	err := row.Scan(&name)
	if err != nil {
		fmt.Println(err)
	}
	return
}

func getUserEmail(userID int) (email string) {
	row := sqlDB.QueryRow("SELECT email FROM users WHERE id=?", userID)
	err := row.Scan(&email)
	if err != nil {
		fmt.Println(err)
	}
	return
}

func getGroupNameAndImage(groupID string) (name string, image string, err error) {
	query := "SELECT group_name, image FROM chat_groups WHERE id=?"

	row := sqlDB.QueryRow(query, groupID)

	groupName := sql.NullString{}

	err = row.Scan(&groupName, &image)
	if err != nil {
		return "", "", err
	}

	if groupName.Valid {
		return groupName.String, image, nil
	} else {
		return "", image, errors.New("This group has no name")
	}
}

func respondToAcceptFriendRequest(w http.ResponseWriter, r *http.Request) {
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 4 {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "err...?")
		return
	}

	tokenString := split[2]
	claims := validateJWTClaims(tokenString)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	senderID := split[3]

	// Check if such a friend request exists
	query := "SELECT sender FROM friend_requests WHERE reciever=? AND sender=?"
	rows1, err := sqlDB.Query(query, (*claims)["id"], senderID)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}
	defer rows1.Close()
	if !rows1.Next() {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "No such friend request exists")
		return
	}

	// Check if such a friend relationship already exists
	query = "SELECT id1 FROM friends WHERE (id1=? AND id2=?) OR (id2=? AND id1=?)"
	rows2, err := sqlDB.Query(query, (*claims)["id"], senderID, (*claims)["id"], senderID)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}
	defer rows2.Close()
	if rows2.Next() {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "You're already friends!")

		// Remove friend request if it exists
		query = "DELETE FROM friend_requests WHERE (reciever=? AND sender=?) OR (sender=? AND reciever=?)"
		sqlDB.Exec(query, (*claims)["id"], senderID, (*claims)["id"], senderID)

		return
	}
	// It is now certain that such a request exists

	// Create a friend relationship
	query = "INSERT INTO friends (id1, id2, created_at) VALUES (?, ?, ?)"
	_, err = sqlDB.Exec(query, (*claims)["id"], senderID, time.Now())
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}

	// Remove friend request if it exists
	query = "DELETE FROM friend_requests WHERE (reciever=? AND sender=?) OR (sender=? AND reciever=?)"
	_, err = sqlDB.Exec(query, (*claims)["id"], senderID, (*claims)["id"], senderID)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}

	// Create a chat
	query = "INSERT INTO chat_groups (image, is_direct, message_count, last_message, last_event_time, created_at) VALUES (?, ?, 0, ?, ?, ?)"
	result, err := sqlDB.Exec(query, "default.svg", true, "New friend!", time.Now(), time.Now())
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}

	chatGroupID, err := result.LastInsertId()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, err)
		return
	}

	senderIDInt, err := strconv.ParseInt(senderID, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, err)
		return
	}

	myID, err := strconv.ParseInt((*claims)["id"].(string), 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, err)
		return
	}

	err = addUserIDToGroup(myID, chatGroupID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, err)
		return
	}
	err = addUserIDToGroup(senderIDInt, chatGroupID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, err)
		return
	}

	// TODO make the new contact appear in contact list without having to reload
}

func respondToFetchContactList(w http.ResponseWriter, r *http.Request) {
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 3 {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "err...?")
		return
	}

	tokenString := split[2]
	claims := validateJWTClaims(tokenString)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	// Fetch the IDs of all groups the user is a member of
	query := "SELECT group_id FROM group_members WHERE user_id=?"
	rows, err := sqlDB.Query(query, (*claims)["id"])
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}
	defer rows.Close()

	// Store all group IDs in an array
	groupIDs := []int{}
	for rows.Next() {
		var groupID int
		err = rows.Scan(&groupID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprint(w, err)
			return
		}
		groupIDs = append(groupIDs, groupID)
	}

	// Fetch display-data of all these groups
	groupDatas := []GroupData{}
	for _, groupID := range groupIDs {
		row := sqlDB.QueryRow(`SELECT id, group_name, image, is_direct,
			last_message, last_event_time, created_at
			FROM chat_groups WHERE id=?`, groupID)

		gd := GroupData{}
		groupName := sql.NullString{}

		err := row.Scan(&gd.GroupID, &groupName, &gd.ImageURL, &gd.IsDirect,
			&gd.LastMessage, &gd.LastEventTime, &gd.CreatedAt)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprintln(w, err)
			return
		}
		if groupName.Valid {
			gd.GroupName = groupName.String
		}

		// If the group is direct, fetch the user data instead
		if gd.IsDirect {
			row1 := sqlDB.QueryRow(`SELECT user_id FROM group_members
				WHERE group_id=? AND user_id<>?`, groupID, (*claims)["id"])
			var id int
			err := row1.Scan(&id)
			if err != nil {
				w.WriteHeader(http.StatusInternalServerError)
				fmt.Fprintln(w, err)
				return
			}
			gd.GroupName, gd.ImageURL = getUserNameAndImage(id)
		}
		groupDatas = append(groupDatas, gd)
	}

	res, err := json.Marshal(groupDatas)
	if err == nil {
		json.NewEncoder(w).Encode(res)
	} else {
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, err)
	}
}

func respondToFetchFriendList(w http.ResponseWriter, r *http.Request) {
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 3 {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "err...?")
		return
	}

	tokenString := split[2]
	claims := validateJWTClaims(tokenString)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	// Fetch the IDs of all friends of the user
	query := "SELECT id1, id2 FROM friends WHERE id1=? OR id2=?"
	rows, err := sqlDB.Query(query, (*claims)["id"], (*claims)["id"])
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}
	defer rows.Close()

	// Store all friends IDs in an array
	friendIDs := []int{}
	for rows.Next() {
		var id1 int
		var id2 int
		err = rows.Scan(&id1, &id2)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprint(w, err)
			return
		}

		if strconv.Itoa(id1) == (*claims)["id"] {
			friendIDs = append(friendIDs, id2)
		} else {
			friendIDs = append(friendIDs, id1)
		}
	}

	// Fetch display-data of all these users
	profiles := []PublicUserInfo{}
	for _, id := range friendIDs {
		pui := PublicUserInfo{}
		pui.Name, pui.Image = getUserNameAndImage(id)
		profiles = append(profiles, pui)
	}

	res, err := json.Marshal(profiles)
	if err == nil {
		json.NewEncoder(w).Encode(res)
	} else {
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, err)
	}
}

func respondToFetchGroupData(w http.ResponseWriter, r *http.Request) {
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 4 {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "err...?")
		return
	}

	tokenString := split[2]
	claims := validateJWTClaims(tokenString)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	userID := (*claims)["id"].(string)
	groupID := split[3]

	// Check if user is in group
	if !isUserInGroup(userID, groupID) {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "You're not in that group")
		return
	}

	row := sqlDB.QueryRow(`SELECT id, group_name, image, is_direct,
		last_message, last_event_time, created_at
		FROM chat_groups WHERE id=?`, groupID)

	gd := GroupData{}
	groupName := sql.NullString{}

	err := row.Scan(&gd.GroupID, &groupName, &gd.ImageURL, &gd.IsDirect,
		&gd.LastMessage, &gd.LastEventTime, &gd.CreatedAt)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprintln(w, err)
		return
	}
	if groupName.Valid {
		gd.GroupName = groupName.String
	}

	// If the group is direct, fetch the user data instead
	if gd.IsDirect {
		row1 := sqlDB.QueryRow(`SELECT user_id FROM group_members
				WHERE group_id=? AND user_id<>?`, groupID, (*claims)["id"])
		var id int
		err := row1.Scan(&id)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprintln(w, err)
			return
		}
		gd.GroupName, gd.ImageURL = getUserNameAndImage(id)
	}

	res, err := json.Marshal(gd)
	if err == nil {
		json.NewEncoder(w).Encode(res)
	} else {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
	}
}

func respondToCreateGroup(w http.ResponseWriter, r *http.Request) {
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 3 {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "err...?")
		return
	}

	tokenString := split[2]
	claims := validateJWTClaims(tokenString)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprintln(w, "failed to validate")
		return
	}

	// Decode group data
	decoder := json.NewDecoder(r.Body)
	groupData := CreateGroupData{}
	err := decoder.Decode(&groupData)
	if err != nil {
		serveBadRequest(w, r)
		fmt.Fprintln(w, "failed to decode group data")
		return
	}

	// Create a chat
	query := "INSERT INTO chat_groups (group_name, image, is_direct, message_count, last_message, last_event_time, created_at) VALUES (?, ?, ?, 0, ?, ?, ?)"
	result, err := sqlDB.Exec(query, groupData.GroupName, "default.svg", false, "New group, say hi!", time.Now(), time.Now())
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}

	// Get ID of newly created chat
	chatGroupID, err := result.LastInsertId()
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, err)
		return
	}

	// Get ID of chat creator
	myID, err := strconv.ParseInt((*claims)["id"].(string), 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, err)
		return
	}

	// Add creator to chat
	err = addUserIDToGroup(myID, chatGroupID)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, err)
		return
	}

	// Add members to chat
	for _, memberID := range groupData.Members {
		// Add members to chat
		err = addUserIDToGroup(memberID, chatGroupID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprint(w, err)
			return
		}
	}

	// Respond with success
	fmt.Fprint(w, "指指指みんなの指を食べちゃう")
}

func addUserIDToGroup(userID, chatID int64) error {
	// Check if such a friend relationship already exists
	query := "SELECT user_id FROM group_members WHERE user_id=? AND group_id=?"
	rows, err := sqlDB.Query(query, userID, chatID)
	if err != nil {
		return err
	}
	defer rows.Close()
	if rows.Next() {
		rows.Scan(&userID)
		return errors.New("This user is already in this group")
	}

	// Insert users
	query = "INSERT INTO group_members (group_id, user_id, created_at) VALUES (?, ?, ?)"
	_, err = sqlDB.Exec(query, chatID, userID, time.Now())
	if err != nil {
		return err
	}

	return nil
}

func respondToSearchUsers(w http.ResponseWriter, r *http.Request) {
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 4 {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "uuh?")
		return
	}

	tokenString := split[2]
	query, err := url.QueryUnescape(split[3])
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}

	claims := validateJWTClaims(tokenString)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	rows, err := sqlDB.Query(`SELECT id, name, image FROM users WHERE
		MATCH(name) AGAINST(?) LIMIT 10`, query)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}

	defer rows.Close()
	results := []PublicUserInfo{}
	for rows.Next() {
		var id int
		var name string
		var image string
		err := rows.Scan(&id, &name, &image)
		if err != nil {
			w.WriteHeader(http.StatusForbidden)
			fmt.Fprint(w, err)
			return
		}
		if strconv.Itoa(id) != (*claims)["id"] {
			results = append(results, PublicUserInfo{
				Name:  name,
				ID:    id,
				Image: image,
			})
		}
	}

	res, err := json.Marshal(results)
	if err == nil {
		json.NewEncoder(w).Encode(res)
	} else {
		w.WriteHeader(http.StatusForbidden)
		fmt.Fprint(w, err)
	}
}

func respondToProfilePics(w http.ResponseWriter, r *http.Request) {
	url := r.URL.Path
	fp := strings.TrimPrefix(strings.ReplaceAll(filepath.Clean(url), "\\", "/"), "/")

	_, err := os.Stat(fp)
	if err == nil {
		// Serve picture
		http.ServeFile(w, r, fp)
	} else {
		if os.IsNotExist(err) {
			fp = filepath.Join("profilepics", "default.png")
			http.ServeFile(w, r, fp)
		} else {
			serveInternalError(w, r)
		}
	}
}

func respondToProfilePicURL(w http.ResponseWriter, r *http.Request) {
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 3 {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "bad path")
		return
	}

	tokenString := split[2]
	claims := validateJWTClaims(tokenString)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprint(w, "Invalid")
		return
	}

	var url string
	row := sqlDB.QueryRow(`SELECT image FROM users WHERE id=?`, (*claims)["id"])
	err := row.Scan(&url)
	if err != nil {
		w.WriteHeader(http.StatusInternalServerError)
		fmt.Fprint(w, err)
		return
	}
	fmt.Fprint(w, url)
}

func respondToValidateJWT(w http.ResponseWriter, r *http.Request) {
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 3 {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "what")
		return
	}

	tokenString := split[2]
	claims := validateJWTClaims(tokenString)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprint(w, "Invalid")
		return
	}

	// Respond with success
	fmt.Fprint(w, (*claims)["id"])
}

func validateJWTClaims(tokenString string) *jwt.MapClaims {
	token, _ := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
		_, ok := token.Method.(*jwt.SigningMethodHMAC)
		if !ok {
			return nil, fmt.Errorf("Unexpected signing method: %v", token.Header["alg"])
		}

		return hmacshaPrivate, nil
	})

	if claims, ok := token.Claims.(jwt.MapClaims); ok && token.Valid {
		return &claims
	}
	return nil
}

func respondToAmISubscribedToGroup(w http.ResponseWriter, r *http.Request) {
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 4 {
		serveBadRequest(w, r)
		return
	}

	tokenString := split[2]
	claims := validateJWTClaims(tokenString)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprintln(w, "failed to validate")
		return
	}

	userID := (*claims)["id"].(string)
	groupID := split[3]

	ans := "いいえ"
	if userHasNotificationsEnabledForGroup(userID, groupID) {
		ans = "はい"
	}

	fmt.Fprintln(w, ans)
}

// Returns true if the user is subscribed to the group
func userHasNotificationsEnabledForGroup(userID, groupID string) bool {
	query := "SELECT 1 FROM convo_notif_subscribers WHERE user_id=? AND group_id=?"
	var epin int64
	err := sqlDB.QueryRow(query, userID, groupID).Scan(&epin)
	return err == nil
}

// (Un)subscribes the user to notifications from a certain chat group
func respondToSubscribeToGroup(w http.ResponseWriter, r *http.Request) {
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 5 {
		serveBadRequest(w, r)
		return
	}

	tokenString := split[2]
	claims := validateJWTClaims(tokenString)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprintln(w, "failed to validate")
		return
	}

	userID := (*claims)["id"].(string)
	groupID := split[3]
	subscribe := split[4]

	// Check if user is in this group
	if !isUserInGroup(userID, groupID) {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "You're not in that group")
		return
	}

	if subscribe == "1" {
		// Check if already subscribed
		if userHasNotificationsEnabledForGroup(userID, groupID) {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprint(w, "You have already enabled notifications... (^‿^)？")
			return
		}

		// Subscribe
		query := "INSERT INTO convo_notif_subscribers (user_id, group_id) VALUES (?, ?)"
		_, err := sqlDB.Exec(query, userID, groupID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprint(w, err.Error())
			return
		}
	} else {
		// Unsubbed
		query := "DELETE FROM convo_notif_subscribers WHERE user_id = ? and group_id = ?"
		res, err := sqlDB.Exec(query, userID, groupID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Fprint(w, err.Error())
			return
		}

		count, _ := res.RowsAffected()
		if count == 0 {
			w.WriteHeader(http.StatusBadRequest)
			fmt.Fprint(w, "Notifications were already disabled??")
			return
		}
	}
}

func respondToSubscribePush(w http.ResponseWriter, r *http.Request) {
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 3 {
		serveBadRequest(w, r)
		return
	}

	tokenString := split[2]
	claims := validateJWTClaims(tokenString)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprintln(w, "failed to validate")
		return
	}

	userID := (*claims)["id"].(string)

	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		serveInternalError(w, r)
		return
	}

	subscription := string(body)

	// Check if the user is already subscribed
	query := `SELECT 1 FROM push_subscribers WHERE user_id=?`
	var epin int64
	err = sqlDB.QueryRow(query, userID).Scan(&epin)
	if err == nil {
		// Update record
		query := `UPDATE push_subscribers SET subscription=? WHERE user_id=?`
		_, err = sqlDB.Exec(query, subscription, userID)
		if err != nil {
			w.WriteHeader(http.StatusInternalServerError)
			fmt.Println(w, err.Error())
			return // <- unnecessary but nice
		}

		return
	}

	// Store subscription
	query = "INSERT INTO push_subscribers (user_id, subscription) VALUES (?, ?)"
	_, err = sqlDB.Exec(query, userID, subscription)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}

	// Respond with success
	fmt.Fprint(w, "▼・ᴥ・▼")
}

func respondToUpdatePush(w http.ResponseWriter, r *http.Request) {
	body, err := ioutil.ReadAll(r.Body)
	if err != nil {
		serveInternalError(w, r)
		return
	}

	update := SubscriptionUpdate{}
	json.Unmarshal(body, &update)

	query := `UPDATE push_subscribers
		SET subscription=?
		WHERE subscription LIKE concat('{"endpoint":"', ? '","expirationTime%')`
	_, err = sqlDB.Exec(query, update.WebSub, update.OldEndpoint)
	if err != nil {
		fmt.Println(err)
	}
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

func cleanupListeners(lGroup *ListenerGroup) {
	unused := []*Listener{}
	for _, listener := range lGroup.Listeners {
		// If not used and not expired
		if !listener.Used && listener.Expires.After(time.Now()) {
			unused = append(unused, listener)
		}
	}
	lGroup.Listeners = unused
}

func indexOf(slice []*Listener, elm *Listener) int {
	for i := 0; i < len(slice)-1; i++ {
		if slice[i] == elm {
			return i
		}
	}
	return -1
}

func respondToGetMessages(w http.ResponseWriter, r *http.Request) {
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 4 {
		serveBadRequest(w, r)
		return
	}

	tokenString := split[2]
	claims := validateJWTClaims(tokenString)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprintln(w, "failed to validate")
		return
	}

	groupID := split[3]

	// Check if user is in group
	if !isUserInGroup((*claims)["id"].(string), groupID) {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "You're not in that group")
		return
	}

	// Gather the 30 most recent messages
	query := `(SELECT id, sender_id, group_id, text, attachment_path, timestamp
				FROM messages WHERE group_id=?)
			ORDER BY timestamp DESC LIMIT 30`
	rows, err := sqlDB.Query(query, groupID)
	if err != nil {
		fmt.Print(err)
		return
	}
	defer rows.Close()

	messages := []Message{}
	for rows.Next() {
		var msg Message
		err := rows.Scan(&msg.ID, &msg.SenderID, &msg.GroupID, &msg.Text, &msg.AttachmentPath, &msg.TimeStamp)
		if err != nil {
			fmt.Print(err)
			return
		}
		messages = append(messages, msg)
	}

	res, err := json.Marshal(messages)
	if err == nil {
		json.NewEncoder(w).Encode(res)
	} else {
		serveInternalError(w, r)
	}
}

func isUserInGroup(userID, groupID string) bool {
	// Check if the requesting user is in the group he's trying to access
	query := `SELECT 1 FROM group_members WHERE user_id=? AND group_id=?`
	var epin int64
	err := sqlDB.QueryRow(query, userID, groupID).Scan(&epin)

	if err != nil {
		if err != sql.ErrNoRows {
			fmt.Println(err)
		}
		return false
	}
	return true
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

/*func respondToUploadFile(w http.ResponseWriter, r *http.Request) {
	// TODO REPLACE WITH NEW FILE UPLOAD
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
}*/

func respondToSendMessage(w http.ResponseWriter, r *http.Request) {
	requestURL := r.URL.Path
	split := strings.Split(requestURL, "/")
	if len(split) != 3 {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "Wrong number of parameters for request")
		return
	}

	tokenString := split[2]
	claims := validateJWTClaims(tokenString)
	if claims == nil {
		w.WriteHeader(http.StatusUnauthorized)
		fmt.Fprintln(w, "failed to validate")
		return
	}

	// Decode message
	decoder := json.NewDecoder(r.Body)
	var message Message
	err := decoder.Decode(&message)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, err)
		return
	}

	message.SenderID = (*claims)["id"].(string)

	groupID, err := strconv.ParseInt(message.GroupID, 10, 64)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "このデータはおかしいです普通ではないです")
		return
	}

	// Set timestamp
	message.TimeStamp = time.Now()

	if len(message.Text) == 0 {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprintln(w, "Message is empty")
		return
	}

	// Check if group exists
	query := "SELECT group_name FROM chat_groups WHERE id=?"
	rows, err := sqlDB.Query(query, groupID)
	rows.Scan()
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}
	defer rows.Close()
	if !rows.Next() {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "A group with id "+message.GroupID+" does not exist")
		return
	}

	if !isUserInGroup(message.SenderID, strconv.FormatInt(groupID, 10)) {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, "You're not in that group")
		return
	}

	query = "INSERT INTO messages (sender_id, group_id, text, attachment_path, timestamp) VALUES (?, ?, ?, ?, ?)"
	_, err = sqlDB.Exec(query, (*claims)["id"], groupID, message.Text, "", time.Now())
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}

	// Increase message count
	query = "UPDATE chat_groups SET message_count = message_count + 1 WHERE id = ?"
	_, err = sqlDB.Exec(query, groupID)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		return
	}

	// Truncate the last message and say who it is from
	name := getUserName(message.SenderID)
	last_message := name + ": " + message.Text
	if len(last_message) > 55 {
		last_message = last_message[0:55] + "…"
	}

	// Update last_message field
	query = "UPDATE chat_groups SET last_message = ? WHERE id = ?"
	_, err = sqlDB.Exec(query, last_message, groupID)
	if err != nil {
		w.WriteHeader(http.StatusBadRequest)
		fmt.Fprint(w, err)
		fmt.Println(err)
		return
	}

	notifyListeners(message)

	// TODO ADD A MESSAGE LIMIT

	// Respond with success
	fmt.Fprint(w, "アウストラロピテクス")
}

func notifyListeners(message Message) {
	_, ok := listenergroups[message.GroupID]
	if ok {
		handleListeners(&message)
	}

	sendNotifications(&message)
}

func handleListeners(message *Message) {
	for _, listener := range listenergroups[message.GroupID].Listeners {
		// If not used and not expired
		if !listener.Used && listener.Expires.After(time.Now()) {
			query := `SELECT id, sender_id, group_id, text, attachment_path, timestamp
				FROM messages WHERE group_id=? AND id>=?`
			rows, err := sqlDB.Query(query, message.GroupID, listener.LastMsgID)
			if err != nil {
				fmt.Print(err)
				return
			}

			defer rows.Close()
			messages := []Message{}
			for rows.Next() {
				var msg Message
				err := rows.Scan(&msg.ID, &msg.SenderID, &msg.GroupID, &msg.Text, &msg.AttachmentPath, &msg.TimeStamp)
				if err != nil {
					fmt.Print(err)
					return
				}
				messages = append(messages, msg)
			}

			if len(messages) == 0 {
				return
			}

			res, err := json.Marshal(messages)
			if err == nil {
				json.NewEncoder(listener.Writer).Encode(res)
				listener.Used = true
			} else {
				serveInternalError(listener.Writer, listener.Request)
			}
		}
	}
}

func sendNotifications(message *Message) {
	groupID := message.GroupID

	query := "SELECT user_id FROM group_members WHERE group_id=?"
	rows, err := sqlDB.Query(query, groupID)
	if err != nil {
		fmt.Println(err)
		return
	}
	defer rows.Close()

	senderName := getUserName(message.SenderID)

	groupName, image, err := getGroupNameAndImage(groupID)
	if err != nil {
		// This is a direct chat
		groupName = senderName
	}

	for rows.Next() {
		var userID int
		err := rows.Scan(&userID)
		if err != nil {
			fmt.Println(err)
			return
		}

		// Don't send to sender
		if message.SenderID == strconv.Itoa(userID) {
			continue
		}

		title := "New message from " + senderName
		sendNotificationToUser(message.Text, userID, groupID, title, groupName, image)
	}
}

func sendNotificationToUser(text string, recieverID int, action, title, topic, image string) {
	recieverEmail := getUserEmail(recieverID)

	// Fetch the user's web push subscrption
	query := "SELECT subscription FROM push_subscribers WHERE user_id=?"
	subscriptionJSON := ""
	err := sqlDB.QueryRow(query, recieverID).Scan(&subscriptionJSON)
	if err != nil {
		return
	}
	subscription := webpush.Subscription{}
	json.Unmarshal([]byte(subscriptionJSON), &subscription)

	// Build the notification payload
	notifContents := &NotificationContents{
		Title:  title,
		Text:   text,
		Action: action,
		Image:  image,
	}

	content, err := json.Marshal(notifContents)
	if err != nil {
		fmt.Println(err)
		return
	}

	// Send Notification
	resp, err := webpush.SendNotification(content, &subscription, &webpush.Options{
		TTL:             30,
		Topic:           topic,
		Subscriber:      recieverEmail,
		VAPIDPublicKey:  vapidPublic,
		VAPIDPrivateKey: vapidPrivate,
	})
	defer resp.Body.Close()

	if err != nil {
		fmt.Println("通知を送信できませんでした", err)
		return
	}

	res, err := ioutil.ReadAll(resp.Body)
	if err != nil {
		fmt.Println(err)
		fmt.Println(string(res))
	}

	//fmt.Println("通知を送信できました。いいね！", resp.Status)
}
