package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"sync"
	"time"
)

// Tiempo actual para el saludo de Hoy (Open-Meteo, sin clave). Se consulta desde el servidor
// y se guarda 20 minutos para no repetir peticiones. Ubicación por defecto: Madrid (cámbiala con
// las variables de entorno HOGAR_LAT y HOGAR_LON a la de tu casa).

type tiempoActual struct {
	Temp   float64 `json:"temp"`
	Max    float64 `json:"max"`
	Min    float64 `json:"min"`
	Icono  string  `json:"icono"`
	Texto  string  `json:"texto"`
	Codigo int     `json:"codigo"`
}

var (
	tiempoCache   *tiempoActual
	tiempoCuando  time.Time
	tiempoMutex   sync.Mutex
	clienteTiempo = &http.Client{Timeout: 6 * time.Second}
)

func iconoTiempo(codigo int, dia bool) (string, string) {
	switch {
	case codigo == 0:
		if dia {
			return "☀️", "Despejado"
		}
		return "🌙", "Despejado"
	case codigo == 1:
		if dia {
			return "🌤️", "Casi despejado"
		}
		return "🌙", "Casi despejado"
	case codigo == 2:
		return "⛅", "Nubes y claros"
	case codigo == 3:
		return "☁️", "Nublado"
	case codigo == 45 || codigo == 48:
		return "🌫️", "Niebla"
	case codigo >= 51 && codigo <= 57:
		return "🌦️", "Llovizna"
	case codigo >= 61 && codigo <= 67:
		return "🌧️", "Lluvia"
	case codigo >= 71 && codigo <= 77, codigo == 85, codigo == 86:
		return "🌨️", "Nieve"
	case codigo >= 80 && codigo <= 82:
		return "🌦️", "Chubascos"
	case codigo >= 95:
		return "⛈️", "Tormenta"
	}
	return "🌡️", "Tiempo"
}

func consultarTiempo() (*tiempoActual, error) {
	lat, lon := "40.4168", "-3.7038" // Madrid (centro), por defecto
	if v := os.Getenv("HOGAR_LAT"); v != "" {
		if _, err := strconv.ParseFloat(v, 64); err == nil {
			lat = v
		}
	}
	if v := os.Getenv("HOGAR_LON"); v != "" {
		if _, err := strconv.ParseFloat(v, 64); err == nil {
			lon = v
		}
	}
	url := fmt.Sprintf("https://api.open-meteo.com/v1/forecast?latitude=%s&longitude=%s&current=temperature_2m,weather_code,is_day&daily=temperature_2m_max,temperature_2m_min&timezone=Europe%%2FMadrid&forecast_days=1", lat, lon)
	resp, err := clienteTiempo.Get(url)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return nil, fmt.Errorf("open-meteo: HTTP %d", resp.StatusCode)
	}
	var d struct {
		Current struct {
			Temp   float64 `json:"temperature_2m"`
			Codigo int     `json:"weather_code"`
			EsDia  int     `json:"is_day"`
		} `json:"current"`
		Daily struct {
			Max []float64 `json:"temperature_2m_max"`
			Min []float64 `json:"temperature_2m_min"`
		} `json:"daily"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&d); err != nil {
		return nil, err
	}
	t := &tiempoActual{Temp: d.Current.Temp, Codigo: d.Current.Codigo}
	t.Icono, t.Texto = iconoTiempo(d.Current.Codigo, d.Current.EsDia == 1)
	if len(d.Daily.Max) > 0 {
		t.Max = d.Daily.Max[0]
	}
	if len(d.Daily.Min) > 0 {
		t.Min = d.Daily.Min[0]
	}
	return t, nil
}

func handleTiempo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, 405, "Método no permitido")
		return
	}
	tiempoMutex.Lock()
	defer tiempoMutex.Unlock()
	if tiempoCache == nil || time.Since(tiempoCuando) > 20*time.Minute {
		t, err := consultarTiempo()
		if err != nil {
			log.Printf("tiempo: no se pudo consultar: %v", err)
			if tiempoCache == nil {
				writeError(w, 503, "Tiempo no disponible")
				return
			}
			// Si falla la consulta se sirve el último dato conocido.
		} else {
			tiempoCache, tiempoCuando = t, time.Now()
		}
	}
	writeJSON(w, 200, tiempoCache)
}
