package main

import (
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// Estado del día de cada persona ("💪 A tope", "🍳 Hoy cocino yo") visible para toda la
// familia en Hoy, con reacciones. Caduca solo a medianoche.

type reaccionEstado struct {
	De    string `json:"de"`
	DeID  int    `json:"de_id"`
	Emoji string `json:"emoji"`
}

type estadoDia struct {
	UsuarioID  int              `json:"usuario_id"`
	Nombre     string           `json:"nombre"`
	Emoji      string           `json:"emoji"`
	Texto      string           `json:"texto"`
	Reacciones []reaccionEstado `json:"reacciones"`
}

var emojisReaccion = map[string]bool{"❤️": true, "👏": true, "🔥": true, "😂": true, "💪": true}

func estadosDeHoy() []estadoDia {
	hoy := time.Now().Format(dateLayout)
	out := []estadoDia{}
	rows, err := db.Query(`SELECT e.usuario_id, u.nombre, e.emoji, e.texto FROM estados e JOIN usuarios u ON u.id=e.usuario_id
		WHERE e.fecha=? AND (e.emoji<>'' OR e.texto<>'') ORDER BY u.id`, hoy)
	if err != nil {
		return out
	}
	for rows.Next() {
		var e estadoDia
		if rows.Scan(&e.UsuarioID, &e.Nombre, &e.Emoji, &e.Texto) == nil {
			e.Reacciones = []reaccionEstado{}
			out = append(out, e)
		}
	}
	rows.Close()
	rr, err := db.Query(`SELECT r.estado_usuario_id, r.de_usuario_id, u.nombre, r.emoji FROM reacciones_estado r JOIN usuarios u ON u.id=r.de_usuario_id WHERE r.fecha=? ORDER BY r.rowid`, hoy)
	if err != nil {
		return out
	}
	defer rr.Close()
	for rr.Next() {
		var para int
		var x reaccionEstado
		if rr.Scan(&para, &x.DeID, &x.De, &x.Emoji) == nil {
			for i := range out {
				if out[i].UsuarioID == para {
					out[i].Reacciones = append(out[i].Reacciones, x)
				}
			}
		}
	}
	return out
}

func handleEstados(w http.ResponseWriter, r *http.Request) {
	u := usuarioActual(r)
	if u == nil {
		writeError(w, 401, "Inicia sesión con tu perfil")
		return
	}
	resto := strings.Trim(strings.TrimPrefix(r.URL.Path, "/estados"), "/")
	hoy := time.Now().Format(dateLayout)
	switch {
	case resto == "" && r.Method == http.MethodGet:
		writeJSON(w, 200, estadosDeHoy())
	case resto == "" && r.Method == http.MethodPut:
		var in struct {
			Emoji string `json:"emoji"`
			Texto string `json:"texto"`
		}
		if err := decodeJSON(r, &in); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		in.Emoji = strings.TrimSpace(in.Emoji)
		in.Texto = strings.TrimSpace(in.Texto)
		if utf8.RuneCountInString(in.Emoji) > 8 {
			writeError(w, 400, "Emoji no válido")
			return
		}
		if utf8.RuneCountInString(in.Texto) > 40 {
			writeError(w, 400, "Máximo 40 letras")
			return
		}
		if _, err := db.Exec(`INSERT INTO estados(usuario_id,emoji,texto,fecha) VALUES(?,?,?,?)
			ON CONFLICT(usuario_id) DO UPDATE SET emoji=excluded.emoji, texto=excluded.texto, fecha=excluded.fecha`, u.ID, in.Emoji, in.Texto, hoy); err != nil {
			writeError(w, 500, "No se pudo guardar")
			return
		}
		// Un estado nuevo parte sin reacciones.
		db.Exec("DELETE FROM reacciones_estado WHERE estado_usuario_id=?", u.ID)
		writeJSON(w, 200, estadosDeHoy())
	case strings.HasSuffix(resto, "/reaccion") && r.Method == http.MethodPost:
		para, err := strconv.Atoi(strings.TrimSuffix(resto, "/reaccion"))
		if err != nil || para <= 0 || para == u.ID {
			writeError(w, 400, "No puedes reaccionar a tu propio estado")
			return
		}
		var in struct {
			Emoji string `json:"emoji"`
		}
		if err := decodeJSON(r, &in); err != nil || !emojisReaccion[in.Emoji] {
			writeError(w, 400, "Reacción no válida")
			return
		}
		var actual string
		err = db.QueryRow("SELECT emoji FROM reacciones_estado WHERE estado_usuario_id=? AND de_usuario_id=? AND fecha=?", para, u.ID, hoy).Scan(&actual)
		if err == nil && actual == in.Emoji {
			db.Exec("DELETE FROM reacciones_estado WHERE estado_usuario_id=? AND de_usuario_id=? AND fecha=?", para, u.ID, hoy)
		} else {
			db.Exec("DELETE FROM reacciones_estado WHERE estado_usuario_id=? AND de_usuario_id=? AND fecha=?", para, u.ID, hoy)
			db.Exec("INSERT INTO reacciones_estado(estado_usuario_id,de_usuario_id,emoji,fecha) VALUES(?,?,?,?)", para, u.ID, in.Emoji, hoy)
			if dueno := nombreUsuario(para); dueno != "" {
				var emo, txt string
				db.QueryRow("SELECT emoji, texto FROM estados WHERE usuario_id=?", para).Scan(&emo, &txt)
				go enviarAPersona(dueno, in.Emoji+" "+u.Nombre+" ha reaccionado a tu estado", strings.TrimSpace(emo+" "+txt), "reaccion-"+strconv.Itoa(para))
			}
		}
		writeJSON(w, 200, estadosDeHoy())
	default:
		writeError(w, 405, "Método no permitido")
	}
}
