package main

import (
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Control de gastos del hogar: gastos del día a día + facturas pagadas (del historial de Pagos),
// con resumen mensual, presupuestos por categoría y exportación a CSV.

type Gasto struct {
	ID        int     `json:"id"`
	Fecha     string  `json:"fecha"`
	Importe   float64 `json:"importe"`
	Categoria string  `json:"categoria"`
	Persona   string  `json:"persona"`
	Nota      string  `json:"nota"`
	// Persona = con qué cuenta se pagó: "Conjunta" o el nombre de quien lo adelantó de su cuenta.
	// ACobrar = lo que le deben devolver a quien lo adelantó (0 si salió de la conjunta).
	ACobrar   float64 `json:"a_cobrar"`
	Liquidado bool    `json:"liquidado"`
	// RecurrenteID > 0: lo apuntó solo un gasto fijo.
	RecurrenteID int  `json:"recurrente_id,omitempty"`
	Ticket       bool `json:"ticket,omitempty"` // tiene foto del ticket (solo lectura)
}

var nombresCategoriaGasto = map[string]string{
	"super": "Súper", "casa": "Casa", "cole": "Cole y niños", "coche": "Coche", "salud": "Salud",
	"ocio": "Ocio", "restaurantes": "Restaurantes", "ropa": "Ropa", "otros": "Otros", "viajes": "Viajes",
}

// nombreCategoria devuelve el nombre de una categoría fija o creada por el usuario.
func nombreCategoria(id string) (string, bool) {
	if n, ok := nombresCategoriaGasto[id]; ok {
		return n, true
	}
	var n string
	if db.QueryRow("SELECT nombre FROM categorias_gasto WHERE id=?", id).Scan(&n) == nil {
		return n, true
	}
	return "", false
}

func redondear(v float64) float64 { return math.Round(v*100) / 100 }

func validarGasto(g *Gasto) string {
	g.Fecha = strings.TrimSpace(g.Fecha)
	if _, err := time.Parse(dateLayout, g.Fecha); err != nil {
		return "Fecha inválida"
	}
	if math.IsNaN(g.Importe) || g.Importe == 0 || math.Abs(g.Importe) > 10000000 {
		return "El importe no puede ser 0"
	}
	g.Importe = redondear(g.Importe)
	if g.Categoria == "" {
		g.Categoria = "otros"
		if c, ok := categoriaPorRegla(g.Nota); ok {
			g.Categoria = c
		}
	}
	if _, ok := nombreCategoria(g.Categoria); !ok {
		return "Categoría inválida"
	}
	g.Persona = strings.TrimSpace(g.Persona)
	if g.Persona == "" || g.Persona == "Casa" || g.Persona == "Todos" {
		g.Persona = "Conjunta"
	}
	// Las devoluciones (importe negativo) nunca llevan reparto
	if g.Importe < 0 || g.Persona == "Conjunta" || g.ACobrar < 0 || math.IsNaN(g.ACobrar) {
		g.ACobrar = 0
	}
	if g.ACobrar > g.Importe {
		g.ACobrar = g.Importe
	}
	g.ACobrar = redondear(g.ACobrar)
	if g.ACobrar == 0 {
		g.Liquidado = false
	}
	if len([]rune(g.Persona)) > 30 {
		return "Nombre demasiado largo"
	}
	g.Nota = recortarSinPuntos(g.Nota, 200)
	return ""
}

func recortarSinPuntos(s string, n int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) > n {
		r = r[:n]
	}
	return string(r)
}

// rangoMes devuelve el primer día del mes y el primer día del siguiente ("2026-10" -> 2026-10-01, 2026-11-01).
func rangoMes(mes string) (string, string, bool) {
	t, err := time.Parse("2006-01", mes)
	if err != nil {
		return "", "", false
	}
	return t.Format(dateLayout), t.AddDate(0, 1, 0).Format(dateLayout), true
}

func sumaGastosMes(mes string) float64 {
	desde, hasta, ok := rangoMes(mes)
	if !ok {
		return 0
	}
	var g, f float64
	db.QueryRow(`SELECT COALESCE(SUM(importe),0) FROM gastos WHERE fecha>=? AND fecha<?`, desde, hasta).Scan(&g)
	db.QueryRow(`SELECT COALESCE(SUM(importe),0) FROM pagos_historial WHERE fecha_pago>=? AND fecha_pago<?`, desde, hasta).Scan(&f)
	return redondear(g + f)
}

func sumaCategoriaMes(mes, cat string) float64 {
	desde, hasta, ok := rangoMes(mes)
	if !ok {
		return 0
	}
	var g float64
	db.QueryRow(`SELECT COALESCE(SUM(importe),0) FROM gastos WHERE fecha>=? AND fecha<? AND categoria=?`, desde, hasta, cat).Scan(&g)
	return redondear(g)
}

func presupuestoDe(cat string) float64 {
	var v float64
	db.QueryRow("SELECT importe FROM presupuestos WHERE categoria=?", cat).Scan(&v)
	return v
}

// avisarPresupuesto manda una notificación cuando un gasto hace cruzar el 80 % o el 100 % del presupuesto.
func avisarPresupuesto(clave string, antes, despues float64, mes string) {
	pres := presupuestoDe(clave)
	if pres <= 0 {
		return
	}
	nombre := "toda la casa"
	if n, ok := nombreCategoria(clave); ok {
		nombre = n
	}
	umbral := 0
	switch {
	case antes < pres && despues >= pres:
		umbral = 100
	case antes < pres*0.8 && despues >= pres*0.8:
		umbral = 80
	}
	if umbral == 0 {
		return
	}
	titulo := fmt.Sprintf("⚠️ Presupuesto de %s al %d %%", nombre, umbral)
	if umbral == 100 {
		titulo = fmt.Sprintf("🚨 Presupuesto de %s superado", nombre)
	}
	go enviarATodos(titulo, fmt.Sprintf("Llevas %.2f € de %.2f € este mes", despues, pres), "presupuesto-"+clave+"-"+mes+"-"+strconv.Itoa(umbral))
}

func avisosTrasGasto(g Gasto, antesCat, antesTotal float64) {
	mes := g.Fecha[:7]
	avisarPresupuesto(g.Categoria, antesCat, sumaCategoriaMes(mes, g.Categoria), mes)
	avisarPresupuesto("_total", antesTotal, sumaGastosMes(mes), mes)
}

func handleGastos(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeError(w, 405, "Método no permitido")
		return
	}
	var g Gasto
	if err := decodeJSON(r, &g); err != nil {
		writeError(w, 400, "JSON inválido")
		return
	}
	if msg := validarGasto(&g); msg != "" {
		writeError(w, 400, msg)
		return
	}
	mes := g.Fecha[:7]
	antesCat, antesTotal := sumaCategoriaMes(mes, g.Categoria), sumaGastosMes(mes)
	res, err := db.Exec(`INSERT INTO gastos(fecha,importe,categoria,persona,nota,a_cobrar,liquidado,creado) VALUES(?,?,?,?,?,?,?,?)`,
		g.Fecha, g.Importe, g.Categoria, g.Persona, g.Nota, g.ACobrar, g.Liquidado, time.Now().Format(time.RFC3339))
	if err != nil {
		writeError(w, 500, "No se pudo guardar el gasto")
		return
	}
	id, _ := res.LastInsertId()
	g.ID = int(id)
	avisosTrasGasto(g, antesCat, antesTotal)
	writeJSON(w, 201, g)
}

// handleGastosSub atiende /gastos/mes, /gastos/exportar y /gastos/<id>.
func handleGastosSub(w http.ResponseWriter, r *http.Request) {
	sub := strings.TrimPrefix(r.URL.Path, "/gastos/")
	switch {
	case sub == "mes" && r.Method == http.MethodGet:
		handleGastosMes(w, r)
	case sub == "exportar" && r.Method == http.MethodGet:
		handleGastosExportar(w, r)
	case sub == "categorias" || strings.HasPrefix(sub, "categorias/"):
		handleCategoriasGasto(w, r, strings.TrimPrefix(strings.TrimPrefix(sub, "categorias"), "/"))
	case sub == "reglas" || strings.HasPrefix(sub, "reglas/"):
		handleReglasGasto(w, r, strings.TrimPrefix(strings.TrimPrefix(sub, "reglas"), "/"))
	case sub == "recurrentes" || strings.HasPrefix(sub, "recurrentes/"):
		handleRecurrentesGasto(w, r, strings.TrimPrefix(strings.TrimPrefix(sub, "recurrentes"), "/"))
	case sub == "factura-categoria" && r.Method == http.MethodPut:
		handleFacturaCategoria(w, r)
	case sub == "prevision":
		handlePrevision(w, r)
	case sub == "suscripciones" || strings.HasPrefix(sub, "suscripciones/"):
		handleSuscripciones(w, r, strings.TrimPrefix(strings.TrimPrefix(sub, "suscripciones"), "/"))
	case sub == "aportacion":
		handleAportacion(w, r)
	case sub == "liquidar" && r.Method == http.MethodPost:
		handleGastosLiquidar(w, r)
	case strings.HasSuffix(sub, "/ticket"):
		if id, err := strconv.Atoi(strings.TrimSuffix(sub, "/ticket")); err == nil && id > 0 {
			handleTicketGasto(w, r, id)
		} else {
			writeError(w, 404, "No encontrado")
		}
	default:
		id, err := strconv.Atoi(sub)
		if err != nil || id <= 0 {
			writeError(w, 404, "No encontrado")
			return
		}
		switch r.Method {
		case http.MethodPut:
			var g Gasto
			if err := decodeJSON(r, &g); err != nil {
				writeError(w, 400, "JSON inválido")
				return
			}
			if msg := validarGasto(&g); msg != "" {
				writeError(w, 400, msg)
				return
			}
			mes := g.Fecha[:7]
			antesCat, antesTotal := sumaCategoriaMes(mes, g.Categoria), sumaGastosMes(mes)
			res, err := db.Exec(`UPDATE gastos SET fecha=?, importe=?, categoria=?, persona=?, nota=?, a_cobrar=?, liquidado=? WHERE id=?`,
				g.Fecha, g.Importe, g.Categoria, g.Persona, g.Nota, g.ACobrar, g.Liquidado, id)
			if err != nil {
				writeError(w, 500, "No se pudo actualizar el gasto")
				return
			}
			if n, _ := res.RowsAffected(); n == 0 {
				writeError(w, 404, "Gasto no encontrado")
				return
			}
			g.ID = id
			avisosTrasGasto(g, antesCat, antesTotal)
			writeJSON(w, 200, g)
		case http.MethodDelete:
			var arch string
			db.QueryRow("SELECT COALESCE(ticket,'') FROM gastos WHERE id=?", id).Scan(&arch)
			res, err := db.Exec("DELETE FROM gastos WHERE id=?", id)
			if err != nil {
				writeError(w, 500, "No se pudo borrar el gasto")
				return
			}
			if n, _ := res.RowsAffected(); n == 0 {
				writeError(w, 404, "Gasto no encontrado")
				return
			}
			borrarTicketGasto(arch)
			writeJSON(w, 200, map[string]bool{"success": true})
		default:
			w.Header().Set("Allow", "PUT, DELETE")
			writeError(w, 405, "Método no permitido")
		}
	}
}

type facturaMes struct {
	ID        int     `json:"id"`
	Nombre    string  `json:"nombre"`
	Importe   float64 `json:"importe"`
	Persona   string  `json:"persona"`
	FechaPago string  `json:"fecha_pago"`
	Categoria string  `json:"categoria"`
	Media     float64 `json:"media,omitempty"`    // media de los últimos pagos con ese nombre
	SubePct   int     `json:"sube_pct,omitempty"` // % que sube respecto a la media (solo si es claro)
}

// Categoría de las facturas por nombre (afecta a todas las facturas con ese nombre, pasadas y futuras).
func categoriasFacturas() map[string]string {
	m := map[string]string{}
	rows, err := db.Query("SELECT nombre, categoria FROM facturas_categoria")
	if err != nil {
		return m
	}
	defer rows.Close()
	for rows.Next() {
		var n, c string
		if rows.Scan(&n, &c) == nil {
			if _, ok := nombreCategoria(c); ok {
				m[n] = c
			}
		}
	}
	return m
}

func claveFactura(nombre string) string { return strings.ToLower(strings.TrimSpace(nombre)) }

func handleFacturaCategoria(w http.ResponseWriter, r *http.Request) {
	var in struct {
		Nombre    string `json:"nombre"`
		Categoria string `json:"categoria"`
	}
	if err := decodeJSON(r, &in); err != nil {
		writeError(w, 400, "JSON inválido")
		return
	}
	k := claveFactura(in.Nombre)
	if k == "" {
		writeError(w, 400, "Falta el nombre de la factura")
		return
	}
	if in.Categoria == "" || in.Categoria == "facturas" {
		if _, err := db.Exec("DELETE FROM facturas_categoria WHERE nombre=?", k); err != nil {
			writeError(w, 500, "No se pudo guardar la categoría")
			return
		}
	} else {
		if _, ok := nombreCategoria(in.Categoria); !ok {
			writeError(w, 400, "Categoría desconocida")
			return
		}
		if _, err := db.Exec("INSERT INTO facturas_categoria(nombre,categoria) VALUES(?,?) ON CONFLICT(nombre) DO UPDATE SET categoria=excluded.categoria", k, in.Categoria); err != nil {
			writeError(w, 500, "No se pudo guardar la categoría")
			return
		}
	}
	writeJSON(w, 200, map[string]string{"ok": "1"})
}

func handleGastosMes(w http.ResponseWriter, r *http.Request) {
	mes := r.URL.Query().Get("mes")
	if mes == "" {
		mes = time.Now().Format("2006-01")
	}
	desde, hasta, ok := rangoMes(mes)
	if !ok {
		writeError(w, 400, "Mes inválido (usa AAAA-MM)")
		return
	}

	generarRecurrentes()
	gastos := []Gasto{}
	rows, err := db.Query(`SELECT id,fecha,importe,categoria,persona,nota,COALESCE(a_cobrar,0),COALESCE(liquidado,0),COALESCE(recurrente_id,0),COALESCE(ticket,'')<>'' FROM gastos WHERE fecha>=? AND fecha<? ORDER BY fecha DESC, id DESC`, desde, hasta)
	if err != nil {
		writeError(w, 500, "Error al cargar los gastos")
		return
	}
	for rows.Next() {
		var g Gasto
		if rows.Scan(&g.ID, &g.Fecha, &g.Importe, &g.Categoria, &g.Persona, &g.Nota, &g.ACobrar, &g.Liquidado, &g.RecurrenteID, &g.Ticket) == nil {
			gastos = append(gastos, g)
		}
	}
	rows.Close()

	facturas := []facturaMes{}
	rows, err = db.Query(`SELECT id,nombre,importe,persona,fecha_pago FROM pagos_historial WHERE fecha_pago>=? AND fecha_pago<? ORDER BY fecha_pago DESC, id DESC`, desde, hasta)
	if err == nil {
		for rows.Next() {
			var f facturaMes
			if rows.Scan(&f.ID, &f.Nombre, &f.Importe, &f.Persona, &f.FechaPago) == nil {
				facturas = append(facturas, f)
			}
		}
		rows.Close()
	}

	catFact := categoriasFacturas()
	reglas := listarReglas()
	for i := range facturas {
		facturas[i].Categoria = categoriaDeFactura(facturas[i].Nombre, catFact, reglas)
		facturas[i].Media, facturas[i].SubePct = subidaFactura(facturas[i].Nombre, facturas[i].Importe, facturas[i].FechaPago)
	}
	porCategoria := map[string]float64{}
	porPersona := map[string]float64{}
	var totalGastos, totalFacturas float64
	for _, g := range gastos {
		porCategoria[g.Categoria] += g.Importe
		porPersona[g.Persona] += g.Importe
		totalGastos += g.Importe
	}
	for _, f := range facturas {
		porCategoria[f.Categoria] += f.Importe
		p := f.Persona
		if p == "" || p == "Todos" {
			p = "Conjunta"
		}
		porPersona[p] += f.Importe
		totalFacturas += f.Importe
	}
	for k, v := range porCategoria {
		porCategoria[k] = redondear(v)
	}
	for k, v := range porPersona {
		porPersona[k] = redondear(v)
	}

	// Totales de los últimos 6 meses (incluido el actual) para la gráfica de evolución.
	t0, _ := time.Parse("2006-01", mes)
	type mesTotal struct {
		Mes   string  `json:"mes"`
		Total float64 `json:"total"`
	}
	meses := []mesTotal{}
	for i := 5; i >= 0; i-- {
		m := t0.AddDate(0, -i, 0).Format("2006-01")
		meses = append(meses, mesTotal{m, sumaGastosMes(m)})
	}

	presupuestos := map[string]float64{}
	if prows, err := db.Query("SELECT categoria, importe FROM presupuestos"); err == nil {
		for prows.Next() {
			var c string
			var v float64
			if prows.Scan(&c, &v) == nil {
				presupuestos[c] = v
			}
		}
		prows.Close()
	}

	// Lo que está pendiente de devolver (de todos los meses): por cada persona que adelantó dinero.
	pendientes := map[string]float64{}
	if prows, err := db.Query(`SELECT persona, SUM(a_cobrar) FROM gastos WHERE COALESCE(liquidado,0)=0 AND COALESCE(a_cobrar,0)>0 GROUP BY persona`); err == nil {
		for prows.Next() {
			var c string
			var v float64
			if prows.Scan(&c, &v) == nil {
				pendientes[c] = redondear(v)
			}
		}
		prows.Close()
	}

	proximos := []proximoPago{}
	if mes == time.Now().Format("2006-01") {
		proximos = proximosPagosMes(mes, hasta)
	}
	writeJSON(w, 200, map[string]any{
		"pendientes":       pendientes,
		"pendientes_lista": listaPendientes(),
		"mes":              mes,
		"gastos":           gastos,
		"facturas":         facturas,
		"resumen": map[string]any{
			"total":          redondear(totalGastos + totalFacturas),
			"total_gastos":   redondear(totalGastos),
			"total_facturas": redondear(totalFacturas),
			"por_categoria":  porCategoria,
			"por_persona":    porPersona,
			"mes_anterior":   sumaGastosMes(t0.AddDate(0, -1, 0).Format("2006-01")),
			"meses":          meses,
			"cat_anterior":   categoriasDeMes(t0.AddDate(0, -1, 0).Format("2006-01")),
			"cat_media":      mediaCategorias(mes, 3),
		},
		"presupuestos": presupuestos,
		"categorias":   categoriasPropias(),
		"reglas":       reglas,
		"recurrentes":  listarRecurrentes(),
		"proximos":     proximos,
	})
}

type CategoriaGasto struct {
	ID     string `json:"id"`
	Nombre string `json:"nombre"`
	Icono  string `json:"icono"`
	Color  string `json:"color"`
}

func categoriasPropias() []CategoriaGasto {
	out := []CategoriaGasto{}
	rows, err := db.Query("SELECT id,nombre,icono,color FROM categorias_gasto ORDER BY rowid")
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var c CategoriaGasto
		if rows.Scan(&c.ID, &c.Nombre, &c.Icono, &c.Color) == nil {
			out = append(out, c)
		}
	}
	return out
}

// handleCategoriasGasto: GET lista, POST crea, DELETE /gastos/categorias/<id> borra
// (sus gastos pasan a "Otros" y se quita su presupuesto).
func handleCategoriasGasto(w http.ResponseWriter, r *http.Request, id string) {
	switch {
	case id == "" && r.Method == http.MethodGet:
		writeJSON(w, 200, categoriasPropias())
	case id == "" && r.Method == http.MethodPost:
		var c CategoriaGasto
		if err := decodeJSON(r, &c); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		c.Nombre = strings.TrimSpace(c.Nombre)
		c.Icono = strings.TrimSpace(c.Icono)
		if r2 := []rune(c.Nombre); len(r2) == 0 || len(r2) > 30 {
			writeError(w, 400, "Pon un nombre de hasta 30 letras")
			return
		}
		if r2 := []rune(c.Icono); len(r2) == 0 || len(r2) > 8 {
			c.Icono = "🏷️"
		}
		if len(c.Color) != 7 || c.Color[0] != '#' {
			c.Color = "#64748b"
		}
		for _, n := range nombresCategoriaGasto {
			if strings.EqualFold(n, c.Nombre) {
				writeError(w, 400, "Ya existe una categoría con ese nombre")
				return
			}
		}
		for _, o := range categoriasPropias() {
			if strings.EqualFold(o.Nombre, c.Nombre) {
				writeError(w, 400, "Ya existe una categoría con ese nombre")
				return
			}
		}
		c.ID = "c" + strconv.FormatInt(time.Now().UnixNano(), 36)
		if _, err := db.Exec("INSERT INTO categorias_gasto(id,nombre,icono,color) VALUES(?,?,?,?)", c.ID, c.Nombre, c.Icono, c.Color); err != nil {
			writeError(w, 500, "No se pudo crear la categoría")
			return
		}
		writeJSON(w, 201, c)
	case id != "" && r.Method == http.MethodDelete:
		if _, fija := nombresCategoriaGasto[id]; fija {
			writeError(w, 400, "Las categorías de serie no se pueden borrar")
			return
		}
		db.Exec("UPDATE gastos SET categoria='otros' WHERE categoria=?", id)
		db.Exec("DELETE FROM presupuestos WHERE categoria=?", id)
		db.Exec("DELETE FROM categorias_gasto WHERE id=?", id)
		writeJSON(w, 200, map[string]bool{"success": true})
	default:
		writeError(w, 405, "Método no permitido")
	}
}

func celdaCSV(s string) string {
	s = strings.ReplaceAll(s, "\"", "\"\"")
	return "\"" + s + "\""
}

func importeCSV(v float64) string { return strings.Replace(fmt.Sprintf("%.2f", v), ".", ",", 1) }

// handleGastosExportar descarga un CSV (UTF-8 con BOM, separado por ; para que Excel en español lo abra bien).
// Con ?mes=AAAA-MM exporta ese mes; sin él, todo.
func handleGastosExportar(w http.ResponseWriter, r *http.Request) {
	mes := r.URL.Query().Get("mes")
	where, args := "", []any{}
	whereF := ""
	nombre := "gastos-hogar-todo.csv"
	if mes != "" {
		desde, hasta, ok := rangoMes(mes)
		if !ok {
			writeError(w, 400, "Mes inválido")
			return
		}
		where, whereF = " WHERE fecha>=? AND fecha<?", " WHERE fecha_pago>=? AND fecha_pago<?"
		args = []any{desde, hasta}
		nombre = "gastos-hogar-" + mes + ".csv"
	}
	var b strings.Builder
	b.WriteString("\xef\xbb\xbfFecha;Tipo;Categoría;Pagado con;Importe;Nota;Te deben;Liquidado\r\n")
	rows, err := db.Query("SELECT fecha,categoria,persona,importe,nota,COALESCE(a_cobrar,0),COALESCE(liquidado,0) FROM gastos"+where+" ORDER BY fecha, id", args...)
	if err != nil {
		writeError(w, 500, "No se pudo exportar")
		return
	}
	for rows.Next() {
		var f, c, p, n string
		var imp, deben float64
		var liq bool
		if rows.Scan(&f, &c, &p, &imp, &n, &deben, &liq) == nil {
			cat, _ := nombreCategoria(c)
			si := ""
			if deben > 0 {
				si = "No"
				if liq {
					si = "Sí"
				}
			}
			b.WriteString(strings.Join([]string{f, "Gasto", celdaCSV(cat), celdaCSV(p), importeCSV(imp), celdaCSV(n), importeCSV(deben), si}, ";") + "\r\n")
		}
	}
	rows.Close()
	catFact := categoriasFacturas()
	reglasExp := listarReglas()
	rows, err = db.Query("SELECT fecha_pago,persona,importe,nombre FROM pagos_historial"+whereF+" ORDER BY fecha_pago, id", args...)
	if err == nil {
		for rows.Next() {
			var f, p, n string
			var imp float64
			if rows.Scan(&f, &p, &imp, &n) == nil {
				if p == "" || p == "Todos" {
					p = "Conjunta"
				}
				catF := "Facturas"
				if c := categoriaDeFactura(n, catFact, reglasExp); c != "facturas" {
					catF, _ = nombreCategoria(c)
				}
				b.WriteString(strings.Join([]string{f, "Factura", celdaCSV(catF), celdaCSV(p), importeCSV(imp), celdaCSV(n), "", ""}, ";") + "\r\n")
			}
		}
		rows.Close()
	}
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+nombre+`"`)
	w.Write([]byte(b.String()))
}

func handlePresupuestos(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPut {
		w.Header().Set("Allow", "PUT")
		writeError(w, 405, "Método no permitido")
		return
	}
	var d struct {
		Categoria string  `json:"categoria"`
		Importe   float64 `json:"importe"`
	}
	if err := decodeJSON(r, &d); err != nil {
		writeError(w, 400, "JSON inválido")
		return
	}
	if _, ok := nombreCategoria(d.Categoria); !ok && d.Categoria != "_total" {
		writeError(w, 400, "Categoría inválida")
		return
	}
	if math.IsNaN(d.Importe) || d.Importe < 0 || d.Importe > 10000000 {
		writeError(w, 400, "Importe inválido")
		return
	}
	var err error
	if d.Importe == 0 {
		_, err = db.Exec("DELETE FROM presupuestos WHERE categoria=?", d.Categoria)
	} else {
		_, err = db.Exec("INSERT OR REPLACE INTO presupuestos(categoria, importe) VALUES(?,?)", d.Categoria, redondear(d.Importe))
	}
	if err != nil {
		writeError(w, 500, "No se pudo guardar el presupuesto")
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}

// handleGastosLiquidar marca como devueltos todos los gastos pendientes que adelantó una persona.
func handleGastosLiquidar(w http.ResponseWriter, r *http.Request) {
	var d struct {
		Persona string `json:"persona"`
	}
	if err := decodeJSON(r, &d); err != nil || strings.TrimSpace(d.Persona) == "" {
		writeError(w, 400, "Falta la persona")
		return
	}
	res, err := db.Exec(`UPDATE gastos SET liquidado=1 WHERE persona=? AND COALESCE(a_cobrar,0)>0 AND COALESCE(liquidado,0)=0`, strings.TrimSpace(d.Persona))
	if err != nil {
		writeError(w, 500, "No se pudo liquidar")
		return
	}
	n, _ := res.RowsAffected()
	writeJSON(w, 200, map[string]int64{"liquidados": n})
}

// gastoHogarMes: lo que ha salido realmente "de la casa" en un mes: gastos de la cuenta conjunta,
// gastos adelantados desde una cuenta personal que hay que devolver, y facturas pagadas.
func gastoHogarMes(mes string) (gastos, facturas float64) {
	desde, hasta, ok := rangoMes(mes)
	if !ok {
		return 0, 0
	}
	db.QueryRow(`SELECT COALESCE(SUM(importe),0) FROM gastos WHERE fecha>=? AND fecha<? AND (persona='Conjunta' OR COALESCE(a_cobrar,0)>0)`, desde, hasta).Scan(&gastos)
	db.QueryRow(`SELECT COALESCE(SUM(importe),0) FROM pagos_historial WHERE fecha_pago>=? AND fecha_pago<?`, desde, hasta).Scan(&facturas)
	return redondear(gastos), redondear(facturas)
}

func aporteConfig(persona string, defecto float64) float64 {
	var v string
	if db.QueryRow("SELECT valor FROM config WHERE clave=?", "aporte_"+persona).Scan(&v) == nil {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return defecto
}

// handleAportacion: GET calcula cuánto debería aportarse al mes según el gasto real observado;
// PUT guarda lo que aporta cada uno actualmente.
func handleAportacion(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPut {
		var d struct {
			A float64 `json:"a"`
			B float64 `json:"b"`
		}
		if err := decodeJSON(r, &d); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		for _, v := range []float64{d.A, d.B} {
			if math.IsNaN(v) || v < 0 || v > 10000000 {
				writeError(w, 400, "Importe inválido")
				return
			}
		}
		db.Exec("INSERT OR REPLACE INTO config(clave,valor) VALUES('aporte_a',?),('aporte_b',?)",
			strconv.FormatFloat(redondear(d.A), 'f', 2, 64), strconv.FormatFloat(redondear(d.B), 'f', 2, 64))
		writeJSON(w, 200, map[string]bool{"success": true})
		return
	}
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET, PUT")
		writeError(w, 405, "Método no permitido")
		return
	}
	hoy := time.Now()
	primero := time.Date(hoy.Year(), hoy.Month(), 1, 0, 0, 0, 0, hoy.Location())
	type fila struct {
		Mes      string  `json:"mes"`
		Total    float64 `json:"total"`
		Gastos   float64 `json:"gastos"`
		Facturas float64 `json:"facturas"`
	}
	meses := []fila{}
	// Hasta 6 meses completos anteriores que tengan datos (se ignoran los vacíos, p. ej. antes de empezar a usar la app).
	for i := 1; i <= 6; i++ {
		m := primero.AddDate(0, -i, 0).Format("2006-01")
		g, f := gastoHogarMes(m)
		if g+f > 0 {
			meses = append(meses, fila{m, redondear(g + f), g, f})
		}
	}
	// Mes en curso (parcial) y proyección lineal
	gAct, fAct := gastoHogarMes(primero.Format("2006-01"))
	diasMes := primero.AddDate(0, 1, -1).Day()
	proyeccion := 0.0
	if hoy.Day() >= 7 {
		proyeccion = redondear((gAct + fAct) / float64(hoy.Day()) * float64(diasMes))
	}
	var media3, media6, maximo float64
	for i, m := range meses {
		media6 += m.Total
		if i < 3 {
			media3 += m.Total
		}
		if m.Total > maximo {
			maximo = m.Total
		}
	}
	n3 := len(meses)
	if n3 > 3 {
		n3 = 3
	}
	if n3 > 0 {
		media3 = redondear(media3 / float64(n3))
		media6 = redondear(media6 / float64(len(meses)))
	}
	base := media3
	colchon := redondear(base * 0.10)
	recomendada := math.Ceil((base+colchon)/5) * 5
	if len(meses) == 0 {
		recomendada = 0
	}
	y, p := aporteConfig("a", 0), aporteConfig("b", 0)
	actual := redondear(y + p)
	// Reparto sugerido con la misma proporción que ya tenéis
	ry := 0.5
	if actual > 0 {
		ry = y / actual
	}
	sugY := redondear(recomendada * ry)
	sugP := redondear(recomendada - sugY)
	writeJSON(w, 200, map[string]any{
		"meses":        meses,
		"media_3":      media3,
		"media_6":      media6,
		"maximo":       maximo,
		"colchon":      colchon,
		"recomendada":  recomendada,
		"actual":       actual,
		"aporte":       map[string]float64{"a": y, "b": p},
		"sugerido":     map[string]float64{"a": sugY, "b": sugP},
		"proporcion_a": redondear(ry * 100),
		"mes_actual":   map[string]float64{"llevado": redondear(gAct + fAct), "proyeccion": proyeccion},
	})
}
