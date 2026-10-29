package main

import (
	"encoding/json"
	"math"
	"net/http"
	"strings"
	"time"
)

// Hipoteca guarda los datos del préstamo; los cálculos (cuotas, intereses, simulador) se hacen en el cliente.
type Hipoteca struct {
	Nombre           string  `json:"nombre"`
	CapitalInicial   float64 `json:"capital_inicial"`
	Saldo            float64 `json:"saldo"`
	FechaSaldo       string  `json:"fecha_saldo"`
	FechaInicio      string  `json:"fecha_inicio"`
	FechaVencimiento string  `json:"fecha_vencimiento"`
	Cuota            float64 `json:"cuota"`
	DiaCobro         int     `json:"dia_cobro"`
	Interes          float64 `json:"interes"` // % anual; 0 = estimarlo a partir de saldo, cuota y plazo
	Configurada      bool    `json:"configurada"`
}

func hipotecaPorDefecto() Hipoteca {
	return Hipoteca{
		Nombre: "Hipoteca", CapitalInicial: 150000, Saldo: 129822.42, FechaSaldo: "2026-10-19",
		FechaInicio: "2022-06-27", FechaVencimiento: "2052-07-01", Cuota: 500.04, DiaCobro: 1, Interes: 1.39,
	}
}

func handleHipoteca(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		h := hipotecaPorDefecto()
		var raw string
		if db.QueryRow("SELECT valor FROM config WHERE clave='hipoteca'").Scan(&raw) == nil {
			var g Hipoteca
			if json.Unmarshal([]byte(raw), &g) == nil {
				h = g
				h.Configurada = true
			}
		}
		writeJSON(w, 200, h)
	case http.MethodPut:
		var h Hipoteca
		if err := decodeJSON(r, &h); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		h.Nombre = strings.TrimSpace(h.Nombre)
		if h.Nombre == "" || len([]rune(h.Nombre)) > 40 {
			h.Nombre = "Hipoteca"
		}
		for _, f := range []string{h.FechaSaldo, h.FechaInicio, h.FechaVencimiento} {
			if _, err := time.Parse(dateLayout, f); err != nil {
				writeError(w, 400, "Fecha inválida")
				return
			}
		}
		for _, v := range []float64{h.CapitalInicial, h.Saldo, h.Cuota, h.Interes} {
			if math.IsNaN(v) || v < 0 || v > 100000000 {
				writeError(w, 400, "Importe inválido")
				return
			}
		}
		if h.Cuota <= 0 || h.Saldo > h.CapitalInicial*2 || h.Interes > 30 {
			writeError(w, 400, "Revisa la cuota, el saldo y el interés")
			return
		}
		if h.DiaCobro < 1 || h.DiaCobro > 28 {
			h.DiaCobro = 1
		}
		h.CapitalInicial, h.Saldo, h.Cuota, h.Interes = redondear(h.CapitalInicial), redondear(h.Saldo), redondear(h.Cuota), redondear(h.Interes)
		h.Configurada = true
		b, _ := json.Marshal(h)
		if _, err := db.Exec("INSERT OR REPLACE INTO config(clave,valor) VALUES('hipoteca',?)", string(b)); err != nil {
			writeError(w, 500, "No se pudo guardar")
			return
		}
		writeJSON(w, 200, h)
	default:
		w.Header().Set("Allow", "GET, PUT")
		writeError(w, 405, "Método no permitido")
	}
}
