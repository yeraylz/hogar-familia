package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"log"
	"os"
	"strings"
)

// Cifrado en reposo: los textos y los archivos (fotos de perfil, tickets de gastos, etc.)
// se guardan cifrados (AES-256-GCM) en la base de datos y en disco. La clave sale de la
// variable de entorno HOGAR_CLAVE_CHAT; sin ella, todo funciona como antes (sin cifrar).

const (
	prefijoTexto  = "enc1:"
	cabeceraBytes = "HGRENC1\n"
)

var cajaChat cipher.AEAD

func iniciarCifradoChat() {
	k := strings.TrimSpace(os.Getenv("HOGAR_CLAVE_CHAT"))
	if k == "" {
		log.Println("cifrado: HOGAR_CLAVE_CHAT no definida; los datos se guardan sin cifrar")
		return
	}
	h := sha256.Sum256([]byte(k))
	bloque, err := aes.NewCipher(h[:])
	if err != nil {
		log.Println("cifrado: clave no válida:", err)
		return
	}
	g, err := cipher.NewGCM(bloque)
	if err != nil {
		log.Println("cifrado: no se pudo iniciar el cifrado:", err)
		return
	}
	cajaChat = g
	log.Println("cifrado: cifrado en reposo activado")
}

func sellarBytesChat(b []byte) []byte {
	if cajaChat == nil || bytes.HasPrefix(b, []byte(cabeceraBytes)) {
		return b
	}
	nonce := make([]byte, cajaChat.NonceSize())
	rand.Read(nonce)
	out := append([]byte(cabeceraBytes), nonce...)
	return cajaChat.Seal(out, nonce, b, nil)
}

// abrirBytesChat devuelve los datos en claro; si no estaban cifrados, los devuelve tal cual.
func abrirBytesChat(b []byte) ([]byte, bool) {
	if !bytes.HasPrefix(b, []byte(cabeceraBytes)) {
		return b, true
	}
	if cajaChat == nil {
		return nil, false
	}
	b = b[len(cabeceraBytes):]
	n := cajaChat.NonceSize()
	if len(b) < n {
		return nil, false
	}
	claro, err := cajaChat.Open(nil, b[:n], b[n:], nil)
	if err != nil {
		return nil, false
	}
	return claro, true
}

func sellarTextoChat(s string) string {
	if cajaChat == nil || s == "" || strings.HasPrefix(s, prefijoTexto) {
		return s
	}
	return prefijoTexto + base64.StdEncoding.EncodeToString(sellarBytesChat([]byte(s)))
}

func abrirTextoChat(s string) string {
	if !strings.HasPrefix(s, prefijoTexto) {
		return s
	}
	raw, err := base64.StdEncoding.DecodeString(s[len(prefijoTexto):])
	if err != nil {
		return "🔒"
	}
	claro, ok := abrirBytesChat(raw)
	if !ok {
		return "🔒 Dato cifrado (falta la clave)"
	}
	return string(claro)
}
