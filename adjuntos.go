package main

import "net/http"

// maxImagenAdjunta es el tamaño máximo de una imagen adjunta (foto de perfil, ticket de gasto, etc.).
const maxImagenAdjunta = 4 << 20

// tipoAdjunto detecta el tipo de un archivo adjunto (foto o nota de voz) a partir de sus
// primeros bytes: lo usan tanto Mis cosas/gastos como los perfiles de la familia.
func tipoAdjunto(cabecera []byte) (tipo, mime, ext string) {
	d := http.DetectContentType(cabecera)
	switch d {
	case "image/jpeg":
		return "imagen", d, ".jpg"
	case "image/png":
		return "imagen", d, ".png"
	case "image/webp":
		return "imagen", d, ".webp"
	case "image/gif":
		return "imagen", d, ".gif"
	case "video/webm", "audio/webm":
		return "audio", "audio/webm", ".webm"
	case "audio/ogg", "application/ogg":
		return "audio", "audio/ogg", ".ogg"
	case "video/mp4", "audio/mp4":
		return "audio", "audio/mp4", ".m4a"
	case "audio/mpeg":
		return "audio", "audio/mpeg", ".mp3"
	}
	return "", "", ""
}
