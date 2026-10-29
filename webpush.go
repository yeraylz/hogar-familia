package main

import (
	"bytes"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/rand"
	"encoding/base64"
	"encoding/binary"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

type PushSubscription struct {
	ID       int    `json:"id,omitempty"`
	Endpoint string `json:"endpoint"`
	P256dh   string `json:"p256dh"`
	Auth     string `json:"auth"`
	Persona  string `json:"persona"`
}

// errSuscripcionCaducada se devuelve cuando el navegador ha invalidado la
// suscripción (el usuario desinstaló la app, borró datos, etc). El llamador
// debe borrar esa suscripción de la BBDD.
var errSuscripcionCaducada = errors.New("suscripción push caducada")

// enviarPush cifra el payload según RFC 8291 (aes128gcm) y lo envía al
// endpoint del navegador, firmando la petición con el JWT VAPID (RFC 8292).
func enviarPush(sub PushSubscription, payload []byte) error {
	uaPub, err := base64.URLEncoding.DecodeString(padB64(sub.P256dh))
	if err != nil {
		return fmt.Errorf("clave p256dh inválida: %w", err)
	}
	authSecret, err := base64.URLEncoding.DecodeString(padB64(sub.Auth))
	if err != nil {
		return fmt.Errorf("auth secret inválido: %w", err)
	}

	curve := ecdh.P256()
	uaPublicKey, err := curve.NewPublicKey(uaPub)
	if err != nil {
		return fmt.Errorf("clave pública del navegador inválida: %w", err)
	}

	asPriv, err := curve.GenerateKey(rand.Reader)
	if err != nil {
		return err
	}
	asPubBytes := asPriv.PublicKey().Bytes() // 65 bytes, formato 0x04||X||Y

	sharedSecret, err := asPriv.ECDH(uaPublicKey)
	if err != nil {
		return err
	}

	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		return err
	}

	// --- Derivación de claves según RFC 8291 ---
	keyInfo := append([]byte("WebPush: info\x00"), uaPub...)
	keyInfo = append(keyInfo, asPubBytes...)
	prkKey := hkdfExtract(authSecret, sharedSecret)
	ikm := hkdfExpand(prkKey, keyInfo, 32)

	prk := hkdfExtract(salt, ikm)
	cek := hkdfExpand(prk, []byte("Content-Encoding: aes128gcm\x00"), 16)
	nonce := hkdfExpand(prk, []byte("Content-Encoding: nonce\x00"), 12)

	// Delimitador de registro simple (0x02) sin relleno adicional.
	plaintext := append(append([]byte{}, payload...), 0x02)

	block, err := aes.NewCipher(cek)
	if err != nil {
		return err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	ciphertext := gcm.Seal(nil, nonce, plaintext, nil)

	// Cabecera del content-coding aes128gcm: salt(16) + rs(4) + idlen(1) + keyid(idlen)
	var body bytes.Buffer
	body.Write(salt)
	rs := make([]byte, 4)
	binary.BigEndian.PutUint32(rs, uint32(4096))
	body.Write(rs)
	body.WriteByte(byte(len(asPubBytes)))
	body.Write(asPubBytes)
	body.Write(ciphertext)

	jwt, err := generarVAPIDJWT(sub.Endpoint)
	if err != nil {
		return err
	}

	req, err := http.NewRequest(http.MethodPost, sub.Endpoint, bytes.NewReader(body.Bytes()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/octet-stream")
	req.Header.Set("Content-Encoding", "aes128gcm")
	req.Header.Set("TTL", "86400")
	// Urgencia alta (RFC 8030): con el móvil bloqueado y en reposo, Android entrega al momento
	// en vez de agrupar y retrasar el aviso.
	req.Header.Set("Urgency", "high")
	req.Header.Set("Authorization", fmt.Sprintf("vapid t=%s, k=%s", jwt, vapidPublicKeyB64))

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	io.Copy(io.Discard, resp.Body)

	if resp.StatusCode == http.StatusGone || resp.StatusCode == http.StatusNotFound {
		return errSuscripcionCaducada
	}
	if resp.StatusCode >= 300 {
		return fmt.Errorf("push rechazado por el navegador: %d", resp.StatusCode)
	}
	return nil
}

// padB64 añade el padding '=' que a veces se pierde en base64url al viajar por JSON/URLs.
func padB64(s string) string {
	if m := len(s) % 4; m != 0 {
		s += string(bytes.Repeat([]byte{'='}, 4-m))
	}
	return s
}
