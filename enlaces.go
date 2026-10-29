package main

import (
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"
)

const (
	maxCaracteresTituloEnlace = 80
	maxCaracteresURL          = 2000
	claveFotosURL             = "fotos_url"
)

type Enlace struct {
	ID     int    `json:"id"`
	Titulo string `json:"titulo"`
	URL    string `json:"url"`
}

// normalizarURL acepta "immich.midominio.es" o "https://..." y devuelve una
// URL http(s) válida. Rechaza cualquier otro esquema (javascript:, data:...),
// para que un enlace guardado nunca pueda ejecutar código al pulsarlo.
func normalizarURL(raw string) (string, bool) {
	raw = strings.TrimSpace(raw)
	if raw == "" || len(raw) > maxCaracteresURL {
		return "", false
	}
	if !strings.Contains(raw, "://") {
		raw = "https://" + raw
	}
	u, err := url.Parse(raw)
	if err != nil || u.Host == "" {
		return "", false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", false
	}
	return u.String(), true
}

// validarEnlace comprueba título y URL y devuelve los valores ya limpios.
func validarEnlace(titulo, rawURL string) (string, string, string) {
	titulo = strings.TrimSpace(titulo)
	if titulo == "" {
		return "", "", "El nombre del enlace no puede estar vacío"
	}
	if utf8.RuneCountInString(titulo) > maxCaracteresTituloEnlace {
		return "", "", "El nombre es demasiado largo (máximo 80 caracteres)"
	}
	u, ok := normalizarURL(rawURL)
	if !ok {
		return "", "", "La dirección no es válida (debe ser una web, tipo https://...)"
	}
	return titulo, u, ""
}

func handleEnlaces(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(`SELECT id,titulo,url FROM enlaces_hogar ORDER BY id ASC`)
		if err != nil {
			writeError(w, 500, "No se pudieron cargar los enlaces")
			return
		}
		defer rows.Close()
		lista := []Enlace{}
		for rows.Next() {
			var e Enlace
			if err := rows.Scan(&e.ID, &e.Titulo, &e.URL); err != nil {
				writeError(w, 500, "Error al leer los enlaces")
				return
			}
			lista = append(lista, e)
		}
		writeJSON(w, 200, lista)

	case http.MethodPost:
		var body Enlace
		if err := decodeJSON(r, &body); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		titulo, u, msg := validarEnlace(body.Titulo, body.URL)
		if msg != "" {
			writeError(w, 400, msg)
			return
		}
		res, err := db.Exec(`INSERT INTO enlaces_hogar(titulo,url,creado) VALUES(?,?,?)`,
			titulo, u, time.Now().Format("2006-01-02 15:04:05"))
		if err != nil {
			writeError(w, 500, "No se pudo guardar el enlace")
			return
		}
		id, _ := res.LastInsertId()
		writeJSON(w, 201, Enlace{ID: int(id), Titulo: titulo, URL: u})

	default:
		w.Header().Set("Allow", "GET, POST")
		writeError(w, 405, "Método no permitido")
	}
}

func handleEnlaceID(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	switch r.Method {
	case http.MethodPut:
		var body Enlace
		if err := decodeJSON(r, &body); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		titulo, u, msg := validarEnlace(body.Titulo, body.URL)
		if msg != "" {
			writeError(w, 400, msg)
			return
		}
		res, err := db.Exec(`UPDATE enlaces_hogar SET titulo=?, url=? WHERE id=?`, titulo, u, id)
		if err != nil {
			writeError(w, 500, "No se pudo actualizar el enlace")
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			writeError(w, 404, "Enlace no encontrado")
			return
		}
		writeJSON(w, 200, Enlace{ID: id, Titulo: titulo, URL: u})

	case http.MethodDelete:
		res, err := db.Exec(`DELETE FROM enlaces_hogar WHERE id=?`, id)
		if err != nil {
			writeError(w, 500, "No se pudo borrar el enlace")
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			writeError(w, 404, "Enlace no encontrado")
			return
		}
		writeJSON(w, 200, map[string]bool{"success": true})

	default:
		w.Header().Set("Allow", "PUT, DELETE")
		writeError(w, 405, "Método no permitido")
	}
}

// handleAjusteFotos guarda la dirección del servidor de fotos (Immich).
// Se guarda en el servidor para que la vean todos los móviles de la casa.
func handleAjusteFotos(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		v, _ := leerConfig(claveFotosURL)
		writeJSON(w, 200, map[string]string{"url": v})

	case http.MethodPut:
		var body struct {
			URL string `json:"url"`
		}
		if err := decodeJSON(r, &body); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		// Vacío = quitar la dirección configurada.
		if strings.TrimSpace(body.URL) == "" {
			if err := guardarConfig(claveFotosURL, ""); err != nil {
				writeError(w, 500, "No se pudo guardar")
				return
			}
			writeJSON(w, 200, map[string]string{"url": ""})
			return
		}
		u, ok := normalizarURL(body.URL)
		if !ok {
			writeError(w, 400, "La dirección no es válida (debe ser una web, tipo https://...)")
			return
		}
		if err := guardarConfig(claveFotosURL, u); err != nil {
			writeError(w, 500, "No se pudo guardar")
			return
		}
		writeJSON(w, 200, map[string]string{"url": u})

	default:
		w.Header().Set("Allow", "GET, PUT")
		writeError(w, 405, "Método no permitido")
	}
}
