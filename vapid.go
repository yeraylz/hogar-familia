package main

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"math/big"
	"net/url"
	"time"
)

var vapidPrivateKey *ecdsa.PrivateKey
var vapidPublicKeyB64 string

const vapidSubject = "mailto:hogar@example.com"

// cargarOCrearClavesVAPID recupera las claves VAPID guardadas en la BBDD,
// o genera un par nuevo la primera vez y lo persiste (para que las
// suscripciones de los navegadores no dejen de funcionar en cada reinicio).
func cargarOCrearClavesVAPID() error {
	privB64, okPriv := leerConfig("vapid_private_key")
	pubB64, okPub := leerConfig("vapid_public_key")

	if okPriv && okPub {
		dBytes, err := base64.RawURLEncoding.DecodeString(privB64)
		if err != nil {
			return err
		}
		curve := elliptic.P256()
		priv := new(ecdsa.PrivateKey)
		priv.PublicKey.Curve = curve
		priv.D = new(big.Int).SetBytes(dBytes)
		priv.PublicKey.X, priv.PublicKey.Y = curve.ScalarBaseMult(dBytes)
		vapidPrivateKey = priv
		vapidPublicKeyB64 = pubB64
		return nil
	}

	priv, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return err
	}
	pubBytes := elliptic.Marshal(elliptic.P256(), priv.PublicKey.X, priv.PublicKey.Y)
	dBytes := padTo32(priv.D.Bytes())

	privB64 = base64.RawURLEncoding.EncodeToString(dBytes)
	pubB64 = base64.RawURLEncoding.EncodeToString(pubBytes)

	if err := guardarConfig("vapid_private_key", privB64); err != nil {
		return err
	}
	if err := guardarConfig("vapid_public_key", pubB64); err != nil {
		return err
	}

	vapidPrivateKey = priv
	vapidPublicKeyB64 = pubB64
	return nil
}

func padTo32(b []byte) []byte {
	if len(b) >= 32 {
		return b[len(b)-32:]
	}
	out := make([]byte, 32)
	copy(out[32-len(b):], b)
	return out
}

func leerConfig(clave string) (string, bool) {
	var valor string
	err := db.QueryRow("SELECT valor FROM config WHERE clave=?", clave).Scan(&valor)
	if err != nil {
		return "", false
	}
	return valor, true
}

func guardarConfig(clave, valor string) error {
	_, err := db.Exec(`INSERT INTO config(clave,valor) VALUES(?,?) ON CONFLICT(clave) DO UPDATE SET valor=excluded.valor`, clave, valor)
	return err
}

// generarVAPIDJWT crea el token que exige el estándar VAPID (RFC 8292),
// firmado en ES256 con la clave privada del servidor.
func generarVAPIDJWT(endpoint string) (string, error) {
	u, err := url.Parse(endpoint)
	if err != nil {
		return "", err
	}
	aud := u.Scheme + "://" + u.Host

	header := map[string]string{"typ": "JWT", "alg": "ES256"}
	claims := map[string]any{
		"aud": aud,
		"exp": time.Now().Add(12 * time.Hour).Unix(),
		"sub": vapidSubject,
	}

	headerJSON, _ := json.Marshal(header)
	claimsJSON, _ := json.Marshal(claims)
	signingInput := base64.RawURLEncoding.EncodeToString(headerJSON) + "." + base64.RawURLEncoding.EncodeToString(claimsJSON)

	hash := sha256.Sum256([]byte(signingInput))
	r, s, err := ecdsa.Sign(rand.Reader, vapidPrivateKey, hash[:])
	if err != nil {
		return "", err
	}
	sig := append(padTo32(r.Bytes()), padTo32(s.Bytes())...)

	return fmt.Sprintf("%s.%s", signingInput, base64.RawURLEncoding.EncodeToString(sig)), nil
}
