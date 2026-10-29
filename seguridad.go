package main

import (
	"fmt"
	"log"
	"net"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	maxFallosPIN    = 5                // fallos seguidos antes de bloquear el perfil
	bloqueoPIN      = 5 * time.Minute  // primer bloqueo; cada reincidencia lo duplica
	bloqueoMaxPIN   = 24 * time.Hour   // tope del bloqueo escalonado
	olvidoFallosPIN = 15 * time.Minute // fallos sueltos más antiguos que esto no cuentan
	olvidoRondasPIN = 24 * time.Hour   // sin fallos durante este tiempo, se perdona el historial
)

type estadoPIN struct {
	fallos         int
	rondas         int // bloqueos ya cumplidos sin haber acertado el PIN
	ultimoFallo    time.Time
	bloqueadoHasta time.Time
}

// Los intentos fallidos se llevan en memoria, por perfil. Solo hay un puñado de
// perfiles, así que el mapa no puede crecer. Si el servidor se reinicia se
// pierden, pero un atacante no puede reiniciarlo.
var (
	muPIN      sync.Mutex
	estadosPIN = map[int]*estadoPIN{}
)

// bloqueoRestantePIN devuelve cuánto le falta a un perfil bloqueado (0 = libre).
func bloqueoRestantePIN(usuarioID int) time.Duration {
	muPIN.Lock()
	defer muPIN.Unlock()
	e := estadosPIN[usuarioID]
	if e == nil {
		return 0
	}
	if resto := time.Until(e.bloqueadoHasta); resto > 0 {
		return resto
	}
	return 0
}

// registrarFalloPIN apunta un PIN incorrecto y bloquea el perfil al llegar al límite.
func registrarFalloPIN(usuarioID int) {
	muPIN.Lock()
	defer muPIN.Unlock()
	ahora := time.Now()
	e := estadosPIN[usuarioID]
	if e == nil {
		e = &estadoPIN{}
		estadosPIN[usuarioID] = e
	}
	// Un bloqueo ya cumplido, o fallos muy antiguos, reinician el contador de
	// fallos (pero no las rondas: cada bloqueo seguido dura el doble).
	if (!e.bloqueadoHasta.IsZero() && ahora.After(e.bloqueadoHasta)) || ahora.Sub(e.ultimoFallo) > olvidoFallosPIN {
		e.fallos = 0
		e.bloqueadoHasta = time.Time{}
	}
	if !e.ultimoFallo.IsZero() && ahora.Sub(e.ultimoFallo) > olvidoRondasPIN {
		e.rondas = 0
	}
	e.fallos++
	e.ultimoFallo = ahora
	if e.fallos >= maxFallosPIN {
		espera := bloqueoPIN
		for i := 0; i < e.rondas && espera < bloqueoMaxPIN; i++ {
			espera *= 2
		}
		if espera > bloqueoMaxPIN {
			espera = bloqueoMaxPIN
		}
		e.rondas++
		e.fallos = 0
		e.bloqueadoHasta = ahora.Add(espera)
	}
}

// limpiarFallosPIN se llama al acertar el PIN.
func limpiarFallosPIN(usuarioID int) {
	muPIN.Lock()
	defer muPIN.Unlock()
	delete(estadosPIN, usuarioID)
}

func mensajeBloqueoPIN(resto time.Duration) string {
	mins := int(resto/time.Minute) + 1
	if mins >= 120 {
		return fmt.Sprintf("Demasiados intentos. Prueba de nuevo en %d h", (mins+59)/60)
	}
	return fmt.Sprintf("Demasiados intentos. Prueba de nuevo en %d min", mins)
}

// requiereSesion corta la petición con un 401 si no hay un perfil con sesión
// iniciada en este dispositivo. Devuelve true si se puede continuar.
func requiereSesion(w http.ResponseWriter, r *http.Request) bool {
	if usuarioActual(r) == nil {
		writeError(w, 401, "Inicia sesión con tu perfil")
		return false
	}
	return true
}

// Rutas de la API. Todas exigen sesión salvo las excepciones de rutaPublica;
// lo que no está aquí (index.html, css, js, iconos, manifest) es público
// porque no contiene datos y hace falta para mostrar la pantalla de login.
var prefijosAPI = []string{
	"/compra", "/tareas", "/eventos", "/menu", "/pagos", "/documentos",
	"/usuarios", "/perfiles", "/estados", "/sorteos", "/cuentas-atras", "/tiempo", "/backup", "/gastos", "/presupuestos", "/hipoteca", "/notas", "/enlaces", "/ajustes", "/push", "/reto",
}

func rutaPublica(r *http.Request) bool {
	p := r.URL.Path
	switch {
	case p == "/login", p == "/logout", p == "/me":
		return true // /me responde 401 por sí mismo
	case p == "/usuarios" && r.Method == http.MethodGet:
		return true // lista de perfiles para la pantalla de login
	case strings.HasPrefix(p, "/usuarios/") && strings.HasSuffix(p, "/pin") && r.Method == http.MethodPost:
		return true // primer PIN de un perfil nuevo (solo desde casa; se comprueba dentro)
	}
	return false
}

// protegerAPI envuelve el mux: cualquier ruta de datos sin sesión recibe 401.
func protegerAPI(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		for _, pre := range prefijosAPI {
			if r.URL.Path == pre || strings.HasPrefix(r.URL.Path, pre+"/") || (pre == "/menu" && strings.HasPrefix(r.URL.Path, "/menu-colegio")) {
				if !rutaPublica(r) {
					if usuarioActual(r) == nil {
						writeError(w, 401, "Inicia sesión con tu perfil")
						return
					}
				}
				break
			}
		}
		next.ServeHTTP(w, r)
	})
}

// desdeFueraDeCasa dice si la petición llegó por el túnel de Cloudflare
// (que añade estas cabeceras) en vez de por la red local.
func desdeFueraDeCasa(r *http.Request) bool {
	return r.Header.Get("Cf-Connecting-Ip") != "" || r.Header.Get("X-Forwarded-For") != "" || r.Header.Get("Cf-Ray") != ""
}

// ---------- IP real del visitante ----------

// ipCliente devuelve la IP de quien hace la petición. Detrás del proxy inverso la
// conexión llega desde una IP privada (el proxy), así que solo en ese caso se
// confía en las cabeceras que él añade (X-Real-IP, o la última de X-Forwarded-For,
// que es la que añade el propio proxy y no se puede falsear desde fuera).
func ipCliente(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	ip := net.ParseIP(host)
	if ip != nil && (ip.IsPrivate() || ip.IsLoopback()) {
		if v := strings.TrimSpace(r.Header.Get("X-Real-Ip")); net.ParseIP(v) != nil {
			return v
		}
		if v := r.Header.Get("X-Forwarded-For"); v != "" {
			partes := strings.Split(v, ",")
			if u := strings.TrimSpace(partes[len(partes)-1]); net.ParseIP(u) != nil {
				return u
			}
		}
	}
	return host
}

// ---------- Límite de intentos de acceso por IP ----------
// Además del bloqueo por perfil: una misma IP que falla muchos PIN (en cualquier
// perfil) queda bloqueada un rato. Así no puede ir probando perfil tras perfil.

const (
	maxFallosIP     = 12
	ventanaFallosIP = 15 * time.Minute
	bloqueoIP       = 30 * time.Minute
)

type estadoIP struct {
	fallos         int
	desde          time.Time
	bloqueadoHasta time.Time
}

var (
	muIP      sync.Mutex
	estadosIP = map[string]*estadoIP{}
)

func bloqueoRestanteIP(ip string) time.Duration {
	muIP.Lock()
	defer muIP.Unlock()
	if e := estadosIP[ip]; e != nil {
		if resto := time.Until(e.bloqueadoHasta); resto > 0 {
			return resto
		}
	}
	return 0
}

// registrarFalloIP apunta un fallo y devuelve true si con él la IP queda bloqueada.
func registrarFalloIP(ip string) bool {
	muIP.Lock()
	defer muIP.Unlock()
	ahora := time.Now()
	// Limpieza: el mapa no puede crecer sin fin si alguien prueba desde muchas IPs.
	if len(estadosIP) > 2000 {
		for k, v := range estadosIP {
			if ahora.After(v.bloqueadoHasta) && ahora.Sub(v.desde) > ventanaFallosIP {
				delete(estadosIP, k)
			}
		}
	}
	e := estadosIP[ip]
	if e == nil {
		e = &estadoIP{desde: ahora}
		estadosIP[ip] = e
	}
	if ahora.Sub(e.desde) > ventanaFallosIP {
		e.fallos = 0
		e.desde = ahora
	}
	e.fallos++
	if e.fallos >= maxFallosIP {
		e.fallos = 0
		e.desde = ahora
		e.bloqueadoHasta = ahora.Add(bloqueoIP)
		return true
	}
	return false
}

func limpiarFallosIP(ip string) {
	muIP.Lock()
	defer muIP.Unlock()
	delete(estadosIP, ip)
}

// avisarIntrusion manda una notificación a la familia y deja constancia en el registro.
func avisarIntrusion(titulo, detalle string) {
	log.Printf("seguridad: %s", titulo) // el detalle (con la IP) solo va en el aviso a la familia
	go enviarATodos("🔒 "+titulo, detalle, "seguridad-"+time.Now().Format("200601021504"))
}

// ---------- Cabeceras de seguridad ----------

func cabecerasSeguridad(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("X-Frame-Options", "DENY")
		h.Set("Referrer-Policy", "same-origin")
		h.Set("Permissions-Policy", "geolocation=(), microphone=(self), camera=()")
		// CSP mínima: no limita scripts ni estilos (la app usa CDNs), pero impide
		// meter la app en un marco ajeno, cambiar la base de las URLs o enviar formularios fuera.
		h.Set("Content-Security-Policy", "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'")
		if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
			h.Set("Strict-Transport-Security", "max-age=31536000")
		}
		next.ServeHTTP(w, r)
	})
}

// ipAnonima recorta una IP para los registros: IPv4 sin el último número, IPv6 solo con el prefijo.
func ipAnonima(ip string) string {
	p := net.ParseIP(ip)
	if p == nil {
		return "?"
	}
	if v4 := p.To4(); v4 != nil {
		return strconv.Itoa(int(v4[0])) + "." + strconv.Itoa(int(v4[1])) + "." + strconv.Itoa(int(v4[2])) + ".0"
	}
	return p.Mask(net.CIDRMask(48, 128)).String() + "/48"
}
