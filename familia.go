package main

import (
	"crypto/rand"
	"math/big"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// Ruleta para decidir quién hace una tarea, y cuentas atrás para fechas señaladas.

func nombreUsuario(id int) string {
	var n string
	db.QueryRow("SELECT nombre FROM usuarios WHERE id=?", id).Scan(&n)
	return n
}

// ---------- Ruleta ----------

type sorteo struct {
	ID        int    `json:"id"`
	Pregunta  string `json:"pregunta"`
	Ganador   string `json:"ganador"`
	GanadorID int    `json:"ganador_id"`
	De        string `json:"de"`
	Creado    string `json:"creado"`
}

func sorteosDeHoy() []sorteo {
	out := []sorteo{}
	hoy := time.Now().Format(dateLayout)
	// Los de hace más de una semana se limpian solos.
	db.Exec("DELETE FROM sorteos WHERE substr(creado,1,10) < ?", time.Now().AddDate(0, 0, -7).Format(dateLayout))
	rows, err := db.Query(`SELECT s.id, s.pregunta, s.ganador_id, COALESCE(g.nombre,''), COALESCE(d.nombre,''), s.creado
		FROM sorteos s LEFT JOIN usuarios g ON g.id=s.ganador_id LEFT JOIN usuarios d ON d.id=s.de_id
		WHERE substr(s.creado,1,10)=? ORDER BY s.id DESC LIMIT 6`, hoy)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var s sorteo
		if rows.Scan(&s.ID, &s.Pregunta, &s.GanadorID, &s.Ganador, &s.De, &s.Creado) == nil {
			out = append(out, s)
		}
	}
	return out
}

func handleSorteos(w http.ResponseWriter, r *http.Request) {
	u := usuarioActual(r)
	if u == nil {
		writeError(w, 401, "Inicia sesión con tu perfil")
		return
	}
	if resto := strings.Trim(strings.TrimPrefix(r.URL.Path, "/sorteos"), "/"); resto != "" {
		id, err := strconv.Atoi(resto)
		if r.Method != http.MethodDelete || err != nil || id <= 0 {
			writeError(w, 404, "No encontrado")
			return
		}
		db.Exec("DELETE FROM sorteos WHERE id=?", id)
		writeJSON(w, 200, sorteosDeHoy())
		return
	}
	switch r.Method {
	case http.MethodGet:
		writeJSON(w, 200, sorteosDeHoy())
	case http.MethodPost:
		var in struct {
			Pregunta      string `json:"pregunta"`
			Participantes []int  `json:"participantes"`
		}
		if err := decodeJSON(r, &in); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		in.Pregunta = strings.TrimSpace(in.Pregunta)
		if in.Pregunta == "" || utf8.RuneCountInString(in.Pregunta) > 60 {
			writeError(w, 400, "Escribe la pregunta (máx. 60 letras)")
			return
		}
		var candidatos []int
		for _, id := range in.Participantes {
			if nombreUsuario(id) != "" {
				candidatos = append(candidatos, id)
			}
		}
		if len(candidatos) < 2 {
			writeError(w, 400, "Elige al menos 2 participantes")
			return
		}
		n, err := rand.Int(rand.Reader, big.NewInt(int64(len(candidatos))))
		if err != nil {
			writeError(w, 500, "No se pudo sortear")
			return
		}
		ganador := candidatos[n.Int64()]
		if _, err := db.Exec("INSERT INTO sorteos(de_id,pregunta,ganador_id,creado) VALUES(?,?,?,?)", u.ID, in.Pregunta, ganador, time.Now().Format(time.RFC3339)); err != nil {
			writeError(w, 500, "No se pudo guardar el sorteo")
			return
		}
		go enviarAOtros(u.Nombre, "🎲 La ruleta ha hablado", in.Pregunta+" → "+nombreUsuario(ganador), "ruleta")
		writeJSON(w, 201, map[string]any{"ganador_id": ganador, "sorteos": sorteosDeHoy()})
	default:
		w.Header().Set("Allow", "GET, POST")
		writeError(w, 405, "Método no permitido")
	}
}

// ---------- Cuentas atrás ----------

type cuentaAtras struct {
	ID     int    `json:"id"`
	Titulo string `json:"titulo"`
	Fecha  string `json:"fecha"`
	Emoji  string `json:"emoji"`
	De     string `json:"de"`
}

func listarCuentasAtras() []cuentaAtras {
	out := []cuentaAtras{}
	hoy := time.Now()
	// Las que pasaron hace más de una semana se limpian solas.
	db.Exec("DELETE FROM cuentas_atras WHERE fecha < ?", hoy.AddDate(0, 0, -7).Format(dateLayout))
	rows, err := db.Query(`SELECT c.id, c.titulo, c.fecha, c.emoji, COALESCE(u.nombre,'') FROM cuentas_atras c
		LEFT JOIN usuarios u ON u.id=c.de_id WHERE c.fecha >= ? ORDER BY c.fecha, c.id`, hoy.Format(dateLayout))
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var c cuentaAtras
		if rows.Scan(&c.ID, &c.Titulo, &c.Fecha, &c.Emoji, &c.De) == nil {
			out = append(out, c)
		}
	}
	return out
}

func handleCuentasAtras(w http.ResponseWriter, r *http.Request) {
	u := usuarioActual(r)
	if u == nil {
		writeError(w, 401, "Inicia sesión con tu perfil")
		return
	}
	resto := strings.Trim(strings.TrimPrefix(r.URL.Path, "/cuentas-atras"), "/")
	switch {
	case resto == "" && r.Method == http.MethodGet:
		writeJSON(w, 200, listarCuentasAtras())
	case resto == "" && r.Method == http.MethodPost:
		var in cuentaAtras
		if err := decodeJSON(r, &in); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		in.Titulo = strings.TrimSpace(in.Titulo)
		in.Emoji = strings.TrimSpace(in.Emoji)
		if in.Titulo == "" || utf8.RuneCountInString(in.Titulo) > 40 {
			writeError(w, 400, "Pon un nombre de hasta 40 letras")
			return
		}
		if utf8.RuneCountInString(in.Emoji) > 8 {
			writeError(w, 400, "Emoji no válido")
			return
		}
		f, err := time.Parse(dateLayout, strings.TrimSpace(in.Fecha))
		if err != nil || f.Before(time.Now().AddDate(0, 0, -1)) || f.Year() > time.Now().Year()+10 {
			writeError(w, 400, "Fecha no válida (tiene que ser de hoy en adelante)")
			return
		}
		var n int
		db.QueryRow("SELECT COUNT(*) FROM cuentas_atras").Scan(&n)
		if n >= 30 {
			writeError(w, 400, "Hay demasiadas cuentas atrás; borra alguna")
			return
		}
		if _, err := db.Exec("INSERT INTO cuentas_atras(titulo,fecha,emoji,de_id) VALUES(?,?,?,?)", in.Titulo, f.Format(dateLayout), in.Emoji, u.ID); err != nil {
			writeError(w, 500, "No se pudo guardar")
			return
		}
		writeJSON(w, 201, listarCuentasAtras())
	case resto != "" && r.Method == http.MethodDelete:
		id, err := strconv.Atoi(resto)
		if err != nil || id <= 0 {
			writeError(w, 404, "No encontrado")
			return
		}
		db.Exec("DELETE FROM cuentas_atras WHERE id=?", id)
		writeJSON(w, 200, listarCuentasAtras())
	default:
		writeError(w, 405, "Método no permitido")
	}
}
