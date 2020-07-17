package main

import (
	//"bytes"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

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
}

// Room A room that clients connect to
type Room struct {
	Name      string
	Messages  []Message
	Listeners []*Listener
}

var rooms map[string]*Room

func main() {
	rooms = map[string]*Room{}
	//func TimeoutHandler(h Handler, dt time.Duration, msg string) Handler
	//http.TimeoutHandler()

	http.HandleFunc("/", serveRequest)
	http.HandleFunc("/sendmessage/", respondToSendMessage)
	http.HandleFunc("/messages/", respondToGetMessages)
	http.HandleFunc("/staticattachment/", respondToStaticAttachment)
	http.Handle("/awaitmessages/", http.TimeoutHandler(awaitMessageHandler{}, 60*time.Second, "FETTO"))

	print("Listening on :80...\n")
	err := http.ListenAndServe(":80", nil)
	if err != nil {
		log.Fatal(err)
	}
}

func (handler awaitMessageHandler) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	fmt.Println("Någon inväntar meddelande")
	url := r.URL.Path
	split := strings.Split(url, "/")
	fmt.Println("Någon inväntarsdas meddelande 2")
	if len(split) != 4 {
		serveBadRequest(w, r)
		return
	}
	roomName := split[2]
	userName := split[3]

	fmt.Println("Någon inväntarsdas meddelande 3")
	room := rooms[roomName]
	listener := &Listener{
		Writer:  w,
		Request: r,
		Name:    userName,
		Used:    false,
	}
	fmt.Println("Någon inväntarsdas meddelande 4")

	room.Listeners = append(room.Listeners, listener)
	fmt.Println("Lyssnare är ", room.Listeners)

	for !listener.Used {
		time.Sleep(100 * time.Millisecond)
	}

	// This crashes the goroutine TODO fix
	//room.Listeners = removeListener(room.Listeners, listener)
	fmt.Println("============ TOG BORT EN LYSSNARE =============")
	fmt.Println(room.Listeners)
}

func serveRequest(w http.ResponseWriter, r *http.Request) {
	url := r.URL.Path
	fp := filepath.Join("static", filepath.Clean(url))

	// First try to serve from static folder
	info, err := os.Stat(fp)
	if err == nil {
		// Serve static file
		if !info.IsDir() {
			fmt.Println("Okje hittade", url)
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
		print("serverar templatead fil\n")
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

func removeListener(listeners []*Listener, elm *Listener) []*Listener {
	i := indexOf(listeners, elm)
	listeners[i] = listeners[len(listeners)-1]
	return listeners[:len(listeners)-1]
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
		Name:      name,
		Messages:  []Message{},
		Listeners: []*Listener{},
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

func respondToStaticAttachment(w http.ResponseWriter, r *http.Request) {
	url := r.URL.Path
	split := strings.Split(url, "/")
	if len(split) != 5 {
		serveBadRequest(w, r)
		return
	}
	roomName := split[2]
	userName := split[3]
	attachmentName := split[4]

	message := Message{
		SenderName:     userName,
		Text:           "",
		AttachmentPath: attachmentName,
		TimeStamp:      time.Now(),
	}

	room := rooms[roomName]
	sendMessage(message, room)
	fmt.Fprintln(w, "Success! ▼・ᴥ・▼")
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
	url := r.URL.Path
	split := strings.Split(url, "/")
	if len(split) != 3 {
		serveBadRequest(w, r)
		return
	}

	roomName := split[2]
	room := rooms[roomName]
	sendMessage(message, room)

	// Respond with success
	fmt.Fprint(w, "lyckades")
}

func sendMessage(message Message, room *Room) {
	room.Messages = append(room.Messages, message)
	notifyRoomMembers(message, room)
}

func notifyRoomMembers(message Message, room *Room) {
	fmt.Println("notifierar")
	for _, listener := range room.Listeners {
		fmt.Println(listener)
		if !listener.Used {
			array := [1]Message{message}
			res, err := json.Marshal(array)
			if err == nil {
				json.NewEncoder(listener.Writer).Encode(res)
				listener.Used = true
			} else {
				serveInternalError(listener.Writer, listener.Request)
			}
		}
	}
}
