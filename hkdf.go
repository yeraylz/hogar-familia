package main

import (
	"crypto/hmac"
	"crypto/sha256"
)

// hkdfExtract implementa el paso "extract" de HKDF (RFC 5869) con SHA-256.
func hkdfExtract(salt, ikm []byte) []byte {
	if len(salt) == 0 {
		salt = make([]byte, sha256.Size)
	}
	mac := hmac.New(sha256.New, salt)
	mac.Write(ikm)
	return mac.Sum(nil)
}

// hkdfExpand implementa el paso "expand" de HKDF (RFC 5869) con SHA-256.
// Solo soportamos longitudes <= 32 bytes (es lo único que necesita Web Push),
// así que basta con un único bloque T(1) = HMAC(prk, info || 0x01).
func hkdfExpand(prk, info []byte, length int) []byte {
	mac := hmac.New(sha256.New, prk)
	mac.Write(info)
	mac.Write([]byte{0x01})
	t := mac.Sum(nil)
	return t[:length]
}
