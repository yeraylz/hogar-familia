package main

import (
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"
)

// Foto de perfil y frase («info») de cada persona. La foto se guarda sellada en disco
// y solo la ve quien ya puede ver ese perfil (usuarioVisiblePara).

const maxFotoPerfil = 2 << 20

func dirFotosPerfil() string { return filepath.Join(filepath.Dir(dbFile), "fotos-perfil") }

func rutaFotoPerfil(id int) string { return filepath.Join(dirFotosPerfil(), fmt.Sprintf("%d.img", id)) }

// puedeEditarPerfilDe: cada persona edita solo lo suyo, sin excepciones (ni de otro adulto,
// ni de un peque de la familia, ni de un invitado).
func puedeEditarPerfilDe(yo *Usuario, id int) bool {
	return yo != nil && yo.ID == id
}

func guardarMarcaFoto(id int, marca int64) error {
	_, err := db.Exec(`INSERT INTO perfiles(usuario_id,foto_v) VALUES(?,?)
		ON CONFLICT(usuario_id) DO UPDATE SET foto_v=excluded.foto_v`, id, marca)
	return err
}

// handlePerfilSub atiende /perfiles/<id>/foto y /perfiles/<id>/frase.
func handlePerfilSub(w http.ResponseWriter, r *http.Request, resto string) {
	partes := strings.Split(resto, "/")
	if len(partes) != 2 {
		writeError(w, 404, "No encontrado")
		return
	}
	id, err := strconv.Atoi(partes[0])
	if err != nil || id <= 0 {
		writeError(w, 404, "No encontrado")
		return
	}
	yo := usuarioActual(r)
	if yo == nil {
		writeError(w, 401, "Inicia sesión con tu perfil")
		return
	}
	switch partes[1] {
	case "foto":
		handleFotoPerfil(w, r, yo, id)
	case "frase":
		if r.Method != http.MethodPut {
			w.Header().Set("Allow", "PUT")
			writeError(w, 405, "Método no permitido")
			return
		}
		if !puedeEditarPerfilDe(yo, id) {
			writeError(w, 403, "No puedes editar este perfil")
			return
		}
		var in struct {
			Frase string `json:"frase"`
		}
		if decodeJSON(r, &in) != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		in.Frase = strings.TrimSpace(in.Frase)
		if utf8.RuneCountInString(in.Frase) > 80 {
			writeError(w, 400, "La frase es demasiado larga (máx. 80)")
			return
		}
		if _, err := db.Exec(`INSERT INTO perfiles(usuario_id,frase) VALUES(?,?)
			ON CONFLICT(usuario_id) DO UPDATE SET frase=excluded.frase`, id, in.Frase); err != nil {
			writeError(w, 500, "No se pudo guardar")
			return
		}
		writeJSON(w, 200, map[string]string{"frase": in.Frase})
	default:
		writeError(w, 404, "No encontrado")
	}
}

func handleFotoPerfil(w http.ResponseWriter, r *http.Request, yo *Usuario, id int) {
	switch r.Method {
	case http.MethodGet:
		if !usuarioVisiblePara(yo, id) {
			writeError(w, 404, "Sin foto")
			return
		}
		var marca int64
		db.QueryRow("SELECT COALESCE(foto_v,0) FROM perfiles WHERE usuario_id=?", id).Scan(&marca)
		if marca == 0 {
			writeError(w, 404, "Sin foto")
			return
		}
		crudo, err := os.ReadFile(rutaFotoPerfil(id))
		if err != nil {
			writeError(w, 404, "Sin foto")
			return
		}
		datos, ok := abrirBytesChat(crudo)
		if !ok {
			writeError(w, 404, "Sin foto")
			return
		}
		_, mime, _ := tipoAdjunto(datos[:min(len(datos), 512)])
		if mime == "" {
			writeError(w, 404, "Sin foto")
			return
		}
		w.Header().Set("Content-Type", mime)
		w.Header().Set("Cache-Control", "private, max-age=86400")
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Write(datos)
	case http.MethodPost:
		if !puedeEditarPerfilDe(yo, id) {
			writeError(w, 403, "No puedes editar este perfil")
			return
		}
		r.Body = http.MaxBytesReader(w, r.Body, maxFotoPerfil+1<<20)
		if err := r.ParseMultipartForm(maxFotoPerfil); err != nil {
			writeError(w, 400, "La foto es demasiado grande o no es válida")
			return
		}
		file, _, err := r.FormFile("archivo")
		if err != nil {
			writeError(w, 400, "No se ha recibido la foto")
			return
		}
		defer file.Close()
		datos, err := io.ReadAll(io.LimitReader(file, maxFotoPerfil+1))
		if err != nil || len(datos) == 0 || len(datos) > maxFotoPerfil {
			writeError(w, 400, "La foto está vacía o es demasiado grande")
			return
		}
		if tipo, _, _ := tipoAdjunto(datos[:min(len(datos), 512)]); tipo != "imagen" {
			writeError(w, 400, "Solo se pueden usar fotos")
			return
		}
		if err := os.MkdirAll(dirFotosPerfil(), 0o755); err != nil {
			writeError(w, 500, "No se pudo guardar la foto")
			return
		}
		if err := os.WriteFile(rutaFotoPerfil(id), sellarBytesChat(datos), 0o644); err != nil {
			writeError(w, 500, "No se pudo guardar la foto")
			return
		}
		marca := time.Now().UnixMilli()
		if err := guardarMarcaFoto(id, marca); err != nil {
			writeError(w, 500, "No se pudo guardar la foto")
			return
		}
		writeJSON(w, 200, map[string]int64{"foto": marca})
	case http.MethodDelete:
		if !puedeEditarPerfilDe(yo, id) {
			writeError(w, 403, "No puedes editar este perfil")
			return
		}
		os.Remove(rutaFotoPerfil(id))
		guardarMarcaFoto(id, 0)
		writeJSON(w, 200, map[string]int64{"foto": 0})
	default:
		w.Header().Set("Allow", "GET, POST, DELETE")
		writeError(w, 405, "Método no permitido")
	}
}
