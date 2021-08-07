package main

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha512"
	"encoding/base64"
	"io"
	"syscall/js"
)

const nonceSize int = 12

var block cipher.Block = nil

// Generates a block for use with subsequent calls to encryptMessage and decryptMessage
func generateBlock(_this js.Value, args []js.Value) interface{} {
	password := []byte(args[0].String())

	// Generating a key requires exactly 32 bytes of data
	// This hashes anything to 32 bytes
	hash := sha512.Sum512_256(password)

	// Convert [32]byte to []byte
	key := hash[:]

	var err error
	block, err = aes.NewCipher(key)
	if err != nil {
		return "0" + err.Error()
	}

	// Encode to base64
	encoded := base64.StdEncoding.EncodeToString(key)

	return "1" + encoded
}

func generateBlockFromKey(_this js.Value, args []js.Value) interface{} {
	encoded := args[0].String()

	// Decode from base64
	key, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "0" + err.Error()
	}

	block, err = aes.NewCipher(key)
	if err != nil {
		return "0" + err.Error()
	}

	return "1"
}

// Takes: (plaintext string). Returns: ("0"+error string | "1"+encoded string)
func encryptMessage(_this js.Value, args []js.Value) interface{} {
	message := []byte(args[0].String())

	nonce := make([]byte, 12)
	_, err := io.ReadFull(rand.Reader, nonce)
	if err != nil {
		return "0" + err.Error()
	}

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return "0" + err.Error()
	}

	// Encrypt
	encrypted := aesgcm.Seal(nil, nonce, message, nil)

	// Encode to base64
	encoded := base64.StdEncoding.EncodeToString(append(nonce, encrypted...))

	return "1" + encoded
}

// Takes: (nonce+encoded string). Returns: ("0"+error string | "1"+plaintext string)
func decryptMessage(_this js.Value, args []js.Value) interface{} {
	encoded := args[0].String()

	// Decode from base64
	data, err := base64.StdEncoding.DecodeString(encoded)
	if err != nil {
		return "0" + err.Error()
	}

	if len(data) <= 12 {
		return "0" + "Message too short"
	}

	nonce := data[0:12]
	ciphertext := data[12:]

	aesgcm, err := cipher.NewGCM(block)
	if err != nil {
		return "0" + err.Error()
	}

	// Decrypt
	plaintext, err := aesgcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "0" + err.Error()
	}

	return "1" + string(plaintext)
}

func registerCallbacks() {
	js.Global().Set("generate_block", js.FuncOf(generateBlock))
	js.Global().Set("generate_block_from_key", js.FuncOf(generateBlockFromKey))
	js.Global().Set("encrypt_message", js.FuncOf(encryptMessage))
	js.Global().Set("decrypt_message", js.FuncOf(decryptMessage))
}

func main() {
	registerCallbacks()

	pause := make(chan struct{}, 0)
	<-pause
}
