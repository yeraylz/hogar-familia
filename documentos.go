package main

import (
	"database/sql"
	"errors"
	"fmt"
	"io"
	"net/http"
	"strings"
)

const maxTamanoDocumento = 15 << 20 // 15 MB por archivo

var tiposDocumentoValidos = map[string]bool{
	"DNI": true, "Pasaporte": true, "Tarjeta sanitaria": true,
	"Seguro": true, "Colegio": true, "Otro": true,
}

func handleDocumentos(w http.ResponseWriter, r *http.Request) {
	if !requiereSesion(w, r) {
		return
	}
	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(`SELECT id,persona,tipo,nombre,nombre_archivo,mime_type,tamano,fecha_subida
			FROM documentos ORDER BY persona, tipo, fecha_subida DESC`)
		if err != nil {
			writeError(w, 500, "Error al cargar los documentos")
			return
		}
		defer rows.Close()
		lista := []Documento{}
		for rows.Next() {
			var d Documento
			if err := rows.Scan(&d.ID, &d.Persona, &d.Tipo, &d.Nombre, &d.NombreArchivo, &d.MimeType, &d.Tamano, &d.FechaSubida); err != nil {
				writeError(w, 500, "Error al leer los documentos")
				return
			}
			lista = append(lista, d)
		}
		writeJSON(w, 200, lista)

	case http.MethodPost:
		r.Body = http.MaxBytesReader(w, r.Body, maxTamanoDocumento+1<<20) // margen para el resto del formulario
		if err := r.ParseMultipartForm(maxTamanoDocumento); err != nil {
			writeError(w, 400, "El archivo es demasiado grande (máximo 15 MB) o la petición no es válida")
			return
		}

		persona := strings.TrimSpace(r.FormValue("persona"))
		if persona == "" {
			persona = "Todos"
		}
		tipo := strings.TrimSpace(r.FormValue("tipo"))
		if tipo == "" {
			tipo = "Otro"
		}
		if !tiposDocumentoValidos[tipo] {
			writeError(w, 400, "Tipo de documento inválido")
			return
		}
		nombre := strings.TrimSpace(r.FormValue("nombre"))

		file, header, err := r.FormFile("archivo")
		if err != nil {
			writeError(w, 400, "No se ha recibido ningún archivo")
			return
		}
		defer file.Close()

		contenido, err := io.ReadAll(file)
		if err != nil {
			writeError(w, 400, "No se pudo leer el archivo")
			return
		}
		if len(contenido) == 0 {
			writeError(w, 400, "El archivo está vacío")
			return
		}

		mimeType := header.Header.Get("Content-Type")
		if mimeType == "" {
			mimeType = http.DetectContentType(contenido)
		}

		res, err := db.Exec(`INSERT INTO documentos(persona,tipo,nombre,nombre_archivo,mime_type,tamano,contenido) VALUES(?,?,?,?,?,?,?)`,
			persona, tipo, nombre, header.Filename, mimeType, len(contenido), contenido)
		if err != nil {
			writeError(w, 500, "No se pudo guardar el documento")
			return
		}
		id, _ := res.LastInsertId()
		writeJSON(w, 201, map[string]any{"id": id, "persona": persona, "tipo": tipo, "nombre": nombre, "nombre_archivo": header.Filename, "mime_type": mimeType, "tamano": len(contenido)})

	default:
		w.Header().Set("Allow", "GET, POST")
		writeError(w, 405, "Método no permitido")
	}
}

func handleDocumentosID(w http.ResponseWriter, r *http.Request) {
	if !requiereSesion(w, r) {
		return
	}
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}

	switch r.Method {
	case http.MethodGet:
		var contenido []byte
		var mimeType, nombreArchivo string
		err := db.QueryRow("SELECT contenido,mime_type,nombre_archivo FROM documentos WHERE id=?", id).
			Scan(&contenido, &mimeType, &nombreArchivo)
		if err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				writeError(w, 404, "Documento no encontrado")
				return
			}
			writeError(w, 500, "No se pudo leer el documento")
			return
		}
		// "no-cache" obliga al navegador a preguntar siempre al servidor antes de
		// reutilizar el archivo; así nunca se salta la comprobación de sesión.
		// Un documento no se edita (si cambia, es otro id), por lo que id+tamaño
		// sirve de ETag y evita volver a descargarlo entero si no ha cambiado.
		etag := fmt.Sprintf(`"%d-%d"`, id, len(contenido))
		w.Header().Set("Cache-Control", "private, no-cache")
		w.Header().Set("ETag", etag)
		if r.Header.Get("If-None-Match") == etag {
			w.WriteHeader(http.StatusNotModified)
			return
		}
		w.Header().Set("Content-Type", mimeType)
		w.Header().Set("Content-Disposition", fmt.Sprintf(`inline; filename="%s"`, strings.ReplaceAll(nombreArchivo, `"`, "")))
		w.Write(contenido)

	case http.MethodDelete:
		res, err := db.Exec("DELETE FROM documentos WHERE id=?", id)
		if err != nil {
			writeError(w, 500, "No se pudo eliminar el documento")
			return
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			writeError(w, 404, "Documento no encontrado")
			return
		}
		writeJSON(w, 200, map[string]bool{"success": true})

	default:
		w.Header().Set("Allow", "GET, DELETE")
		writeError(w, 405, "Método no permitido")
	}
}
