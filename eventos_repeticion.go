package main

import (
	"sort"
	"strconv"
	"strings"
	"time"
)

// Repeticiones admitidas de un evento.
var repeticionesValidas = map[string]bool{
	"": true, "diaria": true, "semanal": true, "mensual": true, "anual": true,
}

const maxAvisosEvento = 5

// parseAvisos convierte "1440,60" en [1440 60] (ignora lo que no sea un número > 0).
func parseAvisos(s string) []int {
	out := []int{}
	for _, p := range strings.Split(s, ",") {
		n, err := strconv.Atoi(strings.TrimSpace(p))
		if err == nil && n > 0 {
			out = append(out, n)
		}
	}
	return out
}

func joinAvisos(a []int) string {
	partes := make([]string, len(a))
	for i, n := range a {
		partes[i] = strconv.Itoa(n)
	}
	return strings.Join(partes, ",")
}

// avisosEfectivos une la columna nueva (avisos) con la antigua (notificacion_minutos).
func avisosEfectivos(avisos string, notifMinutos int) []int {
	lista := parseAvisos(avisos)
	if len(lista) == 0 && notifMinutos > 0 {
		lista = []int{notifMinutos}
	}
	return lista
}

// normalizarRepeticionYAvisos valida y deja coherentes los campos de repetición y
// avisos de un evento recibido. Devuelve un mensaje de error ("" si todo va bien).
func normalizarRepeticionYAvisos(e *Evento) string {
	e.Repeticion = strings.TrimSpace(e.Repeticion)
	if e.Repeticion == "" && e.RepetirAnual {
		e.Repeticion = "anual"
	}
	if !repeticionesValidas[e.Repeticion] {
		return "Repetición inválida"
	}
	e.RepetirAnual = e.Repeticion == "anual"
	if e.Repeticion == "" {
		e.RepetirCada = 1
		e.RepetirDias = ""
		e.RepetirHasta = ""
	} else {
		if e.RepetirCada < 1 {
			e.RepetirCada = 1
		}
		if e.RepetirCada > 99 {
			return "Repetición inválida"
		}
		if e.Repeticion != "semanal" {
			e.RepetirDias = ""
		} else {
			dias := map[int]bool{}
			for _, p := range strings.Split(e.RepetirDias, ",") {
				p = strings.TrimSpace(p)
				if p == "" {
					continue
				}
				n, err := strconv.Atoi(p)
				if err != nil || n < 0 || n > 6 {
					return "Días de repetición inválidos"
				}
				dias[n] = true
			}
			ordenados := []int{}
			for n := range dias {
				ordenados = append(ordenados, n)
			}
			sort.Ints(ordenados)
			e.RepetirDias = joinAvisos0(ordenados)
		}
		e.RepetirHasta = strings.TrimSpace(e.RepetirHasta)
		if e.RepetirHasta != "" {
			h, err := time.Parse(dateLayout, e.RepetirHasta)
			if err != nil {
				return "Fecha límite de repetición inválida"
			}
			ini, _ := time.Parse(dateLayout, e.Start)
			if h.Before(ini) {
				return "La repetición no puede terminar antes de empezar"
			}
		}
	}

	// Año de nacimiento: solo tiene sentido en eventos anuales (cumpleaños).
	if e.Repeticion != "anual" {
		e.AnioNacimiento = 0
	} else if e.AnioNacimiento != 0 && (e.AnioNacimiento < 1900 || e.AnioNacimiento > time.Now().Year()) {
		return "Año de nacimiento inválido"
	}

	// Avisos: si el cliente solo manda el campo antiguo, se convierte.
	if len(e.Avisos) == 0 && e.NotificacionMinutos > 0 {
		e.Avisos = []int{e.NotificacionMinutos}
	}
	vistos := map[int]bool{}
	limpios := []int{}
	for _, m := range e.Avisos {
		if m < 0 || m > 60*24*30 {
			return "Notificación inválida"
		}
		if m == 0 || vistos[m] {
			continue
		}
		vistos[m] = true
		limpios = append(limpios, m)
	}
	if len(limpios) > maxAvisosEvento {
		return "Demasiados avisos"
	}
	sort.Sort(sort.Reverse(sort.IntSlice(limpios)))
	e.Avisos = limpios
	e.NotificacionMinutos = 0
	if len(limpios) > 0 {
		e.NotificacionMinutos = limpios[0]
	}
	return ""
}

// joinAvisos0 une enteros con comas (admite el 0, a diferencia de parseAvisos).
func joinAvisos0(a []int) string {
	partes := make([]string, len(a))
	for i, n := range a {
		partes[i] = strconv.Itoa(n)
	}
	return strings.Join(partes, ",")
}

func diasEnMes(anio int, mes time.Month) int {
	return time.Date(anio, mes+1, 0, 0, 0, 0, 0, time.UTC).Day()
}

// ocurreEnDia dice si un evento (con su regla de repetición) tiene una ocurrencia
// que EMPIEZA en el día indicado. Todas las fechas se manejan como días en UTC.
// Hay una copia equivalente en JavaScript (ocurreEnDia, en app.js): si se cambia
// una, hay que cambiar la otra.
func ocurreEnDia(inicio time.Time, rep string, cada int, diasSemana, hasta, excepciones string, dia time.Time) bool {
	if dia.Before(inicio) {
		return false
	}
	if hasta != "" {
		if h, err := time.Parse(dateLayout, hasta); err == nil && dia.After(h) {
			return false
		}
	}
	if excepciones != "" {
		clave := dia.Format(dateLayout)
		for _, x := range strings.Split(excepciones, ",") {
			if strings.TrimSpace(x) == clave {
				return false
			}
		}
	}
	if cada < 1 {
		cada = 1
	}
	switch rep {
	case "":
		return dia.Equal(inicio)
	case "diaria":
		return int(dia.Sub(inicio).Hours()/24)%cada == 0
	case "semanal":
		permitidos := map[time.Weekday]bool{}
		for _, p := range strings.Split(diasSemana, ",") {
			if n, err := strconv.Atoi(strings.TrimSpace(p)); err == nil && n >= 0 && n <= 6 {
				permitidos[time.Weekday(n)] = true
			}
		}
		if len(permitidos) == 0 {
			permitidos[inicio.Weekday()] = true
		}
		if !permitidos[dia.Weekday()] {
			return false
		}
		lunes := func(t time.Time) time.Time {
			return t.AddDate(0, 0, -((int(t.Weekday()) + 6) % 7))
		}
		semanas := int(lunes(dia).Sub(lunes(inicio)).Hours()/24) / 7
		return semanas%cada == 0
	case "mensual":
		meses := (dia.Year()-inicio.Year())*12 + int(dia.Month()) - int(inicio.Month())
		if meses%cada != 0 {
			return false
		}
		d := inicio.Day()
		if ult := diasEnMes(dia.Year(), dia.Month()); d > ult {
			d = ult
		}
		return dia.Day() == d
	case "anual":
		if (dia.Year()-inicio.Year())%cada != 0 || dia.Month() != inicio.Month() {
			return false
		}
		d := inicio.Day()
		if ult := diasEnMes(dia.Year(), dia.Month()); d > ult {
			d = ult // 29 de febrero en año no bisiesto
		}
		return dia.Day() == d
	}
	return false
}
