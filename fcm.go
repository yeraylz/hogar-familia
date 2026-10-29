package main

import (
	"bytes"
	"crypto"
	"crypto/rand"
	"crypto/rsa"
	"crypto/sha256"
	"crypto/x509"
	"encoding/base64"
	"encoding/json"
	"encoding/pem"
	"errors"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

// Avisos a la app de Android (APK con WebView) por Firebase Cloud Messaging (API HTTP v1).
// Hace falta la cuenta de servicio de Firebase en data/fcm-service-account.json; sin ella no se envía nada
// y la web sigue usando los avisos web de siempre. El mensaje solo lleva título, texto y etiqueta (nunca el contenido del chat).

type cuentaFCM struct {
	ProjectID   string `json:"project_id"`
	ClientEmail string `json:"client_email"`
	PrivateKey  string `json:"private_key"`
	TokenURI    string `json:"token_uri"`
}

var fcm struct {
	mu      sync.Mutex
	cuenta  *cuentaFCM
	clave   *rsa.PrivateKey
	token   string
	expira  time.Time
	cargada bool
}

func fcmCargar() *cuentaFCM {
	fcm.mu.Lock()
	defer fcm.mu.Unlock()
	if fcm.cargada {
		return fcm.cuenta
	}
	fcm.cargada = true
	b, err := os.ReadFile(filepath.Join(filepath.Dir(dbFile), "fcm-service-account.json"))
	if err != nil {
		return nil
	}
	var c cuentaFCM
	if json.Unmarshal(b, &c) != nil || c.ProjectID == "" || c.ClientEmail == "" || c.PrivateKey == "" {
		log.Printf("fcm: fcm-service-account.json no es válido")
		return nil
	}
	if c.TokenURI == "" {
		c.TokenURI = "https://oauth2.googleapis.com/token"
	}
	blk, _ := pem.Decode([]byte(c.PrivateKey))
	if blk == nil {
		log.Printf("fcm: clave privada ilegible")
		return nil
	}
	k, err := x509.ParsePKCS8PrivateKey(blk.Bytes)
	rk, ok := k.(*rsa.PrivateKey)
	if err != nil || !ok {
		log.Printf("fcm: la clave privada no es RSA")
		return nil
	}
	fcm.cuenta, fcm.clave = &c, rk
	log.Printf("fcm: activado para el proyecto %s", c.ProjectID)
	return fcm.cuenta
}

func b64url(b []byte) string { return base64.RawURLEncoding.EncodeToString(b) }

func fcmAccessToken(c *cuentaFCM) (string, error) {
	fcm.mu.Lock()
	defer fcm.mu.Unlock()
	if fcm.token != "" && time.Now().Before(fcm.expira.Add(-2*time.Minute)) {
		return fcm.token, nil
	}
	ahora := time.Now().Unix()
	cab, _ := json.Marshal(map[string]string{"alg": "RS256", "typ": "JWT"})
	cla, _ := json.Marshal(map[string]any{"iss": c.ClientEmail, "scope": "https://www.googleapis.com/auth/firebase.messaging", "aud": c.TokenURI, "iat": ahora, "exp": ahora + 3600})
	firmando := b64url(cab) + "." + b64url(cla)
	h := sha256.Sum256([]byte(firmando))
	sig, err := rsa.SignPKCS1v15(rand.Reader, fcm.clave, crypto.SHA256, h[:])
	if err != nil {
		return "", err
	}
	resp, err := http.PostForm(c.TokenURI, url.Values{"grant_type": {"urn:ietf:params:oauth:grant-type:jwt-bearer"}, "assertion": {firmando + "." + b64url(sig)}})
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	cuerpo, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	var r struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if resp.StatusCode != 200 || json.Unmarshal(cuerpo, &r) != nil || r.AccessToken == "" {
		return "", errors.New("fcm: no se pudo obtener el token de acceso: " + resp.Status)
	}
	fcm.token = r.AccessToken
	fcm.expira = time.Now().Add(time.Duration(r.ExpiresIn) * time.Second)
	return fcm.token, nil
}

// enviarFCM manda un aviso a un dispositivo. caducado=true si el token ya no vale y hay que borrarlo.
func enviarFCM(token, titulo, cuerpo, tag string) (caducado bool, err error) {
	c := fcmCargar()
	if c == nil {
		return false, errors.New("fcm no configurado")
	}
	at, err := fcmAccessToken(c)
	if err != nil {
		return false, err
	}
	msg := map[string]any{"message": map[string]any{
		"token":   token,
		"data":    map[string]string{"title": titulo, "body": cuerpo, "tag": tag},
		"android": map[string]any{"priority": "HIGH"},
	}}
	b, _ := json.Marshal(msg)
	req, _ := http.NewRequest("POST", "https://fcm.googleapis.com/v1/projects/"+c.ProjectID+"/messages:send", bytes.NewReader(b))
	req.Header.Set("Authorization", "Bearer "+at)
	req.Header.Set("Content-Type", "application/json")
	resp, err := (&http.Client{Timeout: 15 * time.Second}).Do(req)
	if err != nil {
		return false, err
	}
	defer resp.Body.Close()
	res, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<16))
	if resp.StatusCode == 200 {
		return false, nil
	}
	txt := string(res)
	if resp.StatusCode == 404 || strings.Contains(txt, "UNREGISTERED") || strings.Contains(txt, "INVALID_ARGUMENT") {
		return true, errors.New("fcm: token caducado")
	}
	return false, errors.New("fcm: " + resp.Status + " " + txt)
}

// enviarNativos avisa a las apps de Android de quien corresponda (mismo filtro que los avisos web).
func enviarNativos(titulo, cuerpo, tag, filtro string, args ...any) {
	if fcmCargar() == nil {
		return
	}
	// El filtro está escrito para la tabla de avisos web; aquí se aplica a la de móviles.
	filtro = strings.ReplaceAll(filtro, "push_subscripciones", "push_nativo")
	rows, err := db.Query("SELECT id,token FROM push_nativo "+filtro, args...)
	if err != nil {
		log.Printf("fcm: error leyendo móviles: %v", err)
		return
	}
	type d struct {
		id    int
		token string
	}
	var l []d
	for rows.Next() {
		var x d
		if rows.Scan(&x.id, &x.token) == nil {
			l = append(l, x)
		}
	}
	rows.Close()
	if len(l) > 0 {
		log.Printf("fcm: avisando a %d móvil(es) (%s)", len(l), tag)
	}
	for _, x := range l {
		cad, err := enviarFCM(x.token, titulo, cuerpo, tag)
		if cad {
			log.Printf("fcm: móvil %d caducado, se borra", x.id)
			db.Exec("DELETE FROM push_nativo WHERE id=?", x.id)
		} else if err != nil {
			log.Printf("fcm: error enviando a %d: %v", x.id, err)
		} else {
			log.Printf("fcm: aviso aceptado por Google para el móvil %d", x.id)
		}
	}
}

// handlePushNativo: POST /push/native {token} registra este móvil; DELETE {token} lo quita.
func handlePushNativo(w http.ResponseWriter, r *http.Request) {
	u := usuarioActual(r)
	if u == nil {
		writeError(w, 401, "Sesión no válida")
		return
	}
	var in struct {
		Token string `json:"token"`
	}
	if err := decodeJSON(r, &in); err != nil || len(in.Token) < 20 || len(in.Token) > 1024 {
		writeError(w, 400, "Token inválido")
		return
	}
	switch r.Method {
	case http.MethodPost:
		db.Exec(`INSERT INTO push_nativo(token,persona,origen,creado) VALUES(?,?,?,?)
			ON CONFLICT(token) DO UPDATE SET persona=excluded.persona, origen=excluded.origen`,
			in.Token, u.Nombre, strings.ToLower(r.Host), time.Now().UTC().Format(time.RFC3339))
	case http.MethodDelete:
		db.Exec("DELETE FROM push_nativo WHERE token=? AND persona=? COLLATE NOCASE", in.Token, u.Nombre)
	default:
		writeError(w, 405, "Método no permitido")
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}
