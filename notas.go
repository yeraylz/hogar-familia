package main

import (
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

const maxCaracteresNota = 500

type Nota struct {
	ID     int    `json:"id"`
	Tipo   string `json:"tipo"`
	RefID  int    `json:"ref_id"`
	Autor  string `json:"autor"`
	Texto  string `json:"texto"`
	Creado string `json:"creado"`
}

// Tipos de elemento a los que se pueden pegar notas, y su tabla. El nombre de
// la tabla sale siempre de este mapa (nunca del usuario), así que es seguro
// usarlo para montar la consulta de comprobación.
var tablasNotas = map[string]string{
	"evento": "eventos",
	"tarea":  "tareas",
	"pago":   "pagos",
}

func handleNotas(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		tipo := r.URL.Query().Get("tipo")
		ref, err := strconv.Atoi(r.URL.Query().Get("ref"))
		if _, ok := tablasNotas[tipo]; !ok || err != nil || ref <= 0 {
			writeError(w, 400, "Parámetros inválidos")
			return
		}
		rows, err := db.Query(`SELECT id,tipo,ref_id,autor,texto,creado FROM comentarios
			WHERE tipo=? AND ref_id=? ORDER BY id ASC`, tipo, ref)
		if err != nil {
			writeError(w, 500, "No se pudieron cargar las notas")
			return
		}
		defer rows.Close()
		lista := []Nota{}
		for rows.Next() {
			var n Nota
			if err := rows.Scan(&n.ID, &n.Tipo, &n.RefID, &n.Autor, &n.Texto, &n.Creado); err != nil {
				writeError(w, 500, "Error al leer las notas")
				return
			}
			lista = append(lista, n)
		}
		writeJSON(w, 200, lista)

	case http.MethodPost:
		var body struct {
			Tipo  string `json:"tipo"`
			RefID int    `json:"ref_id"`
			Texto string `json:"texto"`
		}
		if err := decodeJSON(r, &body); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		texto := strings.TrimSpace(body.Texto)
		if texto == "" {
			writeError(w, 400, "La nota no puede estar vacía")
			return
		}
		if utf8.RuneCountInString(texto) > maxCaracteresNota {
			writeError(w, 400, "La nota es demasiado larga (máximo 500 caracteres)")
			return
		}
		tabla, ok := tablasNotas[body.Tipo]
		if !ok || body.RefID <= 0 {
			writeError(w, 400, "Tipo o elemento inválido")
			return
		}
		var existe int
		if err := db.QueryRow("SELECT COUNT(*) FROM "+tabla+" WHERE id=?", body.RefID).Scan(&existe); err != nil || existe == 0 {
			writeError(w, 404, "El elemento ya no existe")
			return
		}

		autor := "Alguien"
		if u := usuarioActual(r); u != nil {
			autor = u.Nombre
		}
		creado := time.Now().Format("2006-01-02 15:04:05")

		res, err := db.Exec(`INSERT INTO comentarios(tipo,ref_id,autor,texto,creado) VALUES(?,?,?,?,?)`,
			body.Tipo, body.RefID, autor, texto, creado)
		if err != nil {
			writeError(w, 500, "No se pudo guardar la nota")
			return
		}
		id, _ := res.LastInsertId()
		writeJSON(w, 201, Nota{ID: int(id), Tipo: body.Tipo, RefID: body.RefID, Autor: autor, Texto: texto, Creado: creado})

	default:
		w.Header().Set("Allow", "GET, POST")
		writeError(w, 405, "Método no permitido")
	}
}

// handleNotasConteo devuelve cuántas notas tiene cada elemento, para pintar
// el contador junto al botón 💬: {"tarea":{"12":2},"pago":{"3":1},...}
func handleNotasConteo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, 405, "Método no permitido")
		return
	}
	rows, err := db.Query(`SELECT tipo, ref_id, COUNT(*) FROM comentarios GROUP BY tipo, ref_id`)
	if err != nil {
		writeError(w, 500, "No se pudo contar las notas")
		return
	}
	defer rows.Close()
	conteo := map[string]map[string]int{}
	for rows.Next() {
		var tipo string
		var ref, n int
		if err := rows.Scan(&tipo, &ref, &n); err != nil {
			writeError(w, 500, "Error al leer el conteo")
			return
		}
		if conteo[tipo] == nil {
			conteo[tipo] = map[string]int{}
		}
		conteo[tipo][strconv.Itoa(ref)] = n
	}
	writeJSON(w, 200, conteo)
}

// handleNotaID borra una nota. Solo puede hacerlo quien la escribió (o
// cualquiera si se escribió sin sesión, como "Alguien").
func handleNotaID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		w.Header().Set("Allow", "DELETE")
		writeError(w, 405, "Método no permitido")
		return
	}
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	var autor string
	if err := db.QueryRow("SELECT autor FROM comentarios WHERE id=?", id).Scan(&autor); err != nil {
		writeError(w, 404, "Nota no encontrada")
		return
	}
	if autor != "Alguien" {
		u := usuarioActual(r)
		if u == nil || u.Nombre != autor {
			writeError(w, 403, "Solo puede borrar la nota quien la escribió")
			return
		}
	}
	if _, err := db.Exec("DELETE FROM comentarios WHERE id=?", id); err != nil {
		writeError(w, 500, "No se pudo borrar la nota")
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}

// borrarNotasDe limpia las notas de un elemento que se acaba de eliminar.
func borrarNotasDe(tipo string, id int) {
	db.Exec("DELETE FROM comentarios WHERE tipo=? AND ref_id=?", tipo, id)
}
