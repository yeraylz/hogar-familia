package main

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"sync"
	"time"
)

// Copias de seguridad automáticas de la base de datos (que incluye los documentos).
// Se guardan en <carpeta de la BBDD>/backups, es decir, dentro del volumen ./datos/hogar.

const copiasAConservar = 14
const horaCopiaDiaria = 3 // a partir de las 03:00 se hace la copia del día

var reNombreCopia = regexp.MustCompile(`^hogar-\d{4}-\d{2}-\d{2}(-\d{4})?\.db$`)

var (
	muCopias         sync.Mutex
	ultimoErrorCopia string
	errorAvisadoDia  string
)

type CopiaInfo struct {
	Nombre string `json:"nombre"`
	Bytes  int64  `json:"bytes"`
	Fecha  string `json:"fecha"`
}

func dirCopias() string { return filepath.Join(filepath.Dir(dbFile), "backups") }

// instantanea escribe una copia consistente de la BBDD en destino (VACUUM INTO respeta el modo WAL).
func instantanea(destino string) error {
	if err := os.MkdirAll(filepath.Dir(destino), 0o755); err != nil {
		return err
	}
	os.Remove(destino)
	if _, err := db.Exec("VACUUM INTO '" + strings.ReplaceAll(destino, "'", "''") + "'"); err != nil {
		os.Remove(destino)
		return err
	}
	st, err := os.Stat(destino)
	if err != nil || st.Size() == 0 {
		os.Remove(destino)
		return fmt.Errorf("la copia quedó vacía")
	}
	return nil
}

// crearCopia guarda una copia con nombre del día (automática) o con hora (manual).
func crearCopia(manual bool) (string, error) {
	muCopias.Lock()
	defer muCopias.Unlock()
	ahora := time.Now()
	nombre := "hogar-" + ahora.Format("2006-01-02") + ".db"
	if manual {
		nombre = "hogar-" + ahora.Format("2006-01-02-1504") + ".db"
	}
	destino := filepath.Join(dirCopias(), nombre)
	tmp := destino + ".tmp"
	if err := instantanea(tmp); err != nil {
		ultimoErrorCopia = err.Error()
		return "", err
	}
	if err := os.Rename(tmp, destino); err != nil {
		os.Remove(tmp)
		ultimoErrorCopia = err.Error()
		return "", err
	}
	ultimoErrorCopia = ""
	podarCopias()
	return nombre, nil
}

func listarCopias() []CopiaInfo {
	lista := []CopiaInfo{}
	entradas, err := os.ReadDir(dirCopias())
	if err != nil {
		return lista
	}
	for _, e := range entradas {
		if e.IsDir() || !reNombreCopia.MatchString(e.Name()) {
			continue
		}
		info, err := e.Info()
		if err != nil {
			continue
		}
		lista = append(lista, CopiaInfo{Nombre: e.Name(), Bytes: info.Size(), Fecha: info.ModTime().Format(time.RFC3339)})
	}
	sort.Slice(lista, func(i, j int) bool { return lista[i].Fecha > lista[j].Fecha })
	return lista
}

func podarCopias() {
	lista := listarCopias()
	for i := copiasAConservar; i < len(lista); i++ {
		os.Remove(filepath.Join(dirCopias(), lista[i].Nombre))
	}
}

func revisarCopiaDiaria() {
	ahora := time.Now()
	hoy := ahora.Format("2006-01-02")
	if _, err := os.Stat(filepath.Join(dirCopias(), "hogar-"+hoy+".db")); err == nil {
		return // la de hoy ya está
	}
	if ahora.Hour() < horaCopiaDiaria && len(listarCopias()) > 0 {
		return // esperamos a la madrugada, salvo que aún no exista ninguna copia
	}
	if nombre, err := crearCopia(false); err != nil {
		log.Printf("copia automática fallida: %v", err)
		if errorAvisadoDia != hoy {
			errorAvisadoDia = hoy
			go enviarATodos("⚠️ Falló la copia de seguridad", err.Error(), "copia-error")
		}
	} else {
		log.Printf("copia automática creada: %s", nombre)
	}
}

func iniciarCopiasAutomaticas() {
	go func() {
		time.Sleep(20 * time.Second)
		revisarCopiaDiaria()
		for range time.NewTicker(20 * time.Minute).C {
			revisarCopiaDiaria()
		}
	}()
}

// handleBackup (GET /backup) descarga una copia consistente del momento (no el archivo en caliente).
func handleBackup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, 405, "Método no permitido")
		return
	}
	if usuarioActual(r) == nil {
		writeError(w, 401, "Tienes que haber iniciado sesión para descargar la copia")
		return
	}
	tmp := filepath.Join(dirCopias(), fmt.Sprintf("descarga-%d.tmp", time.Now().UnixNano()))
	muCopias.Lock()
	err := instantanea(tmp)
	muCopias.Unlock()
	if err != nil {
		writeError(w, 500, "No se pudo preparar la copia")
		return
	}
	defer os.Remove(tmp)
	w.Header().Set("Content-Disposition", `attachment; filename="hogar-backup-`+time.Now().Format("2006-01-02")+`.db"`)
	http.ServeFile(w, r, tmp)
}

// handleBackupSub atiende /backup/estado, /backup/ahora y /backup/archivo/<nombre>.
func handleBackupSub(w http.ResponseWriter, r *http.Request) {
	if usuarioActual(r) == nil {
		writeError(w, 401, "Inicia sesión con tu perfil")
		return
	}
	sub := strings.TrimPrefix(r.URL.Path, "/backup/")
	switch {
	case sub == "estado" && r.Method == http.MethodGet:
		writeJSON(w, 200, map[string]any{
			"copias":       listarCopias(),
			"ultimo_error": ultimoErrorCopia,
			"hora_diaria":  fmt.Sprintf("%02d:00", horaCopiaDiaria),
			"conservadas":  copiasAConservar,
		})
	case sub == "ahora" && r.Method == http.MethodPost:
		nombre, err := crearCopia(true)
		if err != nil {
			writeError(w, 500, "No se pudo crear la copia: "+err.Error())
			return
		}
		writeJSON(w, 200, map[string]string{"nombre": nombre})
	case strings.HasPrefix(sub, "archivo/") && r.Method == http.MethodGet:
		nombre := strings.TrimPrefix(sub, "archivo/")
		if !reNombreCopia.MatchString(nombre) {
			writeError(w, 400, "Nombre de copia inválido")
			return
		}
		ruta := filepath.Join(dirCopias(), nombre)
		if _, err := os.Stat(ruta); err != nil {
			writeError(w, 404, "Copia no encontrada")
			return
		}
		w.Header().Set("Content-Disposition", `attachment; filename="`+nombre+`"`)
		http.ServeFile(w, r, ruta)
	default:
		writeError(w, 404, "No encontrado")
	}
}
