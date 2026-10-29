package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"
)

// ---------- Comparativas por categoría ----------

// categoriasDeMes devuelve lo gastado en un mes por categoría (gastos y facturas, igual que el resumen).
func categoriasDeMes(mes string) map[string]float64 {
	out := map[string]float64{}
	desde, hasta, ok := rangoMes(mes)
	if !ok {
		return out
	}
	if rows, err := db.Query("SELECT categoria, SUM(importe) FROM gastos WHERE fecha>=? AND fecha<? GROUP BY categoria", desde, hasta); err == nil {
		for rows.Next() {
			var c string
			var v float64
			if rows.Scan(&c, &v) == nil {
				out[c] += v
			}
		}
		rows.Close()
	}
	catFact := categoriasFacturas()
	reglas := listarReglas()
	if rows, err := db.Query("SELECT nombre, importe FROM pagos_historial WHERE fecha_pago>=? AND fecha_pago<?", desde, hasta); err == nil {
		for rows.Next() {
			var n string
			var v float64
			if rows.Scan(&n, &v) == nil {
				out[categoriaDeFactura(n, catFact, reglas)] += v
			}
		}
		rows.Close()
	}
	for k, v := range out {
		out[k] = redondear(v)
	}
	return out
}

// mediaCategorias: media mensual de las categorías en los n meses anteriores a `mes` (solo cuenta los meses con datos).
func mediaCategorias(mes string, n int) map[string]float64 {
	t0, err := time.Parse("2006-01", mes)
	if err != nil {
		return map[string]float64{}
	}
	suma := map[string]float64{}
	meses := 0
	for i := 1; i <= n; i++ {
		m := categoriasDeMes(t0.AddDate(0, -i, 0).Format("2006-01"))
		total := 0.0
		for _, v := range m {
			total += v
		}
		if total <= 0 {
			continue
		}
		meses++
		for k, v := range m {
			suma[k] += v
		}
	}
	out := map[string]float64{}
	if meses == 0 {
		return out
	}
	for k, v := range suma {
		out[k] = redondear(v / float64(meses))
	}
	return out
}

// ---------- Facturas que suben ----------

// mediaFactura: media de los últimos 3 pagos anteriores con el mismo nombre (0 si hay menos de 2).
func mediaFactura(nombre, antesDe string) float64 {
	rows, err := db.Query(`SELECT importe FROM pagos_historial WHERE LOWER(nombre)=LOWER(?) AND fecha_pago<? AND importe>0 ORDER BY fecha_pago DESC, id DESC LIMIT 3`, nombre, antesDe)
	if err != nil {
		return 0
	}
	defer rows.Close()
	var suma float64
	n := 0
	for rows.Next() {
		var v float64
		if rows.Scan(&v) == nil {
			suma += v
			n++
		}
	}
	if n < 2 {
		return 0
	}
	return redondear(suma / float64(n))
}

// subidaFactura devuelve (media, % de subida) si la factura es claramente más cara de lo habitual.
func subidaFactura(nombre string, importe float64, fecha string) (float64, int) {
	media := mediaFactura(nombre, fecha)
	if media <= 0 || importe-media < 3 {
		return 0, 0
	}
	pct := int((importe-media)/media*100 + 0.5)
	if pct < 15 {
		return 0, 0
	}
	return media, pct
}

// avisarFacturaCara manda un aviso a la familia si la factura recién pagada sube mucho respecto a lo habitual.
func avisarFacturaCara(nombre string, importe float64) {
	hoy := time.Now().Format("2006-01-02")
	media, pct := subidaFactura(nombre, importe, hoy)
	if pct == 0 {
		return
	}
	cuerpo := fmt.Sprintf("%s: %.2f € (un %d %% más que lo habitual, %.2f €)", nombre, importe, pct, media)
	go enviarPushFiltrado("🧾 Una factura ha subido", cuerpo, "factura-sube", "")
}

// ---------- Foto del ticket ----------

func dirTickets() string { return filepath.Join(filepath.Dir(dbFile), "tickets") }

func borrarTicketGasto(archivo string) {
	if archivo != "" && archivo == filepath.Base(archivo) {
		os.Remove(filepath.Join(dirTickets(), archivo))
	}
}

// handleTicketGasto: POST (subir), GET (ver) y DELETE (quitar) la foto del ticket de un gasto.
func handleTicketGasto(w http.ResponseWriter, r *http.Request, id int) {
	var archivo string
	if db.QueryRow("SELECT COALESCE(ticket,'') FROM gastos WHERE id=?", id).Scan(&archivo) != nil {
		writeError(w, 404, "Gasto no encontrado")
		return
	}
	switch r.Method {
	case http.MethodGet:
		if archivo == "" || archivo != filepath.Base(archivo) {
			writeError(w, 404, "Sin ticket")
			return
		}
		crudo, err := os.ReadFile(filepath.Join(dirTickets(), archivo))
		if err != nil {
			writeError(w, 404, "El ticket ya no está disponible")
			return
		}
		datos, ok := abrirBytesChat(crudo)
		if !ok {
			writeError(w, 404, "No se puede descifrar el ticket")
			return
		}
		_, mime, _ := tipoAdjunto(datos[:min(len(datos), 512)])
		if mime == "" {
			writeError(w, 404, "No encontrado")
			return
		}
		w.Header().Set("Content-Type", mime)
		w.Header().Set("Cache-Control", "private, max-age=3600")
		w.Write(datos)
	case http.MethodPost:
		r.Body = http.MaxBytesReader(w, r.Body, maxImagenAdjunta+1<<20)
		if err := r.ParseMultipartForm(maxImagenAdjunta); err != nil {
			writeError(w, 400, "La foto es demasiado grande o no es válida")
			return
		}
		file, _, err := r.FormFile("archivo")
		if err != nil {
			writeError(w, 400, "No se ha recibido la foto")
			return
		}
		defer file.Close()
		datos, err := io.ReadAll(io.LimitReader(file, maxImagenAdjunta+1))
		if err != nil || len(datos) == 0 || len(datos) > maxImagenAdjunta {
			writeError(w, 400, "La foto está vacía o es demasiado grande")
			return
		}
		tipo, _, ext := tipoAdjunto(datos[:min(len(datos), 512)])
		if tipo != "imagen" {
			writeError(w, 400, "Solo se pueden guardar fotos")
			return
		}
		if err := os.MkdirAll(dirTickets(), 0o755); err != nil {
			writeError(w, 500, "No se pudo guardar la foto")
			return
		}
		nombre := fmt.Sprintf("%d-%d%s", id, time.Now().UnixNano(), ext)
		if err := os.WriteFile(filepath.Join(dirTickets(), nombre), sellarBytesChat(datos), 0o644); err != nil {
			writeError(w, 500, "No se pudo guardar la foto")
			return
		}
		if _, err := db.Exec("UPDATE gastos SET ticket=? WHERE id=?", nombre, id); err != nil {
			os.Remove(filepath.Join(dirTickets(), nombre))
			writeError(w, 500, "No se pudo guardar la foto")
			return
		}
		borrarTicketGasto(archivo)
		writeJSON(w, 200, map[string]bool{"ticket": true})
	case http.MethodDelete:
		db.Exec("UPDATE gastos SET ticket='' WHERE id=?", id)
		borrarTicketGasto(archivo)
		writeJSON(w, 200, map[string]bool{"ticket": false})
	default:
		w.Header().Set("Allow", "GET, POST, DELETE")
		writeError(w, 405, "Método no permitido")
	}
}

type pendienteGasto struct {
	ID      int     `json:"id"`
	Fecha   string  `json:"fecha"`
	Nota    string  `json:"nota"`
	Persona string  `json:"persona"`
	ACobrar float64 `json:"a_cobrar"`
}

// listaPendientes: los gastos concretos que forman lo «por devolver» (de todos los meses).
func listaPendientes() []pendienteGasto {
	out := []pendienteGasto{}
	rows, err := db.Query(`SELECT id, fecha, nota, persona, a_cobrar FROM gastos WHERE COALESCE(liquidado,0)=0 AND COALESCE(a_cobrar,0)>0 ORDER BY fecha DESC, id DESC LIMIT 40`)
	if err != nil {
		return out
	}
	defer rows.Close()
	for rows.Next() {
		var p pendienteGasto
		if rows.Scan(&p.ID, &p.Fecha, &p.Nota, &p.Persona, &p.ACobrar) == nil {
			p.Nota = strings.TrimSpace(p.Nota)
			out = append(out, p)
		}
	}
	return out
}
