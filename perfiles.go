package main

import (
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// Datos personales de cada perfil (rol, avatar, cumpleaños, apodo). Los ve toda la familia.

type Perfil struct {
	UsuarioID  int    `json:"usuario_id"`
	Nombre     string `json:"nombre"`
	Rol        string `json:"rol"`
	Avatar     string `json:"avatar"`
	Nacimiento string `json:"nacimiento"`
	Apodo      string `json:"apodo"`
	Foto       int64  `json:"foto"` // 0 = sin foto; si no, marca de versión para la caché
	Frase      string `json:"frase"`
}

var rolesPerfil = map[string]bool{"": true, "papa": true, "mama": true, "hijo": true, "hija": true, "otro": true}

func listarPerfiles() []Perfil {
	out := []Perfil{}
	rows, err := db.Query(`SELECT u.id, u.nombre, COALESCE(p.rol,''), COALESCE(p.avatar,''), COALESCE(p.nacimiento,''), COALESCE(p.apodo,''), COALESCE(p.foto_v,0), COALESCE(p.frase,'')
		FROM usuarios u LEFT JOIN perfiles p ON p.usuario_id=u.id ORDER BY u.id`)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var p Perfil
		if rows.Scan(&p.UsuarioID, &p.Nombre, &p.Rol, &p.Avatar, &p.Nacimiento, &p.Apodo, &p.Foto, &p.Frase) == nil {
			out = append(out, p)
		}
	}
	return out
}

func validarPerfil(p *Perfil) string {
	p.Rol = strings.TrimSpace(p.Rol)
	if !rolesPerfil[p.Rol] {
		return "Rol no válido"
	}
	p.Avatar = strings.TrimSpace(p.Avatar)
	if utf8.RuneCountInString(p.Avatar) > 8 {
		return "Avatar no válido"
	}
	p.Apodo = strings.TrimSpace(p.Apodo)
	if utf8.RuneCountInString(p.Apodo) > 20 {
		return "El apodo es demasiado largo (máx. 20)"
	}
	p.Nacimiento = strings.TrimSpace(p.Nacimiento)
	if p.Nacimiento != "" {
		t, err := time.Parse(dateLayout, p.Nacimiento)
		if err != nil || t.Year() < 1900 || t.After(time.Now()) {
			return "Fecha de nacimiento no válida"
		}
	}
	return ""
}

func handlePerfiles(w http.ResponseWriter, r *http.Request) {
	resto := strings.Trim(strings.TrimPrefix(r.URL.Path, "/perfiles"), "/")
	switch {
	case resto == "" && r.Method == http.MethodGet:
		writeJSON(w, 200, listarPerfiles())
	case strings.Contains(resto, "/"):
		handlePerfilSub(w, r, resto)
	case resto != "" && r.Method == http.MethodPut:
		id, err := strconv.Atoi(resto)
		if err != nil || id <= 0 {
			writeError(w, 404, "No encontrado")
			return
		}
		if yo := usuarioActual(r); !puedeEditarPerfilDe(yo, id) {
			writeError(w, 403, "Solo puedes editar tu propio perfil")
			return
		}
		var existe int
		if db.QueryRow("SELECT id FROM usuarios WHERE id=?", id).Scan(&existe) != nil {
			writeError(w, 404, "Perfil no encontrado")
			return
		}
		var p Perfil
		if err := decodeJSON(r, &p); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		if msg := validarPerfil(&p); msg != "" {
			writeError(w, 400, msg)
			return
		}
		if _, err := db.Exec(`INSERT INTO perfiles(usuario_id,rol,avatar,nacimiento,apodo) VALUES(?,?,?,?,?)
			ON CONFLICT(usuario_id) DO UPDATE SET rol=excluded.rol, avatar=excluded.avatar, nacimiento=excluded.nacimiento, apodo=excluded.apodo`,
			id, p.Rol, p.Avatar, p.Nacimiento, p.Apodo); err != nil {
			writeError(w, 500, "No se pudo guardar el perfil")
			return
		}
		writeJSON(w, 200, listarPerfiles())
	default:
		writeError(w, 405, "Método no permitido")
	}
}
