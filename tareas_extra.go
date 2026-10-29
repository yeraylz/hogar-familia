package main

import (
	"encoding/json"
	"regexp"
	"strconv"
	"strings"
	"time"
)

var reHoraTarea = regexp.MustCompile(`^([01]\d|2[0-3]):[0-5]\d$`)
var reModoDias = regexp.MustCompile(`^dias:[0-6](,[0-6]){0,6}$`)

func subtareasDesdeJSON(txt string) []Subtarea {
	lista := []Subtarea{}
	if strings.TrimSpace(txt) == "" {
		return lista
	}
	_ = json.Unmarshal([]byte(txt), &lista)
	return lista
}

func subtareasAJSON(lista []Subtarea) string {
	if len(lista) == 0 {
		return ""
	}
	b, err := json.Marshal(lista)
	if err != nil {
		return ""
	}
	return string(b)
}

// normalizarExtrasTarea valida y limpia hora, prioridad, subtareas y modo de repetición.
// Devuelve un mensaje de error ("" si todo está bien).
func normalizarExtrasTarea(t *Tarea) string {
	t.Hora = strings.TrimSpace(t.Hora)
	if t.Hora != "" && !reHoraTarea.MatchString(t.Hora) {
		return "Hora inválida"
	}
	if t.Prioridad < -1 || t.Prioridad > 1 {
		return "Prioridad inválida"
	}
	t.RepetirModo = strings.TrimSpace(t.RepetirModo)
	if t.RepetirModo != "" && t.RepetirModo != "mes" && !reModoDias.MatchString(t.RepetirModo) {
		return "Repetición inválida"
	}
	if t.RepetirModo != "" {
		t.RepetirDias = 0
	}
	if len(t.Subtareas) > 50 {
		return "Demasiadas subtareas (máximo 50)"
	}
	limpias := make([]Subtarea, 0, len(t.Subtareas))
	for _, st := range t.Subtareas {
		st.Texto = strings.TrimSpace(st.Texto)
		if st.Texto == "" {
			continue
		}
		if len([]rune(st.Texto)) > 120 {
			st.Texto = string([]rune(st.Texto)[:120])
		}
		limpias = append(limpias, st)
	}
	t.Subtareas = limpias
	return ""
}

// siguienteFechaTarea calcula la próxima fecha de una tarea repetida a partir de base.
// - modo "dias:1,4": el siguiente día de la semana de la lista, posterior a base y a hoy.
// - modo "mes": el mismo día del mes siguiente (si no existe, el último día de ese mes).
// - sin modo: base + repetirDias.
func siguienteFechaTarea(base time.Time, repetirDias int, modo string, hoy time.Time) time.Time {
	base = time.Date(base.Year(), base.Month(), base.Day(), 0, 0, 0, 0, time.UTC)
	switch {
	case strings.HasPrefix(modo, "dias:"):
		permitidos := map[int]bool{}
		for _, p := range strings.Split(strings.TrimPrefix(modo, "dias:"), ",") {
			if n, err := strconv.Atoi(p); err == nil {
				permitidos[n] = true
			}
		}
		d := base
		for i := 0; i < 8; i++ {
			d = d.AddDate(0, 0, 1)
			if permitidos[int(d.Weekday())] {
				return d
			}
		}
		return base.AddDate(0, 0, 7)
	case modo == "mes":
		y, m := base.Year(), base.Month()+1
		if m > 12 {
			m = 1
			y++
		}
		ultimo := time.Date(y, m+1, 0, 0, 0, 0, 0, time.UTC).Day()
		dia := base.Day()
		if dia > ultimo {
			dia = ultimo
		}
		return time.Date(y, m, dia, 0, 0, 0, 0, time.UTC)
	}
	if repetirDias < 1 {
		repetirDias = 1
	}
	return base.AddDate(0, 0, repetirDias)
}
