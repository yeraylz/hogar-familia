package main

import (
	"net/http"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

// Reglas automáticas de categoría y gastos fijos que se apuntan solos cada mes.

type reglaCategoria struct {
	ID        int    `json:"id"`
	Patron    string `json:"patron"`
	Categoria string `json:"categoria"`
}

type recurrente struct {
	ID        int     `json:"id"`
	Nota      string  `json:"nota"`
	Importe   float64 `json:"importe"`
	Categoria string  `json:"categoria"`
	Persona   string  `json:"persona"`
	Dia       int     `json:"dia"`
	Activo    bool    `json:"activo"`
	YaEsteMes bool    `json:"ya_este_mes,omitempty"`
}

func listarReglas() []reglaCategoria {
	out := []reglaCategoria{}
	rows, err := db.Query("SELECT id,patron,categoria FROM reglas_categoria ORDER BY id")
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var r reglaCategoria
		if rows.Scan(&r.ID, &r.Patron, &r.Categoria) == nil {
			out = append(out, r)
		}
	}
	return out
}

// categoriaPorRegla devuelve la categoría de la primera regla cuyo texto aparece en el nombre.
func categoriaPorReglas(reglas []reglaCategoria, texto string) (string, bool) {
	t := strings.ToLower(texto)
	for _, r := range reglas {
		if r.Patron != "" && strings.Contains(t, r.Patron) {
			if _, ok := nombreCategoria(r.Categoria); ok {
				return r.Categoria, true
			}
		}
	}
	return "", false
}

func categoriaPorRegla(texto string) (string, bool) { return categoriaPorReglas(listarReglas(), texto) }

// categoriaDeFactura: categoría elegida a mano > regla > "facturas".
func categoriaDeFactura(nombre string, manual map[string]string, reglas []reglaCategoria) string {
	if c, ok := manual[claveFactura(nombre)]; ok {
		return c
	}
	if c, ok := categoriaPorReglas(reglas, nombre); ok {
		return c
	}
	return "facturas"
}

func handleReglasGasto(w http.ResponseWriter, r *http.Request, resto string) {
	switch {
	case resto == "" && r.Method == http.MethodGet:
		writeJSON(w, 200, listarReglas())
	case resto == "" && r.Method == http.MethodPost:
		var in struct {
			Patron    string `json:"patron"`
			Categoria string `json:"categoria"`
			Aplicar   bool   `json:"aplicar"`
		}
		if err := decodeJSON(r, &in); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		in.Patron = strings.ToLower(strings.TrimSpace(in.Patron))
		if n := len([]rune(in.Patron)); n < 2 || n > 40 {
			writeError(w, 400, "La palabra debe tener entre 2 y 40 letras")
			return
		}
		if _, ok := nombreCategoria(in.Categoria); !ok {
			writeError(w, 400, "Categoría desconocida")
			return
		}
		var existente int
		if db.QueryRow("SELECT id FROM reglas_categoria WHERE patron=?", in.Patron).Scan(&existente) == nil {
			db.Exec("UPDATE reglas_categoria SET categoria=? WHERE id=?", in.Categoria, existente)
		} else if _, err := db.Exec("INSERT INTO reglas_categoria(patron,categoria) VALUES(?,?)", in.Patron, in.Categoria); err != nil {
			writeError(w, 500, "No se pudo guardar la regla")
			return
		}
		cambiados := 0
		if in.Aplicar {
			rows, err := db.Query("SELECT id,nota FROM gastos WHERE categoria='otros'")
			if err == nil {
				var ids []int
				for rows.Next() {
					var id int
					var nota string
					if rows.Scan(&id, &nota) == nil && strings.Contains(strings.ToLower(nota), in.Patron) {
						ids = append(ids, id)
					}
				}
				rows.Close()
				for _, id := range ids {
					if _, err := db.Exec("UPDATE gastos SET categoria=? WHERE id=?", in.Categoria, id); err == nil {
						cambiados++
					}
				}
			}
		}
		writeJSON(w, 200, map[string]any{"reglas": listarReglas(), "cambiados": cambiados})
	case resto != "" && r.Method == http.MethodDelete:
		id, err := strconv.Atoi(resto)
		if err != nil || id <= 0 {
			writeError(w, 404, "No encontrado")
			return
		}
		db.Exec("DELETE FROM reglas_categoria WHERE id=?", id)
		writeJSON(w, 200, listarReglas())
	default:
		writeError(w, 405, "Método no permitido")
	}
}

// ---------- Gastos fijos ----------

var mutexRecurrentes sync.Mutex

func listarRecurrentes() []recurrente {
	out := []recurrente{}
	rows, err := db.Query("SELECT id,nota,importe,categoria,persona,dia,activo FROM gastos_recurrentes ORDER BY dia, id")
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var x recurrente
		if rows.Scan(&x.ID, &x.Nota, &x.Importe, &x.Categoria, &x.Persona, &x.Dia, &x.Activo) == nil {
			out = append(out, x)
		}
	}
	return out
}

func diaDelMes(mes string, dia int) (string, bool) {
	t, err := time.ParseInLocation("2006-01", mes, time.Local)
	if err != nil {
		return "", false
	}
	ult := t.AddDate(0, 1, -1).Day()
	if dia > ult {
		dia = ult
	}
	return t.Format("2006-01") + "-" + twoDigits(dia), true
}

func twoDigits(n int) string {
	if n < 10 {
		return "0" + strconv.Itoa(n)
	}
	return strconv.Itoa(n)
}

func mesAnterior(t time.Time) string {
	return time.Date(t.Year(), t.Month(), 1, 12, 0, 0, 0, time.Local).AddDate(0, -1, 0).Format("2006-01")
}

// generarRecurrentes apunta los gastos fijos cuyo día ya ha llegado (máx. 12 meses atrás).
func generarRecurrentes() {
	mutexRecurrentes.Lock()
	defer mutexRecurrentes.Unlock()
	ahora := time.Now()
	hoy := ahora.Format(dateLayout)
	mesActual := ahora.Format("2006-01")
	rows, err := db.Query("SELECT id,nota,importe,categoria,persona,dia,ultimo_mes FROM gastos_recurrentes WHERE activo=1")
	if err != nil {
		return
	}
	type fila struct {
		x      recurrente
		ultimo string
	}
	var todas []fila
	for rows.Next() {
		var f fila
		if rows.Scan(&f.x.ID, &f.x.Nota, &f.x.Importe, &f.x.Categoria, &f.x.Persona, &f.x.Dia, &f.ultimo) == nil {
			todas = append(todas, f)
		}
	}
	rows.Close()
	for _, f := range todas {
		ult := f.ultimo
		limite := ahora.AddDate(-1, 0, 0).Format("2006-01")
		if ult < limite {
			ult = mesAnterior(ahora.AddDate(-1, 0, 0))
		}
		for i := 0; i < 14; i++ {
			t, err := time.ParseInLocation("2006-01", ult, time.Local)
			if err != nil {
				break
			}
			mes := t.AddDate(0, 1, 0).Format("2006-01")
			if mes > mesActual {
				break
			}
			fecha, ok := diaDelMes(mes, f.x.Dia)
			if !ok || fecha > hoy {
				break
			}
			if _, err := db.Exec(`INSERT INTO gastos(fecha,importe,categoria,persona,nota,a_cobrar,liquidado,creado,recurrente_id) VALUES(?,?,?,?,?,0,0,?,?)`,
				fecha, f.x.Importe, f.x.Categoria, f.x.Persona, f.x.Nota, ahora.Format(time.RFC3339), f.x.ID); err != nil {
				break
			}
			ult = mes
			db.Exec("UPDATE gastos_recurrentes SET ultimo_mes=? WHERE id=?", ult, f.x.ID)
		}
	}
}

func validarRecurrente(x *recurrente) string {
	x.Nota = strings.TrimSpace(x.Nota)
	if x.Nota == "" || len([]rune(x.Nota)) > 60 {
		return "Pon un nombre (máx. 60 letras)"
	}
	x.Importe = redondear(x.Importe)
	if x.Importe <= 0 || x.Importe > 10000000 {
		return "El importe debe ser mayor que 0"
	}
	if x.Dia < 1 || x.Dia > 31 {
		return "El día debe estar entre 1 y 31"
	}
	if x.Categoria == "" {
		if c, ok := categoriaPorRegla(x.Nota); ok {
			x.Categoria = c
		} else {
			x.Categoria = "otros"
		}
	}
	if _, ok := nombreCategoria(x.Categoria); !ok {
		return "Categoría inválida"
	}
	x.Persona = strings.TrimSpace(x.Persona)
	if x.Persona == "" || x.Persona == "Casa" || x.Persona == "Todos" {
		x.Persona = "Conjunta"
	}
	if len([]rune(x.Persona)) > 30 {
		return "Nombre demasiado largo"
	}
	return ""
}

func handleRecurrentesGasto(w http.ResponseWriter, r *http.Request, resto string) {
	switch {
	case resto == "" && r.Method == http.MethodGet:
		generarRecurrentes()
		writeJSON(w, 200, listarRecurrentes())
	case resto == "" && r.Method == http.MethodPost:
		var x recurrente
		if err := decodeJSON(r, &x); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		if msg := validarRecurrente(&x); msg != "" {
			writeError(w, 400, msg)
			return
		}
		ult := mesAnterior(time.Now())
		if x.YaEsteMes {
			ult = time.Now().Format("2006-01")
		}
		if _, err := db.Exec(`INSERT INTO gastos_recurrentes(nota,importe,categoria,persona,dia,activo,ultimo_mes) VALUES(?,?,?,?,?,1,?)`,
			x.Nota, x.Importe, x.Categoria, x.Persona, x.Dia, ult); err != nil {
			writeError(w, 500, "No se pudo guardar el gasto fijo")
			return
		}
		generarRecurrentes()
		writeJSON(w, 201, listarRecurrentes())
	case resto != "" && (r.Method == http.MethodPut || r.Method == http.MethodDelete):
		id, err := strconv.Atoi(resto)
		if err != nil || id <= 0 {
			writeError(w, 404, "No encontrado")
			return
		}
		if r.Method == http.MethodDelete {
			db.Exec("DELETE FROM gastos_recurrentes WHERE id=?", id)
			writeJSON(w, 200, listarRecurrentes())
			return
		}
		var x recurrente
		if err := decodeJSON(r, &x); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		if msg := validarRecurrente(&x); msg != "" {
			writeError(w, 400, msg)
			return
		}
		act := 0
		if x.Activo {
			act = 1
		}
		res, err := db.Exec(`UPDATE gastos_recurrentes SET nota=?,importe=?,categoria=?,persona=?,dia=?,activo=? WHERE id=?`,
			x.Nota, x.Importe, x.Categoria, x.Persona, x.Dia, act, id)
		if err != nil {
			writeError(w, 500, "No se pudo guardar el gasto fijo")
			return
		}
		if n, _ := res.RowsAffected(); n == 0 {
			writeError(w, 404, "No encontrado")
			return
		}
		generarRecurrentes()
		writeJSON(w, 200, listarRecurrentes())
	default:
		writeError(w, 405, "Método no permitido")
	}
}

// ---------- Lo que queda por pagar este mes ----------

type proximoPago struct {
	Nombre  string  `json:"nombre"`
	Importe float64 `json:"importe"`
	Fecha   string  `json:"fecha"`
	Tipo    string  `json:"tipo"` // factura | fijo
}

func proximosPagosMes(mes, hasta string) []proximoPago {
	out := []proximoPago{}
	rows, err := db.Query("SELECT nombre,importe,fecha FROM pagos WHERE pagado=0 AND fecha<? ORDER BY fecha", hasta)
	if err == nil {
		for rows.Next() {
			var p proximoPago
			if rows.Scan(&p.Nombre, &p.Importe, &p.Fecha) == nil {
				p.Tipo = "factura"
				out = append(out, p)
			}
		}
		rows.Close()
	}
	for _, x := range listarRecurrentes() {
		if !x.Activo {
			continue
		}
		var ult string
		db.QueryRow("SELECT ultimo_mes FROM gastos_recurrentes WHERE id=?", x.ID).Scan(&ult)
		if ult >= mes {
			continue
		}
		if f, ok := diaDelMes(mes, x.Dia); ok {
			out = append(out, proximoPago{Nombre: x.Nota, Importe: x.Importe, Fecha: f, Tipo: "fijo"})
		}
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].Fecha < out[j].Fecha })
	return out
}
