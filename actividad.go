package main

import (
	"bytes"
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Registro de actividad: quién añadió, cambió o borró qué. Solo se anotan las acciones
// que han salido bien (2xx). Las acciones personales (Reto), el PIN y los avisos no se registran.

type ActividadItem struct {
	ID      int    `json:"id"`
	Fecha   string `json:"fecha"`
	Usuario string `json:"usuario"`
	Texto   string `json:"texto"`
}

type entidadActividad struct {
	prefijo, articulo, nombre, tabla, columna string
}

var entidadesActividad = []entidadActividad{
	{"/compra", "el", "producto", "compra", "producto"},
	{"/tareas", "la", "tarea", "tareas", "titulo"},
	{"/eventos", "el", "evento", "eventos", "titulo"},
	{"/pagos", "el", "pago", "pagos", "nombre"},
	{"/documentos", "el", "documento", "documentos", "nombre"},
	{"/enlaces", "el", "enlace", "enlaces_hogar", "titulo"},
	{"/gastos", "el", "gasto", "gastos", "nota"},
	{"/presupuestos", "el", "presupuesto", "", ""},
	{"/hipoteca", "los", "datos de la hipoteca", "", ""},
	{"/notas", "una", "nota", "", ""},
	{"/menu-colegio/subir", "el", "menú del cole", "", ""},
}

type escritorEstado struct {
	http.ResponseWriter
	status int
}

func (e *escritorEstado) WriteHeader(c int) {
	if e.status == 0 {
		e.status = c
	}
	e.ResponseWriter.WriteHeader(c)
}

func (e *escritorEstado) Write(b []byte) (int, error) {
	if e.status == 0 {
		e.status = 200
	}
	return e.ResponseWriter.Write(b)
}

func (e *escritorEstado) Unwrap() http.ResponseWriter { return e.ResponseWriter }

func entidadDeRuta(path string) (entidadActividad, bool) {
	for _, en := range entidadesActividad {
		if path == en.prefijo || strings.HasPrefix(path, en.prefijo+"/") {
			return en, true
		}
	}
	return entidadActividad{}, false
}

func recortar(s string, n int) string {
	r := []rune(strings.TrimSpace(s))
	if len(r) > n {
		return string(r[:n]) + "…"
	}
	return string(r)
}

func registrarActividad(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost && r.Method != http.MethodPut && r.Method != http.MethodDelete {
			next.ServeHTTP(w, r)
			return
		}
		en, ok := entidadDeRuta(r.URL.Path)
		u := usuarioActual(r)
		if !ok || u == nil || strings.HasPrefix(r.URL.Path, "/compra/sugerencias") || strings.HasPrefix(r.URL.Path, "/notas/conteo") {
			next.ServeHTTP(w, r)
			return
		}

		// Datos para describir la acción: cuerpo JSON (si lo hay) y nombre previo del elemento.
		var cuerpo map[string]any
		if ct := r.Header.Get("Content-Type"); strings.HasPrefix(ct, "application/json") && r.Body != nil {
			b, err := io.ReadAll(io.LimitReader(r.Body, 2<<20))
			if err == nil {
				r.Body = io.NopCloser(bytes.NewReader(b))
				json.Unmarshal(b, &cuerpo)
			}
		}
		titulo := ""
		partes := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
		if en.tabla != "" && len(partes) == 2 && r.Method != http.MethodPost {
			if id, err := strconv.Atoi(partes[1]); err == nil {
				db.QueryRow("SELECT "+en.columna+" FROM "+en.tabla+" WHERE id=?", id).Scan(&titulo)
			}
		}
		if titulo == "" && cuerpo != nil {
			for _, k := range []string{"titulo", "title", "producto", "nombre", "texto"} {
				if v, ok := cuerpo[k].(string); ok && strings.TrimSpace(v) != "" {
					titulo = v
					break
				}
			}
		}

		ew := &escritorEstado{ResponseWriter: w}
		next.ServeHTTP(ew, r)
		if ew.status < 200 || ew.status >= 300 {
			return
		}

		verbo := map[string]string{http.MethodPost: "añadió", http.MethodPut: "editó", http.MethodDelete: "borró"}[r.Method]
		if r.Method == http.MethodPut && cuerpo != nil {
			if v, ok := cuerpo["completada"].(bool); ok && en.nombre == "tarea" {
				verbo = map[bool]string{true: "completó", false: "reabrió"}[v]
			}
			if v, ok := cuerpo["comprado"].(bool); ok && en.nombre == "producto" {
				verbo = map[bool]string{true: "marcó como comprado", false: "volvió a pedir"}[v]
			}
			if v, ok := cuerpo["pagado"].(bool); ok && en.nombre == "pago" {
				verbo = map[bool]string{true: "marcó como pagado", false: "desmarcó como pagado"}[v]
			}
		}
		if r.URL.Path == "/menu-colegio/subir" {
			verbo = "subió"
		}
		texto := verbo + " " + en.articulo + " " + en.nombre
		if t := recortar(titulo, 80); t != "" {
			texto += " «" + t + "»"
		}
		db.Exec("INSERT INTO actividad(fecha,usuario,texto) VALUES(?,?,?)", time.Now().Format(time.RFC3339), u.Nombre, texto)
		db.Exec("DELETE FROM actividad WHERE id <= (SELECT MAX(id) FROM actividad) - 1500")
	})
}

func handleActividad(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, 405, "Método no permitido")
		return
	}
	limite := 150
	if n, err := strconv.Atoi(r.URL.Query().Get("limite")); err == nil && n > 0 && n <= 500 {
		limite = n
	}
	usuario := strings.TrimSpace(r.URL.Query().Get("usuario"))
	consulta := "SELECT id,fecha,usuario,texto FROM actividad"
	args := []any{}
	if usuario != "" {
		consulta += " WHERE usuario=?"
		args = append(args, usuario)
	}
	consulta += " ORDER BY id DESC LIMIT ?"
	args = append(args, limite)
	rows, err := db.Query(consulta, args...)
	if err != nil {
		writeError(w, 500, "No se pudo leer la actividad")
		return
	}
	defer rows.Close()
	lista := []ActividadItem{}
	for rows.Next() {
		var a ActividadItem
		if rows.Scan(&a.ID, &a.Fecha, &a.Usuario, &a.Texto) == nil {
			lista = append(lista, a)
		}
	}
	writeJSON(w, 200, lista)
}
