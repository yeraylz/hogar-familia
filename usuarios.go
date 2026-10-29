package main

import (
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"database/sql"
	"encoding/hex"
	"errors"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const cookieSesion = "sesion_hogar"
const duracionSesion = 365 * 24 * time.Hour

// pinValido: PIN que se acepta al iniciar sesión (los antiguos de 4 dígitos siguen valiendo).
// pinNuevoValido: PIN que se acepta al crear o cambiar uno (6 dígitos).
var (
	pinValido      = regexp.MustCompile(`^(\d{4}|\d{6})$`)
	pinNuevoValido = regexp.MustCompile(`^\d{6}$`)
)

type Usuario struct {
	ID             int    `json:"id"`
	Nombre         string `json:"nombre"`
	PinConfigurado bool   `json:"pin_configurado"`
	Avatar         string `json:"avatar,omitempty"`
	Rol            string `json:"rol,omitempty"`
	Apodo          string `json:"apodo,omitempty"`
}

// derivarPIN aplica un hash iterado (HMAC-SHA256 encadenado) con sal aleatoria.
// No es bcrypt/argon2, pero para un PIN de 4 dígitos que solo sirve para que la
// app familiar sepa "quién eres" (el acceso real ya lo filtra Cloudflare Access
// por delante), este nivel es proporcionado: evita guardar el PIN en claro sin
// añadir una dependencia externa que este entorno no puede descargar.
func derivarPIN(pin, salt []byte) []byte {
	const iteraciones = 100000
	h := sha256.Sum256(append(append([]byte{}, salt...), pin...))
	for i := 0; i < iteraciones; i++ {
		mac := hmac.New(sha256.New, salt)
		mac.Write(h[:])
		copy(h[:], mac.Sum(nil))
	}
	return h[:]
}

// pinCoincide compara un PIN con el hash guardado (hex) y su sal (hex).
func pinCoincide(pin, hashHex, saltHex string) bool {
	salt, _ := hex.DecodeString(saltHex)
	guardado, _ := hex.DecodeString(hashHex)
	return subtle.ConstantTimeCompare(derivarPIN([]byte(pin), salt), guardado) == 1
}

func generarTokenAleatorio() (string, error) {
	b := make([]byte, 32)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}

// usuarioActual lee la cookie de sesión y devuelve el usuario logueado en este
// dispositivo, o nil si no hay sesión válida (no es un error: significa "aún
// no ha elegido quién es en este móvil").
func usuarioActual(r *http.Request) *Usuario {
	c, err := r.Cookie(cookieSesion)
	if err != nil || c.Value == "" {
		return nil
	}
	var u Usuario
	var pinHash string
	// Si la BBDD está ocupada un instante, se reintenta: un fallo transitorio no
	// debe contar como "sesión inexistente" (te sacaría a la pantalla del PIN).
	for intento := 0; intento < 5; intento++ {
		err = db.QueryRow(`SELECT u.id, u.nombre, u.pin_hash FROM sesiones s
			JOIN usuarios u ON u.id = s.usuario_id WHERE s.token = ?`, c.Value).
			Scan(&u.ID, &u.Nombre, &pinHash)
		if err == nil || errors.Is(err, sql.ErrNoRows) {
			break
		}
		log.Printf("usuarioActual: error de BBDD (intento %d): %v", intento+1, err)
		time.Sleep(200 * time.Millisecond)
	}
	if err != nil {
		return nil
	}
	u.PinConfigurado = pinHash != ""
	return &u
}

func ponerCookieSesion(w http.ResponseWriter, r *http.Request, token string) {
	seguro := r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
	http.SetCookie(w, &http.Cookie{
		Name:     cookieSesion,
		Value:    token,
		Path:     "/",
		Expires:  time.Now().Add(duracionSesion),
		HttpOnly: true,
		Secure:   seguro,
		SameSite: http.SameSiteLaxMode,
	})
}

func handleUsuarios(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, 405, "Método no permitido")
		return
	}
	yo := usuarioActual(r)
	rows, err := db.Query("SELECT u.id, u.nombre, u.pin_hash, COALESCE(p.avatar,''), COALESCE(p.rol,''), COALESCE(p.apodo,''), u.oculto_login FROM usuarios u LEFT JOIN perfiles p ON p.usuario_id=u.id ORDER BY u.id ASC")
	if err != nil {
		writeError(w, 500, "No se pudieron cargar los usuarios")
		return
	}
	defer rows.Close()
	lista := []Usuario{}
	for rows.Next() {
		var u Usuario
		var pinHash string
		var oculto bool
		if err := rows.Scan(&u.ID, &u.Nombre, &pinHash, &u.Avatar, &u.Rol, &u.Apodo, &oculto); err != nil {
			writeError(w, 500, "Error al leer los usuarios")
			return
		}
		u.PinConfigurado = pinHash != ""
		if !usuarioVisiblePara(yo, u.ID) {
			continue
		}
		// Oculto solo en la pantalla de "quién eres" (sin sesión): sigue existiendo
		// para todo lo demás (tareas, calendario, pagos...), solo que nadie puede
		// elegirlo para entrar sin saber ya su usuario/arroba.
		if oculto && yo == nil {
			continue
		}
		lista = append(lista, u)
	}
	writeJSON(w, 200, lista)
}

func handleMe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, 405, "Método no permitido")
		return
	}
	u := usuarioActual(r)
	if u == nil {
		// Se deja constancia de por qué: así se distingue "el móvil no envía la cookie"
		// de "la sesión ya no existe en el servidor".
		motivo := "el navegador no ha enviado la cookie de sesión"
		if c, err := r.Cookie(cookieSesion); err == nil && c.Value != "" {
			motivo = "la sesión de la cookie no existe en el servidor"
		}
		log.Printf("me: sin sesión (%s) red %s", motivo, ipAnonima(ipCliente(r)))
		writeError(w, 401, "Sin sesión")
		return
	}
	// Sesión deslizante: cada vez que se abre la app, la cookie se renueva un año más.
	if c, err := r.Cookie(cookieSesion); err == nil && c.Value != "" {
		ponerCookieSesion(w, r, c.Value)
	}
	db.QueryRow("SELECT COALESCE(avatar,''), COALESCE(rol,''), COALESCE(apodo,'') FROM perfiles WHERE usuario_id=?", u.ID).Scan(&u.Avatar, &u.Rol, &u.Apodo)
	writeJSON(w, 200, u)
}

// parseIDConSufijo extrae el ID numérico de rutas con un segmento extra,
// como /usuarios/3/pin o /usuarios/3/cambiar-pin.
func parseIDConSufijo(r *http.Request) (int, error) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) != 3 {
		return 0, errors.New("ID inválido")
	}
	id, err := strconv.Atoi(parts[1])
	if err != nil || id <= 0 {
		return 0, errors.New("ID inválido")
	}
	return id, nil
}

// handleUsuarioPin crea el PIN la primera vez (no hay uno ya guardado).
func handleUsuarioPin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeError(w, 405, "Método no permitido")
		return
	}
	if desdeFueraDeCasa(r) {
		writeError(w, 403, "El primer PIN de un perfil solo se puede crear desde la red de casa")
		return
	}
	id, err := parseIDConSufijo(r)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	var body struct {
		Pin string `json:"pin"`
	}
	if err := decodeJSON(r, &body); err != nil || !pinNuevoValido.MatchString(body.Pin) {
		writeError(w, 400, "El PIN debe tener 6 dígitos")
		return
	}

	var pinHashActual string
	if err := db.QueryRow("SELECT pin_hash FROM usuarios WHERE id=?", id).Scan(&pinHashActual); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, 404, "Usuario no encontrado")
			return
		}
		writeError(w, 500, "No se pudo comprobar el usuario")
		return
	}
	if pinHashActual != "" {
		writeError(w, 400, "Este perfil ya tiene un PIN. Usa 'cambiar PIN' en su lugar")
		return
	}

	salt := make([]byte, 16)
	if _, err := rand.Read(salt); err != nil {
		writeError(w, 500, "No se pudo generar el PIN")
		return
	}
	hash := derivarPIN([]byte(body.Pin), salt)
	if _, err := db.Exec("UPDATE usuarios SET pin_hash=?, pin_salt=? WHERE id=?",
		hex.EncodeToString(hash), hex.EncodeToString(salt), id); err != nil {
		writeError(w, 500, "No se pudo guardar el PIN")
		return
	}

	token, err := generarTokenAleatorio()
	if err != nil {
		writeError(w, 500, "No se pudo iniciar sesión")
		return
	}
	if _, err := db.Exec("INSERT INTO sesiones(token, usuario_id) VALUES(?,?)", token, id); err != nil {
		writeError(w, 500, "No se pudo iniciar sesión")
		return
	}
	ponerCookieSesion(w, r, token)
	writeJSON(w, 200, map[string]bool{"success": true})
}

// handleUsuarioCambiarPin cambia el PIN de un usuario que ya tiene uno,
// exigiendo el PIN actual y que la sesión activa sea la de ese mismo usuario.
func handleUsuarioCambiarPin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeError(w, 405, "Método no permitido")
		return
	}
	id, err := parseIDConSufijo(r)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	actual := usuarioActual(r)
	if actual == nil || actual.ID != id {
		writeError(w, 403, "Tienes que haber iniciado sesión como ese usuario")
		return
	}
	var body struct {
		PinActual string `json:"pin_actual"`
		PinNuevo  string `json:"pin_nuevo"`
	}
	if err := decodeJSON(r, &body); err != nil || !pinNuevoValido.MatchString(body.PinNuevo) {
		writeError(w, 400, "El PIN nuevo debe tener 6 dígitos")
		return
	}

	var pinHashHex, saltHex string
	if err := db.QueryRow("SELECT pin_hash, pin_salt FROM usuarios WHERE id=?", id).Scan(&pinHashHex, &saltHex); err != nil {
		writeError(w, 500, "No se pudo comprobar el usuario")
		return
	}
	if resto := bloqueoRestantePIN(id); resto > 0 {
		writeError(w, 429, mensajeBloqueoPIN(resto))
		return
	}
	salt, _ := hex.DecodeString(saltHex)
	hashGuardado, _ := hex.DecodeString(pinHashHex)
	if subtle.ConstantTimeCompare(derivarPIN([]byte(body.PinActual), salt), hashGuardado) != 1 {
		registrarFalloPIN(id)
		writeError(w, 400, "El PIN actual no es correcto")
		return
	}
	limpiarFallosPIN(id)

	nuevaSalt := make([]byte, 16)
	if _, err := rand.Read(nuevaSalt); err != nil {
		writeError(w, 500, "No se pudo cambiar el PIN")
		return
	}
	nuevoHash := derivarPIN([]byte(body.PinNuevo), nuevaSalt)
	if _, err := db.Exec("UPDATE usuarios SET pin_hash=?, pin_salt=? WHERE id=?",
		hex.EncodeToString(nuevoHash), hex.EncodeToString(nuevaSalt), id); err != nil {
		writeError(w, 500, "No se pudo cambiar el PIN")
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}

func handleLogin(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeError(w, 405, "Método no permitido")
		return
	}
	var body struct {
		UsuarioID int    `json:"usuario_id"`
		Pin       string `json:"pin"`
	}
	if err := decodeJSON(r, &body); err != nil || !pinValido.MatchString(body.Pin) {
		writeError(w, 400, "PIN inválido")
		return
	}
	ip := ipCliente(r)
	if resto := bloqueoRestanteIP(ip); resto > 0 {
		writeError(w, 429, mensajeBloqueoPIN(resto))
		return
	}
	if resto := bloqueoRestantePIN(body.UsuarioID); resto > 0 {
		writeError(w, 429, mensajeBloqueoPIN(resto))
		return
	}

	var pinHashHex, saltHex string
	err := db.QueryRow("SELECT pin_hash, pin_salt FROM usuarios WHERE id=?", body.UsuarioID).Scan(&pinHashHex, &saltHex)
	if err != nil || pinHashHex == "" {
		writeError(w, 401, "Usuario o PIN incorrecto")
		return
	}
	salt, _ := hex.DecodeString(saltHex)
	hashGuardado, _ := hex.DecodeString(pinHashHex)
	if subtle.ConstantTimeCompare(derivarPIN([]byte(body.Pin), salt), hashGuardado) != 1 {
		registrarFalloPIN(body.UsuarioID)
		log.Printf("login: PIN incorrecto (perfil %d, red %s)", body.UsuarioID, ipAnonima(ip))
		if registrarFalloIP(ip) {
			avisarIntrusion("Muchos intentos fallidos", "La IP "+ip+" ha fallado muchos PIN y queda bloqueada 30 minutos.")
		}
		if resto := bloqueoRestantePIN(body.UsuarioID); resto > 0 {
			var nombre string
			_ = db.QueryRow("SELECT nombre FROM usuarios WHERE id=?", body.UsuarioID).Scan(&nombre)
			avisarIntrusion("Perfil bloqueado", "El perfil "+nombre+" se ha bloqueado por PIN incorrecto repetido (IP "+ip+"). Si no has sido tú o alguien de casa, cambia el PIN.")
			writeError(w, 429, mensajeBloqueoPIN(resto))
			return
		}
		writeError(w, 401, "Usuario o PIN incorrecto")
		return
	}
	limpiarFallosPIN(body.UsuarioID)
	limpiarFallosIP(ip)

	token, err := generarTokenAleatorio()
	if err != nil {
		writeError(w, 500, "No se pudo iniciar sesión")
		return
	}
	if _, err := db.Exec("INSERT INTO sesiones(token, usuario_id) VALUES(?,?)", token, body.UsuarioID); err != nil {
		writeError(w, 500, "No se pudo iniciar sesión")
		return
	}
	ponerCookieSesion(w, r, token)
	writeJSON(w, 200, map[string]bool{"success": true})
}

func handleLogout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeError(w, 405, "Método no permitido")
		return
	}
	if c, err := r.Cookie(cookieSesion); err == nil {
		db.Exec("DELETE FROM sesiones WHERE token=?", c.Value)
	}
	http.SetCookie(w, &http.Cookie{Name: cookieSesion, Value: "", Path: "/", Expires: time.Unix(0, 0), MaxAge: -1})
	writeJSON(w, 200, map[string]bool{"success": true})
}

// usuarioVisiblePara: todos los perfiles de la familia se ven entre sí (no hay invitados).
func usuarioVisiblePara(yo *Usuario, id int) bool {
	return true
}
