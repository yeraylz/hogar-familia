package main

import (
	"encoding/json"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// Módulo "Reto": seguimiento personal (cada usuario ve solo lo suyo) del plan
// de recomposición corporal: sesiones, pesos levantados, hábitos y medidas.

func fechaValida(s string) bool {
	_, err := time.Parse(dateLayout, s)
	return err == nil
}

func boolAInt(b bool) int {
	if b {
		return 1
	}
	return 0
}

// Porción ajustada por el usuario de un ingrediente del menú (cantidad e
// ingrediente elegido, si lo cambió por otro equivalente).
type retoPorcion struct {
	C float64 `json:"c"`
	I string  `json:"i,omitempty"`
}

var reClavePorcion = regexp.MustCompile(`^[0-3]\.[0-9]$`)

type retoDiario struct {
	Fecha         string                 `json:"fecha"`
	SesionHecha   bool                   `json:"sesion_hecha"`
	Proteina      bool                   `json:"proteina"`
	Pasos         bool                   `json:"pasos"`
	Agua          bool                   `json:"agua"`
	Sueno         bool                   `json:"sueno"`
	Cardio        bool                   `json:"cardio"`
	ProteinaExtra int                    `json:"proteina_extra"` // gramos extra apuntados a mano
	Porciones     map[string]retoPorcion `json:"porciones"`
	Comidas       int                    `json:"comidas"` // bits: 1 desayuno, 2 comida, 4 merienda, 8 cena
}

type retoSerie struct {
	Ejercicio string  `json:"ejercicio"`
	Peso      float64 `json:"peso"`
	Reps      string  `json:"reps"`
	Fecha     string  `json:"fecha,omitempty"`
}

type retoMedida struct {
	ID      int     `json:"id"`
	Fecha   string  `json:"fecha"`
	Peso    float64 `json:"peso"`
	Cintura float64 `json:"cintura"`
}

// GET /reto/estado?fecha=YYYY-MM-DD
func handleRetoEstado(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, 405, "Método no permitido")
		return
	}
	u := usuarioActual(r)
	fecha := r.URL.Query().Get("fecha")
	if !fechaValida(fecha) {
		fecha = time.Now().Format(dateLayout)
	}

	var inicio string
	db.QueryRow(`SELECT inicio FROM reto_ajustes WHERE usuario_id=?`, u.ID).Scan(&inicio)

	d := retoDiario{Fecha: fecha, Porciones: map[string]retoPorcion{}}
	var a, b, c, e, f, g, h, p int
	var porc string
	if err := db.QueryRow(`SELECT sesion_hecha, proteina, pasos, agua, sueno, cardio, comidas, proteina_extra, porciones FROM reto_diario WHERE usuario_id=? AND fecha=?`, u.ID, fecha).
		Scan(&a, &b, &c, &e, &f, &g, &h, &p, &porc); err == nil {
		d.SesionHecha, d.Proteina, d.Pasos, d.Agua, d.Sueno, d.Cardio = a == 1, b == 1, c == 1, e == 1, f == 1, g == 1
		d.Comidas = h
		d.ProteinaExtra = p
		if porc != "" {
			json.Unmarshal([]byte(porc), &d.Porciones)
		}
	}

	series := []retoSerie{}
	if rows, err := db.Query(`SELECT ejercicio, peso, reps FROM reto_series WHERE usuario_id=? AND fecha=?`, u.ID, fecha); err == nil {
		for rows.Next() {
			var s retoSerie
			if rows.Scan(&s.Ejercicio, &s.Peso, &s.Reps) == nil {
				series = append(series, s)
			}
		}
		rows.Close()
	}

	// Las dos últimas veces que se hizo cada ejercicio antes de esta fecha
	// (más reciente primero): el entrenador compara las dos para decidir.
	// Las semanas de descarga (cada 4.ª desde el inicio) no cuentan: sus pesos
	// son bajos a propósito y no deben frenar la progresión.
	cargaS, cargaX := "1=1", "1=1"
	if fechaValida(inicio) {
		cargaS = "(s.fecha < '" + inicio + "' OR ((CAST(julianday(s.fecha)-julianday('" + inicio + "') AS INTEGER)/7)+1) % 4 != 0)"
		cargaX = "(x.fecha < '" + inicio + "' OR ((CAST(julianday(x.fecha)-julianday('" + inicio + "') AS INTEGER)/7)+1) % 4 != 0)"
	}
	ultimas := []retoSerie{}
	if rows, err := db.Query(`SELECT s.ejercicio, s.peso, s.reps, s.fecha FROM reto_series s
		WHERE s.usuario_id=? AND s.fecha < ? AND `+cargaS+` AND (
			SELECT COUNT(*) FROM reto_series x WHERE x.usuario_id=s.usuario_id AND x.ejercicio=s.ejercicio
			AND x.fecha > s.fecha AND x.fecha < ? AND `+cargaX+`) < 2
		ORDER BY s.ejercicio ASC, s.fecha DESC`,
		u.ID, fecha, fecha); err == nil {
		for rows.Next() {
			var s retoSerie
			if rows.Scan(&s.Ejercicio, &s.Peso, &s.Reps, &s.Fecha) == nil {
				ultimas = append(ultimas, s)
			}
		}
		rows.Close()
	}

	// Al empezar un ciclo nuevo (semana 5, 9...) se parte de los pesos de la
	// semana 2 del ciclo anterior.
	baseCiclo := []retoSerie{}
	if fechaValida(inicio) {
		ti, _ := time.Parse(dateLayout, inicio)
		tf, _ := time.Parse(dateLayout, fecha)
		dias := int(tf.Sub(ti).Hours() / 24)
		if dias >= 0 {
			semana := dias/7 + 1
			if semana > 1 && (semana-1)%4 == 0 {
				// La semana 2 del ciclo anterior es la (semana-3); empieza en (semana-4)*7 días.
				desde := ti.AddDate(0, 0, (semana-4)*7).Format(dateLayout)
				hasta := ti.AddDate(0, 0, (semana-4)*7+6).Format(dateLayout)
				if rows, err := db.Query(`SELECT s.ejercicio, s.peso, s.reps, s.fecha FROM reto_series s
					WHERE s.usuario_id=? AND s.fecha BETWEEN ? AND ? AND s.fecha = (
						SELECT MAX(fecha) FROM reto_series WHERE usuario_id=s.usuario_id AND ejercicio=s.ejercicio AND fecha BETWEEN ? AND ?)`,
					u.ID, desde, hasta, desde, hasta); err == nil {
					for rows.Next() {
						var s retoSerie
						if rows.Scan(&s.Ejercicio, &s.Peso, &s.Reps, &s.Fecha) == nil {
							baseCiclo = append(baseCiclo, s)
						}
					}
					rows.Close()
				}
			}
		}
	}

	// Sesiones de fuerza hechas en la semana (lunes a domingo) de esa fecha.
	t, _ := time.Parse(dateLayout, fecha)
	desvio := (int(t.Weekday()) + 6) % 7
	lunes := t.AddDate(0, 0, -desvio).Format(dateLayout)
	domingo := t.AddDate(0, 0, 6-desvio).Format(dateLayout)
	var sesionesSemana int
	db.QueryRow(`SELECT COUNT(*) FROM reto_diario WHERE usuario_id=? AND sesion_hecha=1 AND fecha BETWEEN ? AND ?`,
		u.ID, lunes, domingo).Scan(&sesionesSemana)

	// Días de la semana con sesión hecha, para pintar la fila de la semana.
	dias := map[string]bool{}
	if rows, err := db.Query(`SELECT fecha FROM reto_diario WHERE usuario_id=? AND sesion_hecha=1 AND fecha BETWEEN ? AND ?`, u.ID, lunes, domingo); err == nil {
		for rows.Next() {
			var f string
			if rows.Scan(&f) == nil {
				dias[f] = true
			}
		}
		rows.Close()
	}

	writeJSON(w, 200, map[string]any{
		"inicio":          inicio,
		"diario":          d,
		"series":          series,
		"ultimas":         ultimas,
		"base_ciclo":      baseCiclo,
		"sesiones_semana": sesionesSemana,
		"semana_lunes":    lunes,
		"dias_hechos":     dias,
	})
}

// PUT /reto/diario
func handleRetoDiario(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		w.Header().Set("Allow", "PUT")
		writeError(w, 405, "Método no permitido")
		return
	}
	u := usuarioActual(r)
	var d retoDiario
	if err := decodeJSON(r, &d); err != nil || !fechaValida(d.Fecha) || d.ProteinaExtra < 0 || d.ProteinaExtra > 600 || len(d.Porciones) > 40 {
		writeError(w, 400, "Datos inválidos")
		return
	}
	for k, v := range d.Porciones {
		if !reClavePorcion.MatchString(k) || v.C < 0 || v.C > 3000 || len(v.I) > 30 {
			writeError(w, 400, "Cantidad no válida")
			return
		}
	}
	porciones := ""
	if len(d.Porciones) > 0 {
		b, _ := json.Marshal(d.Porciones)
		porciones = string(b)
	}
	_, err := db.Exec(`INSERT INTO reto_diario(usuario_id,fecha,sesion_hecha,proteina,pasos,agua,sueno,cardio,comidas,proteina_extra,porciones) VALUES(?,?,?,?,?,?,?,?,?,?,?)
		ON CONFLICT(usuario_id,fecha) DO UPDATE SET sesion_hecha=excluded.sesion_hecha, proteina=excluded.proteina,
		pasos=excluded.pasos, agua=excluded.agua, sueno=excluded.sueno, cardio=excluded.cardio, comidas=excluded.comidas, proteina_extra=excluded.proteina_extra, porciones=excluded.porciones`,
		u.ID, d.Fecha, boolAInt(d.SesionHecha), boolAInt(d.Proteina), boolAInt(d.Pasos), boolAInt(d.Agua), boolAInt(d.Sueno), boolAInt(d.Cardio), d.Comidas&15, d.ProteinaExtra, porciones)
	if err != nil {
		writeError(w, 500, "No se pudo guardar")
		return
	}
	writeJSON(w, 200, d)
}

// PUT /reto/series: peso y repeticiones de un ejercicio en un día.
func handleRetoSeries(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		w.Header().Set("Allow", "PUT")
		writeError(w, 405, "Método no permitido")
		return
	}
	u := usuarioActual(r)
	var s retoSerie
	if err := decodeJSON(r, &s); err != nil || !fechaValida(s.Fecha) {
		writeError(w, 400, "Datos inválidos")
		return
	}
	s.Ejercicio = strings.TrimSpace(s.Ejercicio)
	s.Reps = strings.TrimSpace(s.Reps)
	if s.Ejercicio == "" || utf8.RuneCountInString(s.Ejercicio) > 80 || utf8.RuneCountInString(s.Reps) > 40 || s.Peso < 0 || s.Peso > 500 {
		writeError(w, 400, "Datos inválidos")
		return
	}
	var err error
	if s.Peso == 0 && s.Reps == "" {
		_, err = db.Exec(`DELETE FROM reto_series WHERE usuario_id=? AND fecha=? AND ejercicio=?`, u.ID, s.Fecha, s.Ejercicio)
	} else {
		_, err = db.Exec(`INSERT INTO reto_series(usuario_id,fecha,ejercicio,peso,reps) VALUES(?,?,?,?,?)
			ON CONFLICT(usuario_id,fecha,ejercicio) DO UPDATE SET peso=excluded.peso, reps=excluded.reps`,
			u.ID, s.Fecha, s.Ejercicio, s.Peso, s.Reps)
	}
	if err != nil {
		writeError(w, 500, "No se pudo guardar")
		return
	}
	writeJSON(w, 200, s)
}

// GET /reto/historial-ejercicio?nombre=...: evolución de un ejercicio.
func handleRetoHistorialEjercicio(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, 405, "Método no permitido")
		return
	}
	u := usuarioActual(r)
	nombre := strings.TrimSpace(r.URL.Query().Get("nombre"))
	lista := []retoSerie{}
	rows, err := db.Query(`SELECT fecha, peso, reps FROM reto_series WHERE usuario_id=? AND ejercicio=? ORDER BY fecha ASC LIMIT 200`, u.ID, nombre)
	if err != nil {
		writeError(w, 500, "No se pudo cargar")
		return
	}
	defer rows.Close()
	for rows.Next() {
		var s retoSerie
		s.Ejercicio = nombre
		if rows.Scan(&s.Fecha, &s.Peso, &s.Reps) == nil {
			lista = append(lista, s)
		}
	}
	writeJSON(w, 200, lista)
}

// PUT /reto/inicio: fecha de arranque del plan (decide la fase).
func handleRetoInicio(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		w.Header().Set("Allow", "PUT")
		writeError(w, 405, "Método no permitido")
		return
	}
	u := usuarioActual(r)
	var b struct {
		Inicio string `json:"inicio"`
	}
	if err := decodeJSON(r, &b); err != nil || (b.Inicio != "" && !fechaValida(b.Inicio)) {
		writeError(w, 400, "Fecha inválida")
		return
	}
	var err error
	if b.Inicio == "" {
		_, err = db.Exec(`DELETE FROM reto_ajustes WHERE usuario_id=?`, u.ID)
	} else {
		_, err = db.Exec(`INSERT INTO reto_ajustes(usuario_id,inicio) VALUES(?,?)
			ON CONFLICT(usuario_id) DO UPDATE SET inicio=excluded.inicio`, u.ID, b.Inicio)
	}
	if err != nil {
		writeError(w, 500, "No se pudo guardar")
		return
	}
	writeJSON(w, 200, map[string]string{"inicio": b.Inicio})
}

// GET/POST /reto/medidas
func handleRetoMedidas(w http.ResponseWriter, r *http.Request) {
	u := usuarioActual(r)
	switch r.Method {
	case http.MethodGet:
		lista := []retoMedida{}
		rows, err := db.Query(`SELECT id, fecha, peso, cintura FROM reto_medidas WHERE usuario_id=? ORDER BY fecha ASC`, u.ID)
		if err != nil {
			writeError(w, 500, "No se pudieron cargar las medidas")
			return
		}
		defer rows.Close()
		for rows.Next() {
			var m retoMedida
			if rows.Scan(&m.ID, &m.Fecha, &m.Peso, &m.Cintura) == nil {
				lista = append(lista, m)
			}
		}
		writeJSON(w, 200, lista)

	case http.MethodPost:
		var m retoMedida
		if err := decodeJSON(r, &m); err != nil || !fechaValida(m.Fecha) {
			writeError(w, 400, "Datos inválidos")
			return
		}
		if (m.Peso != 0 && (m.Peso < 20 || m.Peso > 400)) || (m.Cintura != 0 && (m.Cintura < 30 || m.Cintura > 300)) || (m.Peso == 0 && m.Cintura == 0) {
			writeError(w, 400, "Pon al menos el peso o la cintura (valores razonables)")
			return
		}
		_, err := db.Exec(`INSERT INTO reto_medidas(usuario_id,fecha,peso,cintura) VALUES(?,?,?,?)
			ON CONFLICT(usuario_id,fecha) DO UPDATE SET peso=excluded.peso, cintura=excluded.cintura`,
			u.ID, m.Fecha, m.Peso, m.Cintura)
		if err != nil {
			writeError(w, 500, "No se pudo guardar")
			return
		}
		writeJSON(w, 201, m)

	default:
		w.Header().Set("Allow", "GET, POST")
		writeError(w, 405, "Método no permitido")
	}
}

// DELETE /reto/medidas/{id}
func handleRetoMedidaID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		w.Header().Set("Allow", "DELETE")
		writeError(w, 405, "Método no permitido")
		return
	}
	u := usuarioActual(r)
	id, err := strconv.Atoi(strings.TrimPrefix(r.URL.Path, "/reto/medidas/"))
	if err != nil || id <= 0 {
		writeError(w, 400, "ID inválido")
		return
	}
	res, err := db.Exec(`DELETE FROM reto_medidas WHERE id=? AND usuario_id=?`, id, u.ID)
	if err != nil {
		writeError(w, 500, "No se pudo borrar")
		return
	}
	if n, _ := res.RowsAffected(); n == 0 {
		writeError(w, 404, "Medida no encontrada")
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}

// GET /reto/progreso: todo el historial de series y sesiones del usuario; los récords, rachas y
// logros se calculan en el cliente.
func handleRetoProgreso(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, 405, "Método no permitido")
		return
	}
	u := usuarioActual(r)
	series := []retoSerie{}
	if rows, err := db.Query(`SELECT fecha, ejercicio, peso, reps FROM reto_series WHERE usuario_id=? ORDER BY fecha ASC`, u.ID); err == nil {
		for rows.Next() {
			var s retoSerie
			if rows.Scan(&s.Fecha, &s.Ejercicio, &s.Peso, &s.Reps) == nil {
				series = append(series, s)
			}
		}
		rows.Close()
	}
	fechas := func(col string) []string {
		out := []string{}
		if rows, err := db.Query(`SELECT fecha FROM reto_diario WHERE usuario_id=? AND `+col+`=1 ORDER BY fecha ASC`, u.ID); err == nil {
			for rows.Next() {
				var f string
				if rows.Scan(&f) == nil {
					out = append(out, f)
				}
			}
			rows.Close()
		}
		return out
	}
	writeJSON(w, 200, map[string]any{
		"series":   series,
		"sesiones": fechas("sesion_hecha"),
		"cardio":   fechas("cardio"),
	})
}
