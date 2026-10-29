package main

import (
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// «Mis cosas»: lista de tareas y calendario personales de cada persona, dentro de Hogar pero
// totalmente privados (tablas propias, sin relación con las tareas/eventos del Hogar familiar):
// nadie más que el propio dueño del perfil los ve.

const maxCaracteresMisCosas = 200

type tareaPersonal struct {
	ID           int    `json:"id"`
	Texto        string `json:"texto"`
	Hecha        bool   `json:"hecha"`
	Fecha        string `json:"fecha"` // AAAA-MM-DD opcional: vacío = sin fecha
	Creada       string `json:"creada"`
	ConUsuarioID int    `json:"con_usuario_id,omitempty"` // 0 = solo tuya; si no, de qué propuesta aceptada viene
}

type eventoPersonal struct {
	ID           int    `json:"id"`
	Texto        string `json:"texto"`
	Fecha        string `json:"fecha"` // AAAA-MM-DD
	Hora         string `json:"hora"`  // "HH:MM" o "" (todo el día)
	Creado       string `json:"creado"`
	ConUsuarioID int    `json:"con_usuario_id,omitempty"`
}

func idDeRuta(r *http.Request, prefijo string) (int, bool) {
	resto := strings.TrimPrefix(strings.Trim(r.URL.Path, "/"), prefijo)
	resto = strings.Trim(resto, "/")
	if resto == "" {
		return 0, false
	}
	id, err := strconv.Atoi(resto)
	if err != nil || id <= 0 {
		return 0, false
	}
	return id, true
}

func handleMisTareas(w http.ResponseWriter, r *http.Request) {
	u := usuarioActual(r)
	if u == nil {
		writeError(w, 401, "Sin sesión")
		return
	}
	id, conID := idDeRuta(r, "mis-cosas/tareas")

	switch {
	case !conID && r.Method == http.MethodGet:
		rows, err := db.Query(`SELECT id,texto,hecha,creada,fecha,con_usuario_id FROM tareas_personales WHERE usuario_id=? ORDER BY hecha ASC, CASE WHEN fecha='' THEN 1 ELSE 0 END ASC, fecha ASC, orden ASC, id ASC`, u.ID)
		if err != nil {
			writeError(w, 500, "No se pudieron cargar tus tareas")
			return
		}
		defer rows.Close()
		lista := []tareaPersonal{}
		for rows.Next() {
			var t tareaPersonal
			var hecha int
			if rows.Scan(&t.ID, &t.Texto, &hecha, &t.Creada, &t.Fecha, &t.ConUsuarioID) == nil {
				t.Hecha = hecha != 0
				lista = append(lista, t)
			}
		}
		writeJSON(w, 200, lista)

	case !conID && r.Method == http.MethodPost:
		var in struct {
			Texto        string `json:"texto"`
			Fecha        string `json:"fecha"`
			ConUsuarioID int    `json:"con_usuario_id"`
		}
		if decodeJSON(r, &in) != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		in.Texto = strings.TrimSpace(in.Texto)
		if in.Texto == "" {
			writeError(w, 400, "Escribe algo para la tarea")
			return
		}
		if utf8.RuneCountInString(in.Texto) > maxCaracteresMisCosas {
			in.Texto = string([]rune(in.Texto)[:maxCaracteresMisCosas])
		}
		in.Fecha = strings.TrimSpace(in.Fecha)
		if in.Fecha != "" {
			if _, err := time.Parse("2006-01-02", in.Fecha); err != nil {
				writeError(w, 400, "Fecha no válida")
				return
			}
		}
		// La etiqueta de «con quién» solo tiene sentido si ese usuario existe de verdad; si no,
		// se guarda igualmente la tarea pero sin esa etiqueta, en vez de fallar entera.
		if in.ConUsuarioID != 0 && nombreUsuario(in.ConUsuarioID) == "" {
			in.ConUsuarioID = 0
		}
		creada := time.Now().Format("2006-01-02 15:04:05")
		res, err := db.Exec(`INSERT INTO tareas_personales(usuario_id,texto,creada,fecha,con_usuario_id) VALUES(?,?,?,?,?)`, u.ID, in.Texto, creada, in.Fecha, in.ConUsuarioID)
		if err != nil {
			writeError(w, 500, "No se pudo guardar la tarea")
			return
		}
		idNueva, _ := res.LastInsertId()
		writeJSON(w, 201, tareaPersonal{ID: int(idNueva), Texto: in.Texto, Creada: creada, Fecha: in.Fecha, ConUsuarioID: in.ConUsuarioID})

	case conID && r.Method == http.MethodPut:
		var in struct {
			Texto *string `json:"texto"`
			Hecha *bool   `json:"hecha"`
			Fecha *string `json:"fecha"`
		}
		if decodeJSON(r, &in) != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		if in.Texto != nil {
			t := strings.TrimSpace(*in.Texto)
			if t == "" {
				writeError(w, 400, "Escribe algo para la tarea")
				return
			}
			if utf8.RuneCountInString(t) > maxCaracteresMisCosas {
				t = string([]rune(t)[:maxCaracteresMisCosas])
			}
			if _, err := db.Exec(`UPDATE tareas_personales SET texto=? WHERE id=? AND usuario_id=?`, t, id, u.ID); err != nil {
				writeError(w, 500, "No se pudo actualizar")
				return
			}
		}
		if in.Hecha != nil {
			h := 0
			if *in.Hecha {
				h = 1
			}
			if _, err := db.Exec(`UPDATE tareas_personales SET hecha=? WHERE id=? AND usuario_id=?`, h, id, u.ID); err != nil {
				writeError(w, 500, "No se pudo actualizar")
				return
			}
		}
		if in.Fecha != nil {
			f := strings.TrimSpace(*in.Fecha)
			if f != "" {
				if _, err := time.Parse("2006-01-02", f); err != nil {
					writeError(w, 400, "Fecha no válida")
					return
				}
			}
			if _, err := db.Exec(`UPDATE tareas_personales SET fecha=? WHERE id=? AND usuario_id=?`, f, id, u.ID); err != nil {
				writeError(w, 500, "No se pudo actualizar")
				return
			}
		}
		writeJSON(w, 200, map[string]bool{"success": true})

	case conID && r.Method == http.MethodDelete:
		res, err := db.Exec(`DELETE FROM tareas_personales WHERE id=? AND usuario_id=?`, id, u.ID)
		if err != nil {
			writeError(w, 500, "No se pudo borrar")
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			writeError(w, 404, "No encontrada")
			return
		}
		writeJSON(w, 200, map[string]bool{"success": true})

	default:
		w.Header().Set("Allow", "GET, POST, PUT, DELETE")
		writeError(w, 405, "Método no permitido")
	}
}

func handleMisEventos(w http.ResponseWriter, r *http.Request) {
	u := usuarioActual(r)
	if u == nil {
		writeError(w, 401, "Sin sesión")
		return
	}
	id, conID := idDeRuta(r, "mis-cosas/eventos")

	switch {
	case !conID && r.Method == http.MethodGet:
		rows, err := db.Query(`SELECT id,texto,fecha,hora,creado,con_usuario_id FROM eventos_personales WHERE usuario_id=? ORDER BY fecha ASC, hora ASC, id ASC`, u.ID)
		if err != nil {
			writeError(w, 500, "No se pudieron cargar tus recordatorios")
			return
		}
		defer rows.Close()
		lista := []eventoPersonal{}
		for rows.Next() {
			var e eventoPersonal
			if rows.Scan(&e.ID, &e.Texto, &e.Fecha, &e.Hora, &e.Creado, &e.ConUsuarioID) == nil {
				lista = append(lista, e)
			}
		}
		writeJSON(w, 200, lista)

	case !conID && r.Method == http.MethodPost:
		var in struct {
			Texto        string `json:"texto"`
			Fecha        string `json:"fecha"`
			Hora         string `json:"hora"`
			ConUsuarioID int    `json:"con_usuario_id"`
		}
		if decodeJSON(r, &in) != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		in.Texto = strings.TrimSpace(in.Texto)
		if in.Texto == "" {
			writeError(w, 400, "Escribe algo para el recordatorio")
			return
		}
		if utf8.RuneCountInString(in.Texto) > maxCaracteresMisCosas {
			in.Texto = string([]rune(in.Texto)[:maxCaracteresMisCosas])
		}
		if _, err := time.Parse("2006-01-02", strings.TrimSpace(in.Fecha)); err != nil {
			writeError(w, 400, "Fecha no válida")
			return
		}
		in.Hora = strings.TrimSpace(in.Hora)
		if in.Hora != "" {
			if _, err := time.Parse("15:04", in.Hora); err != nil {
				writeError(w, 400, "Hora no válida")
				return
			}
		}
		if in.ConUsuarioID != 0 && nombreUsuario(in.ConUsuarioID) == "" {
			in.ConUsuarioID = 0
		}
		creado := time.Now().Format("2006-01-02 15:04:05")
		res, err := db.Exec(`INSERT INTO eventos_personales(usuario_id,texto,fecha,hora,creado,con_usuario_id) VALUES(?,?,?,?,?,?)`,
			u.ID, in.Texto, in.Fecha, in.Hora, creado, in.ConUsuarioID)
		if err != nil {
			writeError(w, 500, "No se pudo guardar el recordatorio")
			return
		}
		idNueva, _ := res.LastInsertId()
		writeJSON(w, 201, eventoPersonal{ID: int(idNueva), Texto: in.Texto, Fecha: in.Fecha, Hora: in.Hora, Creado: creado, ConUsuarioID: in.ConUsuarioID})

	case conID && r.Method == http.MethodPut:
		var in struct {
			Texto *string `json:"texto"`
			Fecha *string `json:"fecha"`
			Hora  *string `json:"hora"`
		}
		if decodeJSON(r, &in) != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		if in.Texto != nil {
			t := strings.TrimSpace(*in.Texto)
			if t == "" {
				writeError(w, 400, "Escribe algo para el recordatorio")
				return
			}
			if utf8.RuneCountInString(t) > maxCaracteresMisCosas {
				t = string([]rune(t)[:maxCaracteresMisCosas])
			}
			if _, err := db.Exec(`UPDATE eventos_personales SET texto=? WHERE id=? AND usuario_id=?`, t, id, u.ID); err != nil {
				writeError(w, 500, "No se pudo actualizar")
				return
			}
		}
		if in.Fecha != nil {
			f := strings.TrimSpace(*in.Fecha)
			if _, err := time.Parse("2006-01-02", f); err != nil {
				writeError(w, 400, "Fecha no válida")
				return
			}
			if _, err := db.Exec(`UPDATE eventos_personales SET fecha=? WHERE id=? AND usuario_id=?`, f, id, u.ID); err != nil {
				writeError(w, 500, "No se pudo actualizar")
				return
			}
		}
		if in.Hora != nil {
			h := strings.TrimSpace(*in.Hora)
			if h != "" {
				if _, err := time.Parse("15:04", h); err != nil {
					writeError(w, 400, "Hora no válida")
					return
				}
			}
			if _, err := db.Exec(`UPDATE eventos_personales SET hora=? WHERE id=? AND usuario_id=?`, h, id, u.ID); err != nil {
				writeError(w, 500, "No se pudo actualizar")
				return
			}
		}
		writeJSON(w, 200, map[string]bool{"success": true})

	case conID && r.Method == http.MethodDelete:
		res, err := db.Exec(`DELETE FROM eventos_personales WHERE id=? AND usuario_id=?`, id, u.ID)
		if err != nil {
			writeError(w, 500, "No se pudo borrar")
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			writeError(w, 404, "No encontrado")
			return
		}
		writeJSON(w, 200, map[string]bool{"success": true})

	default:
		w.Header().Set("Allow", "GET, POST, PUT, DELETE")
		writeError(w, 405, "Método no permitido")
	}
}
