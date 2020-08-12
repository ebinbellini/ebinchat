package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	//"html"
	webpush "github.com/SherClockHolmes/webpush-go"
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

const listenerLifetime = 60 * time.Second
const messageLimit = 300
const roomImageLimit = 10

// TODO 48 hours
const roomImageTimeLimit = 5 * time.Second

var rooms map[string]*Room

var vapidPublic string
var vapidPrivate string

func main() {
	rooms = map[string]*Room{}

	initWebPush()

	http.HandleFunc("/", serveRequest)
	http.HandleFunc("/sendmessage/", respondToSendMessage)
	http.HandleFunc("/messages/", respondToGetMessages)
	http.HandleFunc("/subscribe/", respondToSubscribePush)
	http.HandleFunc("/images/", respondToGetImage)
	http.HandleFunc("/vapid/", respondToGetVapidPublic)
	http.HandleFunc("/uploadfile/", respondToUploadFile)
	http.Handle("/awaitmessages/", http.TimeoutHandler(awaitMessageHandler{}, listenerLifetime, "Timeout"))

	fmt.Println("Listening on port 1337...")
	err := http.ListenAndServe(":1337", nil)
	if err != nil {
		log.Fatal(err)
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
		fmt.Println("Bad timestamp in awaitMessageHandler ServeHTTP ", err)
		serveBadRequest(w, r)
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

func initWebPush() {
	var err error
	vapidPrivate, vapidPublic, err = webpush.GenerateVAPIDKeys()
	if err != nil {
		fmt.Println("Could not initiate web push", err)
		return
	}
	fmt.Println("vapid publik är", vapidPublic)

	/*
		// Send Notification
		resp, err := webpush.SendNotification([]byte("Test"), s, &webpush.Options{
			Subscriber:      "ebinbellini@airmail.cc",
			VAPIDPublicKey:  vapidPublic,
			VAPIDPrivateKey: vapidPrivate,
			TTL:             30,
		})
		if err != nil {
			fmt.Println("Could not send notification", err)
			return
		}
		defer resp.Body.Close() */
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
	fmt.Println(userName, roomName)
	room := rooms[roomName]

	fmt.Println(url, room)

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
	fmt.Println("HÄR KOMMER SLUTPUNKT OCH NYCKLAR TILL DEN")
	fmt.Println(subscription)

	sub := Subscriber{
		Name:   userName,
		WebSub: subscription,
	}

	room.Subscribers = append(room.Subscribers, sub)
}

func serveRequest(w http.ResponseWriter, r *http.Request) {
	url := r.URL.Path
	// fmt.Println("Trying to serve", url)
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
				fmt.Println("Removing image went wrong", err)
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
		fmt.Println("Upload File create file os.Create", err)
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
			fmt.Println("Upload File write file", err)
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
	fmt.Println("New message in room", room.Name, "from user", message.SenderName)
	fmt.Println("There are", len(room.Listeners), "listeners in the room", room.Name)
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
			fmt.Println("Ja nu jäklar", err)
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
			fmt.Println("Could not send notification", err)
			return
		}
		fmt.Println("Lyckades skicka nottis", resp.Status)
		defer resp.Body.Close()
	}
}
