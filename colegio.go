package main

import (
	"bytes"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"
)

type MenuColegio struct {
	ID            int    `json:"id"`
	Anio          int    `json:"anio"`
	Mes           int    `json:"mes"`
	NombreArchivo string `json:"nombre_archivo"`
	MimeType      string `json:"mime_type"`
	Tamano        int    `json:"tamano"`
	Origen        string `json:"origen"` // "auto" | "manual"
	FechaSubida   string `json:"fecha_subida"`
}

func handleMenuColegioActual(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, 405, "Método no permitido")
		return
	}
	hoy := time.Now()
	var m MenuColegio
	err := db.QueryRow(`SELECT id,anio,mes,nombre_archivo,mime_type,tamano,origen,fecha_subida
		FROM menu_colegio WHERE anio=? AND mes=?`, hoy.Year(), int(hoy.Month())).
		Scan(&m.ID, &m.Anio, &m.Mes, &m.NombreArchivo, &m.MimeType, &m.Tamano, &m.Origen, &m.FechaSubida)
	if err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte("null")) // sin menú todavía este mes: no es un error
			return
		}
		writeError(w, 500, "No se pudo comprobar el menú")
		return
	}
	writeJSON(w, 200, m)
}

func handleMenuColegioArchivo(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, 405, "Método no permitido")
		return
	}
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	var contenido []byte
	var mimeType, nombreArchivo string
	err = db.QueryRow("SELECT contenido,mime_type,nombre_archivo FROM menu_colegio WHERE id=?", id).
		Scan(&contenido, &mimeType, &nombreArchivo)
	if err != nil {
		writeError(w, 404, "Menú no encontrado")
		return
	}
	w.Header().Set("Content-Type", mimeType)
	w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, strings.ReplaceAll(nombreArchivo, `"`, "")))
	w.Header().Set("Cache-Control", "private, max-age=3600")
	w.Write(contenido)
}

func handleMenuColegioSubir(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeError(w, 405, "Método no permitido")
		return
	}
	r.Body = http.MaxBytesReader(w, r.Body, 15<<20+1<<20)
	if err := r.ParseMultipartForm(15 << 20); err != nil {
		writeError(w, 400, "El archivo es demasiado grande (máximo 15 MB) o la petición no es válida")
		return
	}
	file, header, err := r.FormFile("archivo")
	if err != nil {
		writeError(w, 400, "No se ha recibido ningún archivo")
		return
	}
	defer file.Close()
	contenido, err := io.ReadAll(file)
	if err != nil || len(contenido) == 0 {
		writeError(w, 400, "No se pudo leer el archivo")
		return
	}
	mimeType := header.Header.Get("Content-Type")
	if mimeType == "" {
		mimeType = http.DetectContentType(contenido)
	}

	hoy := time.Now()
	if err := guardarMenuColegio(hoy.Year(), int(hoy.Month()), header.Filename, mimeType, contenido, "manual"); err != nil {
		writeError(w, 500, "No se pudo guardar el menú")
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}

func guardarMenuColegio(anio, mes int, nombreArchivo, mimeType string, contenido []byte, origen string) error {
	_, err := db.Exec(`INSERT INTO menu_colegio(anio,mes,nombre_archivo,mime_type,tamano,contenido,origen) VALUES(?,?,?,?,?,?,?)
		ON CONFLICT(anio,mes) DO UPDATE SET nombre_archivo=excluded.nombre_archivo, mime_type=excluded.mime_type,
			tamano=excluded.tamano, contenido=excluded.contenido, origen=excluded.origen, fecha_subida=CURRENT_TIMESTAMP`,
		anio, mes, nombreArchivo, mimeType, len(contenido), contenido, origen)
	return err
}

// intentarDescargarMenuColegio prueba a bajar el menú general del mes actual desde la web del
// colegio, si se ha configurado una URL con la variable de entorno HOGAR_MENU_COLE_URL. En esa
// URL se sustituyen los marcadores {MM} (mes con cero delante, p. ej. 03), {M} (mes sin cero,
// p. ej. 3) y {AA} (año con 2 cifras), p. ej. "https://miwebcolegio.com/comedor/menu_{MM}_{AA}.pdf".
// Si no se define, esta función no hace nada: la familia sube el menú a mano desde la app sin que
// esto rompa nada.
func intentarDescargarMenuColegio() {
	plantilla := os.Getenv("HOGAR_MENU_COLE_URL")
	if plantilla == "" {
		return // sin URL configurada: solo subida manual
	}
	hoy := time.Now()
	anio, mes := hoy.Year(), int(hoy.Month())

	var existe int
	db.QueryRow("SELECT COUNT(*) FROM menu_colegio WHERE anio=? AND mes=?", anio, mes).Scan(&existe)
	if existe > 0 {
		return // ya hay uno guardado (automático o a mano): no lo pisamos
	}

	yy := anio % 100
	url := strings.NewReplacer(
		"{MM}", fmt.Sprintf("%02d", mes),
		"{M}", fmt.Sprintf("%d", mes),
		"{AA}", fmt.Sprintf("%02d", yy),
	).Replace(plantilla)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Get(url)
	if err != nil {
		log.Printf("menú colegio: no se pudo conectar: %v", err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		log.Printf("menú colegio: todavía no publicado para %02d/%d (HTTP %d)", mes, anio, resp.StatusCode)
		return
	}
	contenido, err := io.ReadAll(io.LimitReader(resp.Body, 15<<20))
	if err != nil || len(contenido) == 0 || !bytes.HasPrefix(contenido, []byte("%PDF")) {
		log.Printf("menú colegio: la respuesta no es un PDF válido")
		return
	}

	nombreArchivo := fmt.Sprintf("menu_%02d_%02d.pdf", mes, anio)
	if err := guardarMenuColegio(anio, mes, nombreArchivo, "application/pdf", contenido, "auto"); err != nil {
		log.Printf("menú colegio: no se pudo guardar: %v", err)
		return
	}
	log.Printf("menú colegio: descargado automáticamente para %02d/%d", mes, anio)
}
