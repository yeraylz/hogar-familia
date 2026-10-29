package main

import (
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"
)

// Previsión de la cuenta conjunta: calendario de pagos por semanas, aviso de saldo
// antes de un cargo grande y lista de suscripciones.

type movPrev struct {
	Fecha    string  `json:"fecha"`
	Nombre   string  `json:"nombre"`
	Importe  float64 `json:"importe"`
	Tipo     string  `json:"tipo"` // factura | fijo | hipoteca | ingreso
	Pagado   bool    `json:"pagado,omitempty"`
	Saldo    float64 `json:"saldo,omitempty"` // saldo previsto justo después
	ConSaldo bool    `json:"con_saldo,omitempty"`
}

func configNum(clave string, defecto float64) float64 {
	var v string
	if db.QueryRow("SELECT valor FROM config WHERE clave=?", clave).Scan(&v) == nil {
		if f, err := strconv.ParseFloat(v, 64); err == nil {
			return f
		}
	}
	return defecto
}

func configTexto(clave string) string {
	var v string
	db.QueryRow("SELECT valor FROM config WHERE clave=?", clave).Scan(&v)
	return v
}

func fmtNum(v float64) string { return strconv.FormatFloat(redondear(v), 'f', 2, 64) }

// tieneHipotecaEnPagos: si la hipoteca ya está apuntada como pago o gasto fijo no se cuenta dos veces.
func hipotecaYaApuntada() bool {
	var n int
	db.QueryRow(`SELECT (SELECT COUNT(*) FROM pagos WHERE LOWER(nombre) LIKE '%hipoteca%') + (SELECT COUNT(*) FROM gastos_recurrentes WHERE activo=1 AND LOWER(nota) LIKE '%hipoteca%')`).Scan(&n)
	return n > 0
}

// movimientosFuturos genera los cargos e ingresos previstos de la cuenta conjunta entre desde y hasta (ambos incluidos).
func movimientosFuturos(desde, hasta string) []movPrev {
	out := []movPrev{}
	d0, err1 := time.Parse(dateLayout, desde)
	d1, err2 := time.Parse(dateLayout, hasta)
	if err1 != nil || err2 != nil || d1.Before(d0) {
		return out
	}
	// Facturas pendientes, repetidas según su frecuencia. Una vencida cuenta el primer día.
	if rows, err := db.Query("SELECT nombre,importe,frecuencia,fecha FROM pagos WHERE pagado=0 AND importe>0"); err == nil {
		for rows.Next() {
			var n, fr, f string
			var imp float64
			if rows.Scan(&n, &imp, &fr, &f) != nil {
				continue
			}
			cur, primera := f, true
			for i := 0; i < 80 && cur <= hasta; i++ {
				switch {
				case cur >= desde:
					out = append(out, movPrev{Fecha: cur, Nombre: n, Importe: imp, Tipo: "factura"})
				case primera: // vencida y sin pagar: cuenta el primer día
					out = append(out, movPrev{Fecha: desde, Nombre: n, Importe: imp, Tipo: "factura"})
				}
				primera = false
				if fr == "puntual" || fr == "" {
					break
				}
				nx, err := siguienteFecha(cur, fr)
				if err != nil || nx <= cur {
					break
				}
				cur = nx
			}
		}
		rows.Close()
	}
	// Meses afectados
	hoyMes := time.Now().Format("2006-01")
	for m := time.Date(d0.Year(), d0.Month(), 1, 0, 0, 0, 0, time.UTC); !m.After(d1); m = m.AddDate(0, 1, 0) {
		mes := m.Format("2006-01")
		for _, x := range listarRecurrentes() {
			if !x.Activo || x.Importe <= 0 {
				continue
			}
			var ult string
			db.QueryRow("SELECT ultimo_mes FROM gastos_recurrentes WHERE id=?", x.ID).Scan(&ult)
			if mes <= hoyMes && ult >= mes {
				continue // ya apuntado en gastos
			}
			if f, ok := diaDelMes(mes, x.Dia); ok && f >= desde && f <= hasta {
				out = append(out, movPrev{Fecha: f, Nombre: x.Nota, Importe: x.Importe, Tipo: "fijo"})
			}
		}
		if !hipotecaYaApuntada() {
			var raw string
			if db.QueryRow("SELECT valor FROM config WHERE clave='hipoteca'").Scan(&raw) == nil {
				var h Hipoteca
				if json.Unmarshal([]byte(raw), &h) == nil && h.Cuota > 0 && h.DiaCobro > 0 {
					if f, ok := diaDelMes(mes, h.DiaCobro); ok && f >= desde && f <= hasta {
						out = append(out, movPrev{Fecha: f, Nombre: "Hipoteca", Importe: h.Cuota, Tipo: "hipoteca"})
					}
				}
			}
		}
		aporte := aporteConfig("a", 0) + aporteConfig("b", 0)
		if aporte > 0 {
			dia := int(configNum("aporte_dia", 1))
			if dia < 1 || dia > 28 {
				dia = 1
			}
			if f, ok := diaDelMes(mes, dia); ok && f >= desde && f <= hasta {
				out = append(out, movPrev{Fecha: f, Nombre: "Aportaciones a la cuenta", Importe: redondear(aporte), Tipo: "ingreso"})
			}
		}
	}
	sort.SliceStable(out, func(i, j int) bool {
		if out[i].Fecha != out[j].Fecha {
			return out[i].Fecha < out[j].Fecha
		}
		return out[i].Tipo == "ingreso" && out[j].Tipo != "ingreso" // el ingreso del día entra primero
	})
	return out
}

// gastoVariableDia: lo que suele salir al día de la cuenta conjunta en compras sueltas (media de los 3 meses anteriores).
func gastoVariableDia() float64 {
	t0 := time.Now()
	var suma float64
	n := 0
	for i := 1; i <= 3; i++ {
		desde, hasta, ok := rangoMes(t0.AddDate(0, -i, 0).Format("2006-01"))
		if !ok {
			continue
		}
		var v float64
		db.QueryRow(`SELECT COALESCE(SUM(importe),0) FROM gastos WHERE fecha>=? AND fecha<? AND (persona='Conjunta' OR COALESCE(a_cobrar,0)>0) AND COALESCE(recurrente_id,0)=0`, desde, hasta).Scan(&v)
		if v > 0 {
			suma += v
			n++
		}
	}
	if n == 0 {
		return 0
	}
	return redondear(suma / float64(n) / 30)
}

type estadoCuenta struct {
	Configurada bool
	Saldo       float64 // el que introdujo la persona
	Fecha       string
	SaldoHoy    float64 // estimado hoy
}

// estadoCuentaConjunta: saldo estimado de hoy a partir del último saldo introducido, descontando lo ocurrido desde entonces.
func estadoCuentaConjunta() estadoCuenta {
	e := estadoCuenta{Fecha: configTexto("conjunta_fecha")}
	raw := configTexto("conjunta_saldo")
	if raw == "" || e.Fecha == "" {
		return e
	}
	s, err := strconv.ParseFloat(raw, 64)
	if err != nil {
		return e
	}
	e.Configurada, e.Saldo = true, s
	hoy := time.Now().Format(dateLayout)
	est := s
	if e.Fecha < hoy {
		var g, f float64
		db.QueryRow(`SELECT COALESCE(SUM(importe),0) FROM gastos WHERE fecha>? AND fecha<=? AND (persona='Conjunta' OR COALESCE(a_cobrar,0)>0)`, e.Fecha, hoy).Scan(&g)
		db.QueryRow(`SELECT COALESCE(SUM(importe),0) FROM pagos_historial WHERE fecha_pago>? AND fecha_pago<=?`, e.Fecha, hoy).Scan(&f)
		est -= g + f
		if t, err := time.Parse(dateLayout, e.Fecha); err == nil {
			// ingresos y cuota de la hipoteca (no figuran en gastos) entre el saldo y hoy
			for _, m := range movimientosFuturos(t.AddDate(0, 0, 1).Format(dateLayout), hoy) {
				if m.Tipo == "ingreso" {
					est += m.Importe
				} else if m.Tipo == "hipoteca" {
					est -= m.Importe
				}
			}
		}
	}
	e.SaldoHoy = redondear(est)
	return e
}

// proyectar aplica los movimientos día a día sobre el saldo de hoy y anota el saldo tras cada cargo.
func proyectar(e estadoCuenta, movs []movPrev, hoy, hasta string) ([]movPrev, float64, string, float64) {
	saldo := e.SaldoHoy
	var_dia := gastoVariableDia()
	minimo, minFecha := saldo, hoy
	t0, _ := time.Parse(dateLayout, hoy)
	t1, _ := time.Parse(dateLayout, hasta)
	i := 0
	for d := t0; !d.After(t1); d = d.AddDate(0, 0, 1) {
		f := d.Format(dateLayout)
		if f != hoy {
			saldo -= var_dia
		}
		for i < len(movs) && movs[i].Fecha == f {
			if movs[i].Tipo == "ingreso" {
				saldo += movs[i].Importe
			} else {
				saldo -= movs[i].Importe
			}
			movs[i].Saldo, movs[i].ConSaldo = redondear(saldo), true
			i++
		}
		if saldo < minimo {
			minimo, minFecha = saldo, f
		}
	}
	return movs, redondear(saldo), minFecha, redondear(minimo)
}

type semanaPrev struct {
	Desde string    `json:"desde"`
	Hasta string    `json:"hasta"`
	Total float64   `json:"total"`
	Items []movPrev `json:"items"`
}

func handlePrevision(w http.ResponseWriter, r *http.Request) {
	if r.Method == http.MethodPut {
		var d struct {
			Saldo     *float64 `json:"saldo"`
			Colchon   *float64 `json:"colchon"`
			Grande    *float64 `json:"grande"`
			AporteDia *int     `json:"aporte_dia"`
		}
		if err := decodeJSON(r, &d); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		ok := func(v float64) bool { return !math.IsNaN(v) && math.Abs(v) <= 100000000 }
		if d.Saldo != nil {
			if !ok(*d.Saldo) {
				writeError(w, 400, "Saldo inválido")
				return
			}
			guardarConfig("conjunta_saldo", fmtNum(*d.Saldo))
			guardarConfig("conjunta_fecha", time.Now().Format(dateLayout))
		}
		if d.Colchon != nil && ok(*d.Colchon) && *d.Colchon >= 0 {
			guardarConfig("conjunta_colchon", fmtNum(*d.Colchon))
		}
		if d.Grande != nil && ok(*d.Grande) && *d.Grande >= 0 {
			guardarConfig("conjunta_grande", fmtNum(*d.Grande))
		}
		if d.AporteDia != nil && *d.AporteDia >= 1 && *d.AporteDia <= 28 {
			guardarConfig("aporte_dia", strconv.Itoa(*d.AporteDia))
		}
		writeJSON(w, 200, map[string]bool{"success": true})
		return
	}
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET, PUT")
		writeError(w, 405, "Método no permitido")
		return
	}
	mes := r.URL.Query().Get("mes")
	desdeMes, hastaMes, ok := rangoMes(mes) // hasta es exclusivo
	if !ok {
		mes = time.Now().Format("2006-01")
		desdeMes, hastaMes, _ = rangoMes(mes)
	}
	tHasta, _ := time.Parse(dateLayout, hastaMes)
	ultimoDia := tHasta.AddDate(0, 0, -1).Format(dateLayout)
	hoy := time.Now().Format(dateLayout)

	// Movimientos del mes: pagados (historial) + previstos (desde hoy)
	items := []movPrev{}
	if rows, err := db.Query("SELECT nombre,importe,fecha_pago FROM pagos_historial WHERE fecha_pago>=? AND fecha_pago<?", desdeMes, hastaMes); err == nil {
		for rows.Next() {
			var m movPrev
			if rows.Scan(&m.Nombre, &m.Importe, &m.Fecha) == nil {
				m.Tipo, m.Pagado = "factura", true
				items = append(items, m)
			}
		}
		rows.Close()
	}
	// Gastos fijos ya apuntados este mes
	if rows, err := db.Query("SELECT nota,importe,fecha FROM gastos WHERE fecha>=? AND fecha<? AND COALESCE(recurrente_id,0)>0 AND importe>0", desdeMes, hastaMes); err == nil {
		for rows.Next() {
			var m movPrev
			if rows.Scan(&m.Nombre, &m.Importe, &m.Fecha) == nil {
				m.Tipo, m.Pagado = "fijo", true
				items = append(items, m)
			}
		}
		rows.Close()
	}
	// Previstos: desde hoy (o desde el 1 del mes si es futuro) hasta fin de mes
	ini := desdeMes
	if hoy > ini {
		ini = hoy
	}
	prev := []movPrev{}
	if ini <= ultimoDia {
		prev = movimientosFuturos(ini, ultimoDia)
	}

	est := estadoCuentaConjunta()
	resp := map[string]any{
		"mes":          mes,
		"configurada":  est.Configurada,
		"colchon":      configNum("conjunta_colchon", 100),
		"grande":       configNum("conjunta_grande", 150),
		"aporte_dia":   int(configNum("aporte_dia", 1)),
		"aporte":       redondear(aporteConfig("a", 0) + aporteConfig("b", 0)),
		"variable_dia": gastoVariableDia(),
	}
	if est.Configurada {
		resp["saldo"], resp["fecha_saldo"], resp["saldo_hoy"] = est.Saldo, est.Fecha, est.SaldoHoy
		// Proyección larga (hasta el fin del mes consultado o 45 días, lo que sea mayor) para calcular saldos
		hasta := ultimoDia
		if hoy > hasta {
			hasta = hoy
		}
		largo := time.Now().AddDate(0, 0, 45).Format(dateLayout)
		if largo > hasta {
			hasta = largo
		}
		todos := movimientosFuturos(hoy, hasta)
		todos, _, minFecha, minimo := proyectar(est, todos, hoy, hasta)
		for i := range prev {
			for _, t := range todos {
				if t.Fecha == prev[i].Fecha && t.Nombre == prev[i].Nombre && t.Importe == prev[i].Importe && t.ConSaldo {
					prev[i].Saldo, prev[i].ConSaldo = t.Saldo, true
					break
				}
			}
		}
		resp["minimo"] = map[string]any{"fecha": minFecha, "saldo": minimo}
		// Saldo previsto a fin del mes consultado
		if ultimoDia >= hoy {
			_, finMes, _, _ := proyectar(est, movimientosFuturos(hoy, ultimoDia), hoy, ultimoDia)
			resp["fin_mes"] = finMes
		}
	}
	items = append(items, prev...)
	sort.SliceStable(items, func(i, j int) bool { return items[i].Fecha < items[j].Fecha })

	// Semanas (lunes a domingo, recortadas al mes)
	semanas := []semanaPrev{}
	totalMes := 0.0
	t0, _ := time.Parse(dateLayout, desdeMes)
	for ini := t0; ini.Format(dateLayout) <= ultimoDia; {
		off := (int(ini.Weekday()) + 6) % 7 // lunes = 0
		fin := ini.AddDate(0, 0, 6-off)
		if fin.Format(dateLayout) > ultimoDia {
			fin = tHasta.AddDate(0, 0, -1)
		}
		s := semanaPrev{Desde: ini.Format(dateLayout), Hasta: fin.Format(dateLayout), Items: []movPrev{}}
		for _, m := range items {
			if m.Fecha >= s.Desde && m.Fecha <= s.Hasta {
				s.Items = append(s.Items, m)
				if m.Tipo != "ingreso" {
					s.Total += m.Importe
				}
			}
		}
		s.Total = redondear(s.Total)
		totalMes += s.Total
		semanas = append(semanas, s)
		ini = fin.AddDate(0, 0, 1)
	}
	resp["semanas"] = semanas
	resp["total_mes"] = redondear(totalMes)
	writeJSON(w, 200, resp)
}

func maxFecha(a, b string) string {
	if a > b {
		return a
	}
	return b
}

// ---------- Aviso de saldo antes de un cargo grande ----------

func revisarSaldoConjuntaParaAvisar() {
	ahora := time.Now()
	if ahora.Hour() < 9 || ahora.Hour() >= 21 {
		return
	}
	hoy := ahora.Format(dateLayout)
	if configTexto("aviso_saldo_dia") == hoy {
		return
	}
	guardarConfig("aviso_saldo_dia", hoy)
	est := estadoCuentaConjunta()
	if !est.Configurada {
		return
	}
	colchon, grande := configNum("conjunta_colchon", 100), configNum("conjunta_grande", 150)
	hasta := ahora.AddDate(0, 0, 14).Format(dateLayout)
	movs, _, _, _ := proyectar(est, movimientosFuturos(hoy, hasta), hoy, hasta)
	for _, m := range movs {
		if m.Tipo == "ingreso" || m.Importe < grande || !m.ConSaldo || m.Saldo >= colchon {
			continue
		}
		clave := "aviso_saldo:" + m.Fecha + ":" + claveFactura(m.Nombre)
		res, err := db.Exec("INSERT OR IGNORE INTO config(clave,valor) VALUES(?,?)", clave, hoy)
		if err != nil {
			continue
		}
		if n, _ := res.RowsAffected(); n == 0 {
			continue
		}
		t, _ := time.Parse(dateLayout, m.Fecha)
		cuerpo := fmt.Sprintf("El %d/%d sale %s (%.2f €) y la cuenta conjunta se quedaría en unos %.2f € (previsión)", t.Day(), int(t.Month()), m.Nombre, m.Importe, m.Saldo)
		if m.Saldo < 0 {
			cuerpo = fmt.Sprintf("El %d/%d sale %s (%.2f €) y no llega el saldo de la cuenta conjunta: faltarían unos %.2f € (previsión)", t.Day(), int(t.Month()), m.Nombre, m.Importe, -m.Saldo)
		}
		enviarPushFiltrado("⚠️ Saldo justo en la cuenta conjunta", cuerpo, "saldo-conjunta", "")
	}
	db.Exec("DELETE FROM config WHERE clave LIKE 'aviso_saldo:%' AND substr(clave,13,10) < ?", ahora.AddDate(0, 0, -60).Format(dateLayout))
}

// ---------- Suscripciones ----------

var palabrasSuscripcion = []string{"netflix", "spotify", "hbo", "max", "disney", "prime", "amazon", "youtube", "apple", "icloud", "dazn", "movistar", "filmin", "crunchyroll", "audible", "google one", "dropbox", "chatgpt", "claude", "gimnasio", "gym", "playstation", "xbox", "nintendo", "twitch", "tidal", "deezer", "skyshowtime", "paramount", "atresplayer", "kindle", "office", "microsoft", "adobe", "vpn", "periódico", "periodico"}

func vecesAlAnio(fr string) float64 {
	switch fr {
	case "mensual":
		return 12
	case "bimestral":
		return 6
	case "trimestral":
		return 4
	case "semestral":
		return 2
	case "anual":
		return 1
	}
	return 0
}

func esPosibleSuscripcion(nombre string) bool {
	n := " " + strings.ToLower(nombre) + " "
	for _, p := range palabrasSuscripcion {
		if strings.Contains(n, " "+p+" ") || (len(p) > 4 && strings.Contains(n, p)) {
			return true
		}
	}
	return false
}

type suscripcion struct {
	ID         int     `json:"id"`
	Nombre     string  `json:"nombre"`
	Importe    float64 `json:"importe"`
	Frecuencia string  `json:"frecuencia"`
	Persona    string  `json:"persona"`
	Anual      float64 `json:"anual"`
	EnUso      bool    `json:"en_uso"`
	Revisada   string  `json:"revisada"`
	Suscrita   bool    `json:"suscripcion"`
	Posible    bool    `json:"posible,omitempty"`
}

func handleSuscripciones(w http.ResponseWriter, r *http.Request, resto string) {
	if resto != "" {
		if r.Method != http.MethodPut {
			w.Header().Set("Allow", "PUT")
			writeError(w, 405, "Método no permitido")
			return
		}
		id, err := strconv.Atoi(resto)
		if err != nil || id <= 0 {
			writeError(w, 404, "No encontrado")
			return
		}
		var d struct {
			Suscripcion *bool `json:"suscripcion"`
			EnUso       *bool `json:"en_uso"`
			Revisada    bool  `json:"revisada"`
		}
		if err := decodeJSON(r, &d); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		if d.Suscripcion != nil {
			db.Exec("UPDATE pagos SET suscripcion=?, en_uso=1, suscripcion_revisada=? WHERE id=?", b2i(*d.Suscripcion), time.Now().Format(dateLayout), id)
		}
		if d.EnUso != nil {
			db.Exec("UPDATE pagos SET en_uso=?, suscripcion_revisada=? WHERE id=?", b2i(*d.EnUso), time.Now().Format(dateLayout), id)
		}
		if d.Revisada {
			db.Exec("UPDATE pagos SET suscripcion_revisada=? WHERE id=?", time.Now().Format(dateLayout), id)
		}
		writeJSON(w, 200, map[string]bool{"success": true})
		return
	}
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, 405, "Método no permitido")
		return
	}
	lista, otras := []suscripcion{}, []suscripcion{}
	rows, err := db.Query(`SELECT id,nombre,importe,frecuencia,persona,COALESCE(suscripcion,0),COALESCE(en_uso,1),COALESCE(suscripcion_revisada,'') FROM pagos ORDER BY nombre COLLATE NOCASE`)
	if err != nil {
		writeError(w, 500, "Error al cargar las suscripciones")
		return
	}
	defer rows.Close()
	var anual, anualSinUso float64
	sinUso := 0
	for rows.Next() {
		var s suscripcion
		var sus, uso int
		if rows.Scan(&s.ID, &s.Nombre, &s.Importe, &s.Frecuencia, &s.Persona, &sus, &uso, &s.Revisada) != nil {
			continue
		}
		s.Anual, s.EnUso, s.Suscrita = redondear(s.Importe*vecesAlAnio(s.Frecuencia)), uso != 0, sus != 0
		if s.Suscrita {
			lista = append(lista, s)
			anual += s.Anual
			if !s.EnUso {
				sinUso++
				anualSinUso += s.Anual
			}
		} else {
			s.Posible = esPosibleSuscripcion(s.Nombre)
			otras = append(otras, s)
		}
	}
	sort.SliceStable(lista, func(i, j int) bool { return lista[i].Anual > lista[j].Anual })
	sort.SliceStable(otras, func(i, j int) bool { return otras[i].Posible && !otras[j].Posible })
	writeJSON(w, 200, map[string]any{
		"suscripciones": lista, "otras": otras,
		"anual": redondear(anual), "mensual": redondear(anual / 12),
		"sin_uso": sinUso, "ahorro_anual": redondear(anualSinUso),
	})
}

func b2i(b bool) int {
	if b {
		return 1
	}
	return 0
}
