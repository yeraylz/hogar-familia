package main

import (
	"database/sql"
	"encoding/json"
	"errors"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	_ "modernc.org/sqlite"
	_ "time/tzdata" // embebe el catálogo de zonas horarias en el binario (imágenes mínimas tipo Alpine no lo traen)
)

const (
	serverAddr = ":8080"
	dateLayout = "2006-01-02"
)

// dbFile se puede sobrescribir con la variable de entorno HOGAR_DB (útil en
// Docker, para apuntar a un volumen externo). Si no está definida, se usa la
// ruta relativa de siempre, igual que hasta ahora.
var dbFile = "./hogar.db"

func init() {
	if ruta := os.Getenv("HOGAR_DB"); ruta != "" {
		dbFile = ruta
	}
}

var db *sql.DB

type ItemCompra struct {
	ID           int    `json:"id"`
	Producto     string `json:"producto"`
	Cantidad     string `json:"cantidad"` // opcional, texto libre: "2x", "500g", "1kg"...
	Comprado     bool   `json:"comprado"`
	Archivado    bool   `json:"archivado"`
	Supermercado string `json:"supermercado"` // opcional: Lidl, Mercadona... vacío = sin tienda concreta
}

type Tarea struct {
	ID          int        `json:"id"`
	Titulo      string     `json:"titulo"`
	AsignadoA   string     `json:"asignado_a"`
	Completada  bool       `json:"completada"`
	RepetirDias int        `json:"repetir_dias"`
	Fecha       string     `json:"fecha"`     // fecha de vencimiento; vacío = sin fecha (siempre pendiente)
	Hora        string     `json:"hora"`      // "HH:MM" opcional: hora del recordatorio el día de la fecha
	Prioridad   int        `json:"prioridad"` // 1 alta, 0 normal, -1 baja
	Subtareas   []Subtarea `json:"subtareas"`
	// RepetirModo: "" (usa repetir_dias), "mes" (mismo día de cada mes) o "dias:1,4" (días de la semana, 0=domingo).
	RepetirModo string `json:"repetir_modo"`
}

type Subtarea struct {
	Texto string `json:"texto"`
	Hecha bool   `json:"hecha"`
}

type Evento struct {
	ID                  int    `json:"id"`
	Title               string `json:"title"`
	Start               string `json:"start"`
	FechaFin            string `json:"fecha_fin"` // opcional: último día si el evento dura varios días
	HoraInicio          string `json:"hora_inicio"`
	HoraFin             string `json:"hora_fin"`
	Persona             string `json:"persona"`
	Descripcion         string `json:"descripcion"`
	Ubicacion           string `json:"ubicacion"`
	NotificacionMinutos int    `json:"notificacion_minutos"` // aviso principal (compatibilidad); la lista completa es Avisos
	RepetirAnual        bool   `json:"repetir_anual"`        // compatibilidad: equivale a Repeticion == "anual"
	Avisos              []int  `json:"avisos"`               // minutos antes del evento; puede haber varios
	Repeticion          string `json:"repeticion"`           // "", diaria, semanal, mensual, anual
	RepetirCada         int    `json:"repetir_cada"`         // cada N días/semanas/meses/años
	RepetirDias         string `json:"repetir_dias"`         // semanal: días de la semana "1,3" (0=domingo)
	RepetirHasta        string `json:"repetir_hasta"`        // último día de la serie (opcional)
	Excepciones         string `json:"excepciones"`          // fechas borradas de la serie, separadas por comas
	AnioNacimiento      int    `json:"anio_nacimiento"`      // solo cumpleaños: año de nacimiento para mostrar la edad (0 = no se sabe)
}

type Menu struct {
	Fecha  string `json:"fecha"`
	Comida string `json:"comida"`
	Cena   string `json:"cena"`
}

type Pago struct {
	ID         int     `json:"id"`
	Nombre     string  `json:"nombre"`
	Importe    float64 `json:"importe"`
	Frecuencia string  `json:"frecuencia"` // mensual, bimestral, trimestral, semestral, anual, puntual
	Fecha      string  `json:"fecha"`      // próxima fecha de cobro
	Persona    string  `json:"persona"`
	Notas      string  `json:"notas"`
	Pagado     bool    `json:"pagado"`
}

type PagoHistorial struct {
	ID               int     `json:"id"`
	PagoID           int     `json:"pago_id"`
	Nombre           string  `json:"nombre"`
	Importe          float64 `json:"importe"`
	Frecuencia       string  `json:"frecuencia"`
	Persona          string  `json:"persona"`
	Notas            string  `json:"notas"`
	FechaVencimiento string  `json:"fecha_vencimiento"`
	FechaPago        string  `json:"fecha_pago"`
}

type Documento struct {
	ID            int    `json:"id"`
	Persona       string `json:"persona"`
	Tipo          string `json:"tipo"`
	Nombre        string `json:"nombre"`         // descripción libre, opcional
	NombreArchivo string `json:"nombre_archivo"` // nombre original del fichero subido
	MimeType      string `json:"mime_type"`
	Tamano        int    `json:"tamano"`
	FechaSubida   string `json:"fecha_subida"`
}

var frecuenciasValidas = map[string]bool{
	"mensual": true, "bimestral": true, "trimestral": true,
	"semestral": true, "anual": true, "puntual": true,
}

func main() {
	var err error
	// Las opciones van en la cadena de conexión para que valgan para TODAS las conexiones del
	// pool (un PRAGMA suelto solo afectaría a una): espera hasta 10 s si la BBDD está ocupada
	// y modo WAL para que lecturas y escrituras simultáneas no se bloqueen.
	db, err = sql.Open("sqlite", "file:"+dbFile+"?_pragma=busy_timeout(10000)&_pragma=journal_mode(WAL)&_pragma=secure_delete(ON)")
	if err != nil {
		log.Fatalf("error al abrir BBDD: %v", err)
	}
	defer db.Close()
	// Espera hasta 10 s si la BBDD está ocupada (en vez de fallar al instante) y usa WAL,
	// para que varias peticiones a la vez (p. ej. al refrescar) no se bloqueen entre sí.
	if err = db.Ping(); err != nil {
		log.Fatalf("error de conexión BBDD: %v", err)
	}
	if err = initDB(); err != nil {
		log.Fatalf("error inicializando BBDD: %v", err)
	}
	iniciarCopiasAutomaticas()
	iniciarCifradoChat()
	iniciarDDNS()
	if err = cargarOCrearClavesVAPID(); err != nil {
		log.Fatalf("error preparando claves VAPID: %v", err)
	}
	iniciarPlanificadorPush()

	mux := http.NewServeMux()
	mux.HandleFunc("/", serveFrontend)
	mux.HandleFunc("/compra", handleCompra)
	mux.HandleFunc("/compra/sugerencias", handleCompraSugerencias)
	mux.HandleFunc("/compra/", handleCompraID)
	mux.HandleFunc("/tareas", handleTareas)
	mux.HandleFunc("/tareas/", handleTareasID)
	mux.HandleFunc("/eventos", handleEventos)
	mux.HandleFunc("/eventos/", handleEventosID)
	mux.HandleFunc("/menu", handleMenu)
	mux.HandleFunc("/pagos", handlePagos)
	mux.HandleFunc("/pagos/", handlePagosID)
	mux.HandleFunc("/pagos/historial", handleHistorialPagos)
	mux.HandleFunc("/pagos/historial/", handleHistorialPagoID)
	mux.HandleFunc("/documentos", handleDocumentos)
	mux.HandleFunc("/documentos/", handleDocumentosID)
	mux.HandleFunc("/tiempo", handleTiempo)
	mux.HandleFunc("/sorteos", handleSorteos)
	mux.HandleFunc("/sorteos/", handleSorteos)
	mux.HandleFunc("/cuentas-atras", handleCuentasAtras)
	mux.HandleFunc("/cuentas-atras/", handleCuentasAtras)
	mux.HandleFunc("/estados", handleEstados)
	mux.HandleFunc("/estados/", handleEstados)
	mux.HandleFunc("/perfiles", handlePerfiles)
	mux.HandleFunc("/perfiles/", handlePerfiles)
	mux.HandleFunc("/mis-cosas/tareas", handleMisTareas)
	mux.HandleFunc("/mis-cosas/tareas/", handleMisTareas)
	mux.HandleFunc("/mis-cosas/eventos", handleMisEventos)
	mux.HandleFunc("/mis-cosas/eventos/", handleMisEventos)
	mux.HandleFunc("/usuarios", handleUsuarios)
	mux.HandleFunc("/usuarios/", func(w http.ResponseWriter, r *http.Request) {
		if strings.HasSuffix(r.URL.Path, "/pin") {
			handleUsuarioPin(w, r)
			return
		}
		if strings.HasSuffix(r.URL.Path, "/cambiar-pin") {
			handleUsuarioCambiarPin(w, r)
			return
		}
		writeError(w, 404, "No encontrado")
	})
	mux.HandleFunc("/login", handleLogin)
	mux.HandleFunc("/logout", handleLogout)
	mux.HandleFunc("/me", handleMe)
	mux.HandleFunc("/gastos", handleGastos)
	mux.HandleFunc("/gastos/", handleGastosSub)
	mux.HandleFunc("/presupuestos", handlePresupuestos)
	mux.HandleFunc("/hipoteca", handleHipoteca)
	mux.HandleFunc("/backup", handleBackup)
	mux.HandleFunc("/backup/", handleBackupSub)
	mux.HandleFunc("/menu-colegio/actual", handleMenuColegioActual)
	mux.HandleFunc("/menu-colegio/subir", handleMenuColegioSubir)
	mux.HandleFunc("/menu-colegio/", handleMenuColegioArchivo)
	mux.HandleFunc("/notas", handleNotas)
	mux.HandleFunc("/notas/conteo", handleNotasConteo)
	mux.HandleFunc("/notas/", handleNotaID)
	mux.HandleFunc("/reto/estado", handleRetoEstado)
	mux.HandleFunc("/reto/progreso", handleRetoProgreso)
	mux.HandleFunc("/reto/diario", handleRetoDiario)
	mux.HandleFunc("/reto/series", handleRetoSeries)
	mux.HandleFunc("/reto/historial-ejercicio", handleRetoHistorialEjercicio)
	mux.HandleFunc("/reto/inicio", handleRetoInicio)
	mux.HandleFunc("/reto/medidas", handleRetoMedidas)
	mux.HandleFunc("/reto/medidas/", handleRetoMedidaID)
	mux.HandleFunc("/enlaces", handleEnlaces)
	mux.HandleFunc("/enlaces/", handleEnlaceID)
	mux.HandleFunc("/ajustes/fotos", handleAjusteFotos)
	mux.HandleFunc("/ajustes/ddns", handleAjusteDDNS)
	mux.HandleFunc("/ajustes/actividad", handleActividad)
	mux.HandleFunc("/push/public-key", handlePushPublicKey)
	mux.HandleFunc("/push/subscribe", handlePushSubscribe)
	mux.HandleFunc("/push/native", handlePushNativo)
	mux.HandleFunc("/push/unsubscribe", handlePushUnsubscribe)

	server := &http.Server{Addr: serverAddr, Handler: cabecerasSeguridad(protegerAPI(registrarActividad(mux))), ReadHeaderTimeout: 5 * time.Second}
	log.Printf("Hogar Familia: http://localhost%s", serverAddr)
	log.Fatal(server.ListenAndServe())
}

func initDB() error {
	schemas := []string{
		`CREATE TABLE IF NOT EXISTS compra (id INTEGER PRIMARY KEY AUTOINCREMENT, producto TEXT NOT NULL, comprado BOOLEAN NOT NULL DEFAULT 0, archivado BOOLEAN NOT NULL DEFAULT 0);`,
		`CREATE TABLE IF NOT EXISTS tareas (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, asignado_a TEXT NOT NULL DEFAULT 'Todos', completada BOOLEAN NOT NULL DEFAULT 0, repetir_dias INTEGER NOT NULL DEFAULT 0);`,
		`CREATE TABLE IF NOT EXISTS eventos (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, fecha TEXT NOT NULL, hora_inicio TEXT NOT NULL DEFAULT '', hora_fin TEXT NOT NULL DEFAULT '', persona TEXT NOT NULL DEFAULT 'Todos', descripcion TEXT NOT NULL DEFAULT '', notificacion_minutos INTEGER NOT NULL DEFAULT 0);`,
		`CREATE TABLE IF NOT EXISTS menu (fecha TEXT PRIMARY KEY, comida TEXT NOT NULL DEFAULT '', cena TEXT NOT NULL DEFAULT '');`,
		`CREATE TABLE IF NOT EXISTS pagos (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, importe REAL NOT NULL DEFAULT 0, frecuencia TEXT NOT NULL DEFAULT 'mensual', fecha TEXT NOT NULL, persona TEXT NOT NULL DEFAULT 'Todos', notas TEXT NOT NULL DEFAULT '', pagado BOOLEAN NOT NULL DEFAULT 0);`,
		`CREATE TABLE IF NOT EXISTS pagos_historial (id INTEGER PRIMARY KEY AUTOINCREMENT, pago_id INTEGER NOT NULL DEFAULT 0, nombre TEXT NOT NULL, importe REAL NOT NULL DEFAULT 0, frecuencia TEXT NOT NULL DEFAULT 'mensual', persona TEXT NOT NULL DEFAULT 'Todos', notas TEXT NOT NULL DEFAULT '', fecha_vencimiento TEXT NOT NULL, fecha_pago TEXT NOT NULL);`,
		`CREATE INDEX IF NOT EXISTS idx_pagos_hist_fecha ON pagos_historial(fecha_pago);`,
		`CREATE TABLE IF NOT EXISTS eventos_avisos (evento_id INTEGER NOT NULL, fecha_ocurrencia TEXT NOT NULL, minutos INTEGER NOT NULL, PRIMARY KEY (evento_id, fecha_ocurrencia, minutos));`,
		`CREATE TABLE IF NOT EXISTS compra_historial (clave TEXT PRIMARY KEY, producto TEXT NOT NULL, supermercado TEXT NOT NULL DEFAULT '', cantidad TEXT NOT NULL DEFAULT '', veces INTEGER NOT NULL DEFAULT 1, ultima TEXT NOT NULL DEFAULT '');`,
		`CREATE TABLE IF NOT EXISTS config (clave TEXT PRIMARY KEY, valor TEXT NOT NULL);`,
		`CREATE TABLE IF NOT EXISTS gastos (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, importe REAL NOT NULL, categoria TEXT NOT NULL, persona TEXT NOT NULL DEFAULT 'Conjunta', nota TEXT NOT NULL DEFAULT '', creado TEXT NOT NULL DEFAULT '');`,
		`CREATE INDEX IF NOT EXISTS idx_gastos_fecha ON gastos(fecha);`,
		`CREATE TABLE IF NOT EXISTS facturas_categoria (nombre TEXT PRIMARY KEY, categoria TEXT NOT NULL);`,
		`CREATE TABLE IF NOT EXISTS reglas_categoria (id INTEGER PRIMARY KEY AUTOINCREMENT, patron TEXT NOT NULL UNIQUE, categoria TEXT NOT NULL);`,
		`CREATE TABLE IF NOT EXISTS gastos_recurrentes (id INTEGER PRIMARY KEY AUTOINCREMENT, nota TEXT NOT NULL, importe REAL NOT NULL, categoria TEXT NOT NULL, persona TEXT NOT NULL DEFAULT 'Conjunta', dia INTEGER NOT NULL DEFAULT 1, activo INTEGER NOT NULL DEFAULT 1, ultimo_mes TEXT NOT NULL DEFAULT '');`,
		`CREATE TABLE IF NOT EXISTS perfiles (usuario_id INTEGER PRIMARY KEY, rol TEXT NOT NULL DEFAULT '', avatar TEXT NOT NULL DEFAULT '', nacimiento TEXT NOT NULL DEFAULT '', apodo TEXT NOT NULL DEFAULT '');`,
		`CREATE TABLE IF NOT EXISTS estados (usuario_id INTEGER PRIMARY KEY, emoji TEXT NOT NULL DEFAULT '', texto TEXT NOT NULL DEFAULT '', fecha TEXT NOT NULL DEFAULT '');`,
		`CREATE TABLE IF NOT EXISTS reacciones_estado (estado_usuario_id INTEGER NOT NULL, de_usuario_id INTEGER NOT NULL, emoji TEXT NOT NULL, fecha TEXT NOT NULL, PRIMARY KEY(estado_usuario_id, de_usuario_id, fecha));`,
		`CREATE TABLE IF NOT EXISTS sorteos (id INTEGER PRIMARY KEY AUTOINCREMENT, de_id INTEGER NOT NULL, pregunta TEXT NOT NULL, ganador_id INTEGER NOT NULL, creado TEXT NOT NULL);`,
		`CREATE TABLE IF NOT EXISTS cuentas_atras (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, fecha TEXT NOT NULL, emoji TEXT NOT NULL DEFAULT '', de_id INTEGER NOT NULL DEFAULT 0);`,
		`CREATE TABLE IF NOT EXISTS push_nativo (id INTEGER PRIMARY KEY AUTOINCREMENT, token TEXT NOT NULL UNIQUE, persona TEXT NOT NULL, origen TEXT NOT NULL DEFAULT '', creado TEXT NOT NULL);`,
		`CREATE TABLE IF NOT EXISTS categorias_gasto (id TEXT PRIMARY KEY, nombre TEXT NOT NULL, icono TEXT, color TEXT);`,
		`CREATE TABLE IF NOT EXISTS presupuestos (categoria TEXT PRIMARY KEY, importe REAL NOT NULL);`,
		`CREATE TABLE IF NOT EXISTS actividad (id INTEGER PRIMARY KEY AUTOINCREMENT, fecha TEXT NOT NULL, usuario TEXT NOT NULL, texto TEXT NOT NULL);`,
		`CREATE TABLE IF NOT EXISTS push_subscripciones (id INTEGER PRIMARY KEY AUTOINCREMENT, endpoint TEXT NOT NULL UNIQUE, p256dh TEXT NOT NULL, auth TEXT NOT NULL, persona TEXT NOT NULL DEFAULT 'Todos', creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
		`CREATE TABLE IF NOT EXISTS documentos (id INTEGER PRIMARY KEY AUTOINCREMENT, persona TEXT NOT NULL DEFAULT 'Todos', tipo TEXT NOT NULL DEFAULT 'Otro', nombre TEXT NOT NULL DEFAULT '', nombre_archivo TEXT NOT NULL, mime_type TEXT NOT NULL, tamano INTEGER NOT NULL DEFAULT 0, contenido BLOB NOT NULL, fecha_subida TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
		`CREATE TABLE IF NOT EXISTS usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL UNIQUE, pin_hash TEXT NOT NULL DEFAULT '', pin_salt TEXT NOT NULL DEFAULT '');`,
		`CREATE TABLE IF NOT EXISTS sesiones (token TEXT PRIMARY KEY, usuario_id INTEGER NOT NULL, creado TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`,
		`CREATE TABLE IF NOT EXISTS menu_colegio (id INTEGER PRIMARY KEY AUTOINCREMENT, anio INTEGER NOT NULL, mes INTEGER NOT NULL, nombre_archivo TEXT NOT NULL, mime_type TEXT NOT NULL, tamano INTEGER NOT NULL DEFAULT 0, contenido BLOB NOT NULL, origen TEXT NOT NULL DEFAULT 'manual', fecha_subida TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, UNIQUE(anio, mes));`,
		`CREATE TABLE IF NOT EXISTS comentarios (id INTEGER PRIMARY KEY AUTOINCREMENT, tipo TEXT NOT NULL, ref_id INTEGER NOT NULL, autor TEXT NOT NULL DEFAULT 'Alguien', texto TEXT NOT NULL, creado TEXT NOT NULL);`,
		`CREATE INDEX IF NOT EXISTS idx_comentarios_ref ON comentarios(tipo, ref_id);`,
		`CREATE TABLE IF NOT EXISTS reto_ajustes (usuario_id INTEGER PRIMARY KEY, inicio TEXT NOT NULL);`,
		`CREATE TABLE IF NOT EXISTS reto_diario (usuario_id INTEGER NOT NULL, fecha TEXT NOT NULL, sesion_hecha INTEGER NOT NULL DEFAULT 0, proteina INTEGER NOT NULL DEFAULT 0, pasos INTEGER NOT NULL DEFAULT 0, agua INTEGER NOT NULL DEFAULT 0, sueno INTEGER NOT NULL DEFAULT 0, PRIMARY KEY(usuario_id, fecha));`,
		`CREATE TABLE IF NOT EXISTS reto_series (usuario_id INTEGER NOT NULL, fecha TEXT NOT NULL, ejercicio TEXT NOT NULL, peso REAL NOT NULL DEFAULT 0, reps TEXT NOT NULL DEFAULT '', PRIMARY KEY(usuario_id, fecha, ejercicio));`,
		`CREATE TABLE IF NOT EXISTS reto_medidas (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, fecha TEXT NOT NULL, peso REAL NOT NULL DEFAULT 0, cintura REAL NOT NULL DEFAULT 0, UNIQUE(usuario_id, fecha));`,
		`CREATE TABLE IF NOT EXISTS enlaces_hogar (id INTEGER PRIMARY KEY AUTOINCREMENT, titulo TEXT NOT NULL, url TEXT NOT NULL, creado TEXT NOT NULL);`,
		// «Mis cosas»: lista y calendario personales, privados por cada persona de la familia.
		`CREATE TABLE IF NOT EXISTS tareas_personales (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, texto TEXT NOT NULL, hecha INTEGER NOT NULL DEFAULT 0, creada TEXT NOT NULL, orden INTEGER NOT NULL DEFAULT 0);`,
		`CREATE INDEX IF NOT EXISTS idx_tareas_personales_usuario ON tareas_personales(usuario_id);`,
		`CREATE TABLE IF NOT EXISTS eventos_personales (id INTEGER PRIMARY KEY AUTOINCREMENT, usuario_id INTEGER NOT NULL, texto TEXT NOT NULL, fecha TEXT NOT NULL, hora TEXT NOT NULL DEFAULT '', creado TEXT NOT NULL);`,
		`CREATE INDEX IF NOT EXISTS idx_eventos_personales_usuario ON eventos_personales(usuario_id, fecha);`,
	}
	for _, q := range schemas {
		if _, err := db.Exec(q); err != nil {
			return err
		}
	}
	migrations := []struct{ table, column, sql string }{
		{"tareas", "repetir_dias", `ALTER TABLE tareas ADD COLUMN repetir_dias INTEGER NOT NULL DEFAULT 0`},
		{"tareas", "fecha", `ALTER TABLE tareas ADD COLUMN fecha TEXT NOT NULL DEFAULT ''`},
		{"eventos", "hora_inicio", `ALTER TABLE eventos ADD COLUMN hora_inicio TEXT NOT NULL DEFAULT ''`},
		{"eventos", "hora_fin", `ALTER TABLE eventos ADD COLUMN hora_fin TEXT NOT NULL DEFAULT ''`},
		{"eventos", "descripcion", `ALTER TABLE eventos ADD COLUMN descripcion TEXT NOT NULL DEFAULT ''`},
		{"eventos", "notificacion_minutos", `ALTER TABLE eventos ADD COLUMN notificacion_minutos INTEGER NOT NULL DEFAULT 0`},
		{"eventos", "notificado_push", `ALTER TABLE eventos ADD COLUMN notificado_push INTEGER NOT NULL DEFAULT 0`},
		{"eventos", "avisos", `ALTER TABLE eventos ADD COLUMN avisos TEXT NOT NULL DEFAULT ''`},
		{"eventos", "repeticion", `ALTER TABLE eventos ADD COLUMN repeticion TEXT NOT NULL DEFAULT ''`},
		{"eventos", "repetir_cada", `ALTER TABLE eventos ADD COLUMN repetir_cada INTEGER NOT NULL DEFAULT 1`},
		{"eventos", "repetir_dias", `ALTER TABLE eventos ADD COLUMN repetir_dias TEXT NOT NULL DEFAULT ''`},
		{"eventos", "repetir_hasta", `ALTER TABLE eventos ADD COLUMN repetir_hasta TEXT NOT NULL DEFAULT ''`},
		{"eventos", "excepciones", `ALTER TABLE eventos ADD COLUMN excepciones TEXT NOT NULL DEFAULT ''`},
		{"eventos", "anio_nacimiento", `ALTER TABLE eventos ADD COLUMN anio_nacimiento INTEGER NOT NULL DEFAULT 0`},
		{"pagos", "notificado_fecha", `ALTER TABLE pagos ADD COLUMN notificado_fecha TEXT NOT NULL DEFAULT ''`},
		{"eventos", "ubicacion", `ALTER TABLE eventos ADD COLUMN ubicacion TEXT NOT NULL DEFAULT ''`},
		{"eventos", "fecha_fin", `ALTER TABLE eventos ADD COLUMN fecha_fin TEXT NOT NULL DEFAULT ''`},
		{"push_subscripciones", "origen", `ALTER TABLE push_subscripciones ADD COLUMN origen TEXT NOT NULL DEFAULT ''`},
		{"eventos", "repetir_anual", `ALTER TABLE eventos ADD COLUMN repetir_anual INTEGER NOT NULL DEFAULT 0`},
		{"eventos", "notificado_anio", `ALTER TABLE eventos ADD COLUMN notificado_anio INTEGER NOT NULL DEFAULT 0`},
		{"tareas", "notificado_fecha", `ALTER TABLE tareas ADD COLUMN notificado_fecha TEXT NOT NULL DEFAULT ''`},
		{"perfiles", "foto_v", `ALTER TABLE perfiles ADD COLUMN foto_v INTEGER NOT NULL DEFAULT 0`},
		{"perfiles", "frase", `ALTER TABLE perfiles ADD COLUMN frase TEXT NOT NULL DEFAULT ''`},
		{"pagos", "suscripcion", `ALTER TABLE pagos ADD COLUMN suscripcion INTEGER NOT NULL DEFAULT 0`},
		{"pagos", "en_uso", `ALTER TABLE pagos ADD COLUMN en_uso INTEGER NOT NULL DEFAULT 1`},
		{"pagos", "suscripcion_revisada", `ALTER TABLE pagos ADD COLUMN suscripcion_revisada TEXT NOT NULL DEFAULT ''`},
		{"gastos", "ticket", `ALTER TABLE gastos ADD COLUMN ticket TEXT NOT NULL DEFAULT ''`},
		{"gastos", "a_cobrar", `ALTER TABLE gastos ADD COLUMN a_cobrar REAL NOT NULL DEFAULT 0`},
		{"gastos", "recurrente_id", `ALTER TABLE gastos ADD COLUMN recurrente_id INTEGER NOT NULL DEFAULT 0`},
		{"gastos", "liquidado", `ALTER TABLE gastos ADD COLUMN liquidado INTEGER NOT NULL DEFAULT 0`},
		{"tareas", "hora", `ALTER TABLE tareas ADD COLUMN hora TEXT NOT NULL DEFAULT ''`},
		{"tareas", "prioridad", `ALTER TABLE tareas ADD COLUMN prioridad INTEGER NOT NULL DEFAULT 0`},
		{"tareas", "subtareas", `ALTER TABLE tareas ADD COLUMN subtareas TEXT NOT NULL DEFAULT ''`},
		{"tareas", "repetir_modo", `ALTER TABLE tareas ADD COLUMN repetir_modo TEXT NOT NULL DEFAULT ''`},
		{"compra", "supermercado", `ALTER TABLE compra ADD COLUMN supermercado TEXT NOT NULL DEFAULT ''`},
		{"compra", "cantidad", `ALTER TABLE compra ADD COLUMN cantidad TEXT NOT NULL DEFAULT ''`},
		{"reto_diario", "cardio", `ALTER TABLE reto_diario ADD COLUMN cardio INTEGER NOT NULL DEFAULT 0`},
		{"reto_diario", "proteina_extra", `ALTER TABLE reto_diario ADD COLUMN proteina_extra INTEGER NOT NULL DEFAULT 0`},
		{"reto_diario", "porciones", `ALTER TABLE reto_diario ADD COLUMN porciones TEXT NOT NULL DEFAULT ''`},
		{"reto_diario", "comidas", `ALTER TABLE reto_diario ADD COLUMN comidas INTEGER NOT NULL DEFAULT 0`},
		{"usuarios", "oculto_login", `ALTER TABLE usuarios ADD COLUMN oculto_login INTEGER NOT NULL DEFAULT 0`},
		{"tareas_personales", "fecha", `ALTER TABLE tareas_personales ADD COLUMN fecha TEXT NOT NULL DEFAULT ''`},
		{"tareas_personales", "notificado_fecha", `ALTER TABLE tareas_personales ADD COLUMN notificado_fecha TEXT NOT NULL DEFAULT ''`},
		{"eventos_personales", "notificado_fecha", `ALTER TABLE eventos_personales ADD COLUMN notificado_fecha TEXT NOT NULL DEFAULT ''`},
		// Con quién se comparte: 0 = nadie, solo tuya.
		{"tareas_personales", "con_usuario_id", `ALTER TABLE tareas_personales ADD COLUMN con_usuario_id INTEGER NOT NULL DEFAULT 0`},
		{"eventos_personales", "con_usuario_id", `ALTER TABLE eventos_personales ADD COLUMN con_usuario_id INTEGER NOT NULL DEFAULT 0`},
	}
	for _, m := range migrations {
		if err := addColumnIfMissing(m.table, m.column, m.sql); err != nil {
			return err
		}
	}
	// Eventos: los datos anteriores pasan al formato nuevo (repetición y lista de
	// avisos) y los avisos que ya se habían enviado se anotan para no repetirlos.
	for _, q := range []string{
		`UPDATE eventos SET repeticion='anual' WHERE repetir_anual=1 AND repeticion=''`,
		`UPDATE eventos SET avisos=CAST(notificacion_minutos AS TEXT) WHERE notificacion_minutos>0 AND avisos=''`,
		`INSERT OR IGNORE INTO eventos_avisos(evento_id,fecha_ocurrencia,minutos)
			SELECT id,fecha,notificacion_minutos FROM eventos WHERE repetir_anual=0 AND notificado_push=1 AND notificacion_minutos>0`,
		`INSERT OR IGNORE INTO eventos_avisos(evento_id,fecha_ocurrencia,minutos)
			SELECT id,strftime('%Y','now','localtime')||substr(fecha,5),notificacion_minutos FROM eventos
			WHERE repetir_anual=1 AND notificado_anio=CAST(strftime('%Y','now','localtime') AS INTEGER) AND notificacion_minutos>0`,
	} {
		if _, err := db.Exec(q); err != nil {
			return err
		}
	}

	// Historial de la compra: lo que ya está en la lista pasa a él una vez.
	if filas, err := db.Query(`SELECT producto, COALESCE(supermercado,''), COALESCE(cantidad,'') FROM compra`); err == nil {
		type p struct{ prod, sup, cant string }
		var previos []p
		for filas.Next() {
			var x p
			if filas.Scan(&x.prod, &x.sup, &x.cant) == nil {
				previos = append(previos, x)
			}
		}
		filas.Close()
		for _, x := range previos {
			anotarEnHistorialCompra(x.prod, x.sup, x.cant, false)
		}
	}

	// Los pagos puntuales ya marcados como pagados antes del historial
	// pasan a él una sola vez, para que no desaparezcan.
	if _, err := db.Exec(`INSERT INTO pagos_historial(pago_id,nombre,importe,frecuencia,persona,notas,fecha_vencimiento,fecha_pago)
		SELECT id,nombre,importe,frecuencia,persona,notas,fecha,fecha FROM pagos
		WHERE pagado=1 AND NOT EXISTS (SELECT 1 FROM pagos_historial h WHERE h.pago_id=pagos.id)`); err != nil {
		return err
	}
	return sembrarUsuarios()
}

// sembrarUsuarios crea los perfiles de la casa la primera vez, sin PIN
// (se configura la primera vez que cada uno entra). Los nombres se definen con la variable de
// entorno HOGAR_PERFILES (separados por comas, p. ej. "Ana,Luis,Casa"); si no se indica, se usan
// unos nombres de ejemplo que cada familia debe cambiar a los suyos.
func sembrarUsuarios() error {
	var n int
	if err := db.QueryRow("SELECT COUNT(*) FROM usuarios").Scan(&n); err != nil {
		return err
	}
	if n > 0 {
		return nil
	}
	nombres := []string{"Persona 1", "Persona 2", "Hogar"}
	if v := strings.TrimSpace(os.Getenv("HOGAR_PERFILES")); v != "" {
		nombres = nil
		for _, nombre := range strings.Split(v, ",") {
			if nombre = strings.TrimSpace(nombre); nombre != "" {
				nombres = append(nombres, nombre)
			}
		}
	}
	for _, nombre := range nombres {
		if _, err := db.Exec("INSERT INTO usuarios(nombre) VALUES(?)", nombre); err != nil {
			return err
		}
	}
	return nil
}

func addColumnIfMissing(table, column, alterSQL string) error {
	rows, err := db.Query("PRAGMA table_info(" + table + ")")
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var cid, notNull, pk int
		var name, typ string
		var def any
		if err := rows.Scan(&cid, &name, &typ, &notNull, &def, &pk); err != nil {
			return err
		}
		if strings.EqualFold(name, column) {
			return nil
		}
	}
	if err := rows.Err(); err != nil {
		return err
	}
	_, err = db.Exec(alterSQL)
	return err
}

// serveFrontendReto sirve la misma página con otro nombre, otro icono y otro manifest,
// para poder instalar el Reto en el móvil como una app propia que abre directamente en "Hoy".
func serveFrontendReto(w http.ResponseWriter, r *http.Request) {
	b, err := os.ReadFile("web/index.html")
	if err != nil {
		http.ServeFile(w, r, "web/index.html")
		return
	}
	html := strings.NewReplacer(
		"<title>Hogar Familia</title>", "<title>Reto</title>",
		`href="/manifest.json"`, `href="/manifest-reto.json"`,
		`<meta name="theme-color" content="#4f46e5">`, `<meta name="theme-color" content="#059669">`,
		`<link rel="icon" href="/icons/icon-192.png">`, `<link rel="icon" href="/icons/reto-192.png">`,
		`<link rel="apple-touch-icon" href="/icons/icon-192.png">`, `<link rel="apple-touch-icon" href="/icons/reto-180.png">`,
		`<meta name="apple-mobile-web-app-title" content="Hogar">`, `<meta name="apple-mobile-web-app-title" content="Reto">`,
		"</head>", "<script>window.RETO_APP = true;</script><style>#barra-pestanas, #reto-volver { display: none !important; }</style></head>",
	).Replace(string(b))
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	_, _ = w.Write([]byte(html))
}

// Tema (claro/oscuro) elegido, leído de la cookie "tema" (la pone el JS junto con el ajuste en el móvil,
// para que el manifest pueda servirse ya con los colores correctos). "" si está en automático o sin elegir.
func temaDeCookie(r *http.Request) string {
	c, err := r.Cookie("tema")
	if err != nil || (c.Value != "claro" && c.Value != "oscuro") {
		return ""
	}
	return c.Value
}

func serveFrontend(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Cache-Control", "no-store, no-cache, must-revalidate")
	if r.URL.Path == "/" {
		if r.URL.Query().Get("app") == "reto" {
			serveFrontendReto(w, r)
			return
		}
		http.ServeFile(w, r, "web/index.html")
		return
	}
	// Android (app instalada tipo APK/TWA, opcional): verifica que la app y esta web son de la
	// misma persona. Se sirve el archivo assetlinks.json que dejes junto a la base de datos
	// (solo si decides empaquetar Hogar como TWA; si no, esta ruta simplemente da 404).
	if r.URL.Path == "/.well-known/assetlinks.json" {
		if b, err := os.ReadFile(filepath.Join(filepath.Dir(dbFile), "assetlinks.json")); err == nil {
			w.Header().Set("Content-Type", "application/json; charset=utf-8")
			w.Header().Set("Cache-Control", "no-cache")
			_, _ = w.Write(b)
			return
		}
		http.NotFound(w, r)
		return
	}
	// Los manifest cambian de colores según la cookie "tema", para que la pantalla de carga al
	// abrir la app instalada no haga un flash claro si el móvil está en oscuro.
	manifestsPropios := map[string]bool{"/manifest.json": true, "/manifest-reto.json": true}
	if manifestsPropios[r.URL.Path] {
		if b, err := os.ReadFile("web" + r.URL.Path); err == nil {
			txt := string(b)
			if temaDeCookie(r) == "oscuro" {
				switch r.URL.Path {
				case "/manifest.json":
					txt = strings.NewReplacer(`"background_color": "#f8fafc"`, `"background_color": "#0f172a"`, `"theme_color": "#4f46e5"`, `"theme_color": "#312e6b"`).Replace(txt)
				case "/manifest-reto.json":
					txt = strings.NewReplacer(`"background_color": "#f8fafc"`, `"background_color": "#0f172a"`, `"theme_color": "#059669"`, `"theme_color": "#065f46"`).Replace(txt)
				}
			}
			w.Header().Set("Content-Type", "application/manifest+json; charset=utf-8")
			_, _ = w.Write([]byte(txt))
			return
		}
	}
	// Sirve /css/app.css, /js/app.js, etc. desde la carpeta web/
	http.FileServer(http.Dir("web")).ServeHTTP(w, r)
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}
func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}
func decodeJSON(r *http.Request, dst any) error {
	d := json.NewDecoder(r.Body)
	d.DisallowUnknownFields()
	return d.Decode(dst)
}

func parseID(r *http.Request) (int, error) {
	parts := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	if len(parts) != 2 {
		return 0, errors.New("ID inválido")
	}
	id, err := strconv.Atoi(parts[1])
	if err != nil || id <= 0 {
		return 0, errors.New("ID inválido")
	}
	return id, nil
}

func handleCompra(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(`SELECT id, producto, comprado, archivado, COALESCE(supermercado,''), COALESCE(cantidad,'') FROM compra WHERE archivado=0 ORDER BY comprado ASC, producto COLLATE NOCASE ASC`)
		if err != nil {
			writeError(w, 500, "Error al cargar la compra")
			return
		}
		defer rows.Close()
		items := []ItemCompra{}
		for rows.Next() {
			var x ItemCompra
			if err := rows.Scan(&x.ID, &x.Producto, &x.Comprado, &x.Archivado, &x.Supermercado, &x.Cantidad); err != nil {
				writeError(w, 500, "Error al leer la compra")
				return
			}
			items = append(items, x)
		}
		writeJSON(w, 200, items)
	case http.MethodPost:
		var x ItemCompra
		if err := decodeJSON(r, &x); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		x.Producto = strings.TrimSpace(x.Producto)
		x.Supermercado = strings.TrimSpace(x.Supermercado)
		x.Cantidad = strings.TrimSpace(x.Cantidad)
		if x.Producto == "" {
			writeError(w, 400, "El producto no puede estar vacío")
			return
		}
		var id int
		err := db.QueryRow("SELECT id FROM compra WHERE LOWER(producto)=LOWER(?) LIMIT 1", x.Producto).Scan(&id)
		if err == nil {
			if _, err = db.Exec("UPDATE compra SET archivado=0, comprado=0, supermercado=?, cantidad=? WHERE id=?", x.Supermercado, x.Cantidad, id); err != nil {
				writeError(w, 500, "No se pudo recuperar el producto")
				return
			}
			anotarEnHistorialCompra(x.Producto, x.Supermercado, x.Cantidad, true)
			writeJSON(w, 200, map[string]any{"id": id, "producto": x.Producto, "supermercado": x.Supermercado, "cantidad": x.Cantidad})
			return
		}
		if !errors.Is(err, sql.ErrNoRows) {
			writeError(w, 500, "No se pudo comprobar el producto")
			return
		}
		res, err := db.Exec("INSERT INTO compra (producto,comprado,archivado,supermercado,cantidad) VALUES (?,0,0,?,?)", x.Producto, x.Supermercado, x.Cantidad)
		if err != nil {
			writeError(w, 500, "No se pudo guardar el producto")
			return
		}
		id64, _ := res.LastInsertId()
		x.ID = int(id64)
		anotarEnHistorialCompra(x.Producto, x.Supermercado, x.Cantidad, true)
		writeJSON(w, 201, x)
	default:
		w.Header().Set("Allow", "GET, POST")
		writeError(w, 405, "Método no permitido")
	}
}

func handleCompraID(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	switch r.Method {
	case http.MethodPut:
		var d struct {
			Comprado     *bool   `json:"comprado,omitempty"`
			Archivado    *bool   `json:"archivado,omitempty"`
			Supermercado *string `json:"supermercado,omitempty"`
			Cantidad     *string `json:"cantidad,omitempty"`
			Producto     *string `json:"producto,omitempty"`
		}
		if err := decodeJSON(r, &d); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		if d.Comprado == nil && d.Archivado == nil && d.Supermercado == nil && d.Cantidad == nil && d.Producto == nil {
			writeError(w, 400, "No hay cambios que aplicar")
			return
		}
		if d.Producto != nil {
			nombre := strings.TrimSpace(*d.Producto)
			if nombre == "" {
				writeError(w, 400, "El producto no puede estar vacío")
				return
			}
			if _, err := db.Exec("UPDATE compra SET producto=? WHERE id=?", nombre, id); err != nil {
				writeError(w, 500, "No se pudo renombrar el producto")
				return
			}
		}
		if d.Comprado != nil {
			if _, err := db.Exec("UPDATE compra SET comprado=? WHERE id=?", *d.Comprado, id); err != nil {
				writeError(w, 500, "No se pudo actualizar el producto")
				return
			}
		}
		if d.Archivado != nil {
			if _, err := db.Exec("UPDATE compra SET archivado=?, comprado=0 WHERE id=?", *d.Archivado, id); err != nil {
				writeError(w, 500, "No se pudo archivar el producto")
				return
			}
		}
		if d.Supermercado != nil {
			if _, err := db.Exec("UPDATE compra SET supermercado=? WHERE id=?", strings.TrimSpace(*d.Supermercado), id); err != nil {
				writeError(w, 500, "No se pudo actualizar la tienda")
				return
			}
		}
		if d.Cantidad != nil {
			if _, err := db.Exec("UPDATE compra SET cantidad=? WHERE id=?", strings.TrimSpace(*d.Cantidad), id); err != nil {
				writeError(w, 500, "No se pudo actualizar la cantidad")
				return
			}
		}
		writeJSON(w, 200, map[string]bool{"success": true})
	case http.MethodDelete:
		res, err := db.Exec("DELETE FROM compra WHERE id=?", id)
		if err != nil {
			writeError(w, 500, "No se pudo eliminar el producto")
			return
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			writeError(w, 404, "Producto no encontrado")
			return
		}
		writeJSON(w, 200, map[string]bool{"success": true})
	default:
		w.Header().Set("Allow", "PUT, DELETE")
		writeError(w, 405, "Método no permitido")
	}
}

func handleTareas(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(`SELECT id,titulo,asignado_a,completada,COALESCE(repetir_dias,0),COALESCE(fecha,''),COALESCE(hora,''),COALESCE(prioridad,0),COALESCE(subtareas,''),COALESCE(repetir_modo,'') FROM tareas
			ORDER BY completada ASC, CASE WHEN fecha='' THEN 1 ELSE 0 END ASC, fecha ASC, id DESC`)
		if err != nil {
			writeError(w, 500, "Error al cargar las tareas")
			return
		}
		defer rows.Close()
		list := []Tarea{}
		for rows.Next() {
			var t Tarea
			var subTxt string
			if err := rows.Scan(&t.ID, &t.Titulo, &t.AsignadoA, &t.Completada, &t.RepetirDias, &t.Fecha, &t.Hora, &t.Prioridad, &subTxt, &t.RepetirModo); err != nil {
				writeError(w, 500, "Error al leer las tareas")
				return
			}
			t.Subtareas = subtareasDesdeJSON(subTxt)
			list = append(list, t)
		}
		writeJSON(w, 200, list)
	case http.MethodPost:
		var t Tarea
		if err := decodeJSON(r, &t); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		t.Titulo = strings.TrimSpace(t.Titulo)
		t.AsignadoA = strings.TrimSpace(t.AsignadoA)
		t.Fecha = strings.TrimSpace(t.Fecha)
		if t.Titulo == "" {
			writeError(w, 400, "El título no puede estar vacío")
			return
		}
		if t.AsignadoA == "" {
			t.AsignadoA = "Todos"
		}
		if t.RepetirDias < 0 {
			writeError(w, 400, "Repetición inválida")
			return
		}
		if t.Fecha != "" {
			if _, err := time.Parse(dateLayout, t.Fecha); err != nil {
				writeError(w, 400, "Fecha inválida")
				return
			}
		}
		if msg := normalizarExtrasTarea(&t); msg != "" {
			writeError(w, 400, msg)
			return
		}
		res, err := db.Exec(`INSERT INTO tareas(titulo,asignado_a,completada,repetir_dias,fecha,hora,prioridad,subtareas,repetir_modo) VALUES(?,?,0,?,?,?,?,?,?)`,
			t.Titulo, t.AsignadoA, t.RepetirDias, t.Fecha, t.Hora, t.Prioridad, subtareasAJSON(t.Subtareas), t.RepetirModo)
		if err != nil {
			writeError(w, 500, "No se pudo crear la tarea")
			return
		}
		id, _ := res.LastInsertId()
		t.ID = int(id)
		writeJSON(w, 201, t)
	default:
		w.Header().Set("Allow", "GET, POST")
		writeError(w, 405, "Método no permitido")
	}
}

func handleTareasID(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	switch r.Method {
	case http.MethodPut:
		var d struct {
			Completada  *bool       `json:"completada,omitempty"`
			Titulo      *string     `json:"titulo,omitempty"`
			AsignadoA   *string     `json:"asignado_a,omitempty"`
			RepetirDias *int        `json:"repetir_dias,omitempty"`
			Fecha       *string     `json:"fecha,omitempty"`
			Hora        *string     `json:"hora,omitempty"`
			Prioridad   *int        `json:"prioridad,omitempty"`
			Subtareas   *[]Subtarea `json:"subtareas,omitempty"`
			RepetirModo *string     `json:"repetir_modo,omitempty"`
		}
		if err := decodeJSON(r, &d); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}

		// Solo se tocan las subtareas (marcar/desmarcar una casilla).
		if d.Titulo == nil && d.Completada == nil && d.Subtareas != nil {
			tmp := Tarea{Subtareas: *d.Subtareas}
			if msg := normalizarExtrasTarea(&tmp); msg != "" {
				writeError(w, 400, msg)
				return
			}
			res, err := db.Exec("UPDATE tareas SET subtareas=? WHERE id=?", subtareasAJSON(tmp.Subtareas), id)
			if err != nil {
				writeError(w, 500, "No se pudieron guardar las subtareas")
				return
			}
			if n, _ := res.RowsAffected(); n == 0 {
				writeError(w, 404, "Tarea no encontrada")
				return
			}
			writeJSON(w, 200, map[string]bool{"success": true})
			return
		}

		if d.Completada != nil {
			if err := updateTask(id, *d.Completada); err != nil {
				writeError(w, 500, err.Error())
				return
			}
			writeJSON(w, 200, map[string]bool{"success": true})
			return
		}

		// Edición de los datos de la tarea (no es el toggle de "completada").
		if d.Titulo == nil {
			writeError(w, 400, "Faltan datos para editar la tarea")
			return
		}
		titulo := strings.TrimSpace(*d.Titulo)
		if titulo == "" {
			writeError(w, 400, "El título no puede estar vacío")
			return
		}
		asignadoA := "Todos"
		if d.AsignadoA != nil {
			asignadoA = strings.TrimSpace(*d.AsignadoA)
		}
		if asignadoA == "" {
			asignadoA = "Todos"
		}
		repetirDias := 0
		if d.RepetirDias != nil {
			repetirDias = *d.RepetirDias
		}
		if repetirDias < 0 {
			writeError(w, 400, "Repetición inválida")
			return
		}
		fecha := ""
		if d.Fecha != nil {
			fecha = strings.TrimSpace(*d.Fecha)
		}
		if fecha != "" {
			if _, err := time.Parse(dateLayout, fecha); err != nil {
				writeError(w, 400, "Fecha inválida")
				return
			}
		}

		extra := Tarea{RepetirDias: repetirDias}
		if d.Hora != nil {
			extra.Hora = *d.Hora
		}
		if d.Prioridad != nil {
			extra.Prioridad = *d.Prioridad
		}
		if d.Subtareas != nil {
			extra.Subtareas = *d.Subtareas
		}
		if d.RepetirModo != nil {
			extra.RepetirModo = *d.RepetirModo
		}
		if msg := normalizarExtrasTarea(&extra); msg != "" {
			writeError(w, 400, msg)
			return
		}
		res, err := db.Exec(`UPDATE tareas SET titulo=?, asignado_a=?, repetir_dias=?, fecha=?, hora=?, prioridad=?, subtareas=?, repetir_modo=?, notificado_fecha='' WHERE id=?`,
			titulo, asignadoA, extra.RepetirDias, fecha, extra.Hora, extra.Prioridad, subtareasAJSON(extra.Subtareas), extra.RepetirModo, id)
		if err != nil {
			writeError(w, 500, "No se pudo actualizar la tarea")
			return
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			writeError(w, 404, "Tarea no encontrada")
			return
		}
		writeJSON(w, 200, map[string]bool{"success": true})
	case http.MethodDelete:
		res, err := db.Exec("DELETE FROM tareas WHERE id=?", id)
		if err != nil {
			writeError(w, 500, "No se pudo eliminar la tarea")
			return
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			writeError(w, 404, "Tarea no encontrada")
			return
		}
		borrarNotasDe("tarea", id)
		writeJSON(w, 200, map[string]bool{"success": true})
	default:
		w.Header().Set("Allow", "PUT, DELETE")
		writeError(w, 405, "Método no permitido")
	}
}

func updateTask(id int, done bool) error {
	if !done {
		_, err := db.Exec("UPDATE tareas SET completada=0 WHERE id=?", id)
		return err
	}

	var t Tarea
	var subTxt string
	if err := db.QueryRow("SELECT id,titulo,asignado_a,repetir_dias,COALESCE(fecha,''),COALESCE(hora,''),COALESCE(prioridad,0),COALESCE(subtareas,''),COALESCE(repetir_modo,'') FROM tareas WHERE id=?", id).
		Scan(&t.ID, &t.Titulo, &t.AsignadoA, &t.RepetirDias, &t.Fecha, &t.Hora, &t.Prioridad, &subTxt, &t.RepetirModo); err != nil {
		return err
	}
	t.Subtareas = subtareasDesdeJSON(subTxt)

	if t.RepetirDias <= 0 && t.RepetirModo == "" {
		_, err := db.Exec("UPDATE tareas SET completada=1 WHERE id=?", id)
		return err
	}

	// Tarea con repetición: la ocurrencia de hoy se marca como completada tal
	// cual (con su propia fecha, para que quede en el historial de
	// "Completadas"), y se crea una fila nueva ya pendiente con la siguiente
	// fecha ("Próximas"). No se crea ningún evento en el calendario.
	base := time.Now()
	if t.Fecha != "" {
		if parsed, err := time.Parse(dateLayout, t.Fecha); err == nil {
			base = parsed
		}
	}
	next := siguienteFechaTarea(base, t.RepetirDias, t.RepetirModo, time.Now()).Format(dateLayout)
	// La nueva repetición empieza con las subtareas sin marcar.
	for i := range t.Subtareas {
		t.Subtareas[i].Hecha = false
	}

	tx, err := db.Begin()
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err = tx.Exec("UPDATE tareas SET completada=1 WHERE id=?", id); err != nil {
		return err
	}
	if _, err = tx.Exec(`INSERT INTO tareas(titulo,asignado_a,completada,repetir_dias,fecha,hora,prioridad,subtareas,repetir_modo) VALUES(?,?,0,?,?,?,?,?,?)`,
		t.Titulo, t.AsignadoA, t.RepetirDias, next, t.Hora, t.Prioridad, subtareasAJSON(t.Subtareas), t.RepetirModo); err != nil {
		return err
	}
	return tx.Commit()
}

func handleEventos(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(`SELECT id,titulo,fecha,COALESCE(fecha_fin,''),COALESCE(hora_inicio,''),COALESCE(hora_fin,''),COALESCE(persona,'Todos'),COALESCE(descripcion,''),COALESCE(ubicacion,''),COALESCE(notificacion_minutos,0),COALESCE(repetir_anual,0),COALESCE(avisos,''),COALESCE(repeticion,''),COALESCE(repetir_cada,1),COALESCE(repetir_dias,''),COALESCE(repetir_hasta,''),COALESCE(excepciones,''),COALESCE(anio_nacimiento,0) FROM eventos ORDER BY fecha ASC,hora_inicio ASC`)
		if err != nil {
			writeError(w, 500, "Error al cargar los eventos")
			return
		}
		defer rows.Close()
		list := []Evento{}
		for rows.Next() {
			var e Evento
			var avisosTxt string
			if err := rows.Scan(&e.ID, &e.Title, &e.Start, &e.FechaFin, &e.HoraInicio, &e.HoraFin, &e.Persona, &e.Descripcion, &e.Ubicacion, &e.NotificacionMinutos, &e.RepetirAnual, &avisosTxt, &e.Repeticion, &e.RepetirCada, &e.RepetirDias, &e.RepetirHasta, &e.Excepciones, &e.AnioNacimiento); err != nil {
				writeError(w, 500, "Error al leer los eventos")
				return
			}
			e.Avisos = avisosEfectivos(avisosTxt, e.NotificacionMinutos)
			if e.Repeticion == "" && e.RepetirAnual {
				e.Repeticion = "anual"
			}
			e.RepetirAnual = e.Repeticion == "anual"
			list = append(list, e)
		}
		writeJSON(w, 200, list)
	case http.MethodPost:
		var e Evento
		if err := decodeJSON(r, &e); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		e.Title = strings.TrimSpace(e.Title)
		e.Descripcion = strings.TrimSpace(e.Descripcion)
		e.Ubicacion = strings.TrimSpace(e.Ubicacion)
		if len([]rune(e.Ubicacion)) > 200 {
			writeError(w, 400, "El lugar es demasiado largo")
			return
		}
		e.Persona = strings.TrimSpace(e.Persona)
		if e.Persona == "" {
			e.Persona = "Todos"
		}
		if e.Title == "" || e.Start == "" {
			writeError(w, 400, "Título y fecha son obligatorios")
			return
		}
		if _, err := time.Parse(dateLayout, e.Start); err != nil {
			writeError(w, 400, "Fecha inválida")
			return
		}
		if e.FechaFin != "" {
			finParsed, err := time.Parse(dateLayout, e.FechaFin)
			if err != nil {
				writeError(w, 400, "Fecha de fin inválida")
				return
			}
			inicioParsed, _ := time.Parse(dateLayout, e.Start)
			if finParsed.Before(inicioParsed) {
				writeError(w, 400, "La fecha de fin no puede ser anterior a la de inicio")
				return
			}
		}
		for _, h := range []struct{ name, value string }{{"inicio", e.HoraInicio}, {"fin", e.HoraFin}} {
			if h.value != "" {
				if _, err := time.Parse("15:04", h.value); err != nil {
					writeError(w, 400, "Hora "+h.name+" inválida")
					return
				}
			}
		}
		if e.NotificacionMinutos < 0 {
			writeError(w, 400, "Notificación inválida")
			return
		}
		if msg := normalizarRepeticionYAvisos(&e); msg != "" {
			writeError(w, 400, msg)
			return
		}
		res, err := db.Exec(`INSERT INTO eventos(titulo,fecha,fecha_fin,hora_inicio,hora_fin,persona,descripcion,ubicacion,notificacion_minutos,repetir_anual,avisos,repeticion,repetir_cada,repetir_dias,repetir_hasta,anio_nacimiento) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
			e.Title, e.Start, e.FechaFin, e.HoraInicio, e.HoraFin, e.Persona, e.Descripcion, e.Ubicacion, e.NotificacionMinutos, e.RepetirAnual, joinAvisos(e.Avisos), e.Repeticion, e.RepetirCada, e.RepetirDias, e.RepetirHasta, e.AnioNacimiento)
		if err != nil {
			writeError(w, 500, "No se pudo guardar el evento")
			return
		}
		id, _ := res.LastInsertId()
		e.ID = int(id)
		writeJSON(w, 201, e)
	default:
		w.Header().Set("Allow", "GET, POST")
		writeError(w, 405, "Método no permitido")
	}
}

// POST /eventos/{id}/excepcion {"fecha":"2026-10-20"}: quita una sola ocurrencia
// de un evento que se repite (el resto de la serie queda intacto).
func handleEventoExcepcion(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeError(w, 405, "Método no permitido")
		return
	}
	partes := strings.Split(strings.Trim(r.URL.Path, "/"), "/")
	id, err := strconv.Atoi(partes[1])
	if len(partes) != 3 || err != nil || id <= 0 {
		writeError(w, 400, "ID inválido")
		return
	}
	var body struct {
		Fecha string `json:"fecha"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeError(w, 400, "JSON inválido")
		return
	}
	if _, err := time.Parse(dateLayout, body.Fecha); err != nil {
		writeError(w, 400, "Fecha inválida")
		return
	}
	var actual string
	if err := db.QueryRow("SELECT COALESCE(excepciones,'') FROM eventos WHERE id=?", id).Scan(&actual); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, 404, "Evento no encontrado")
			return
		}
		writeError(w, 500, "No se pudo actualizar el evento")
		return
	}
	fechas := []string{}
	for _, f := range strings.Split(actual, ",") {
		f = strings.TrimSpace(f)
		if f != "" && f != body.Fecha {
			fechas = append(fechas, f)
		}
	}
	fechas = append(fechas, body.Fecha)
	sort.Strings(fechas)
	if _, err := db.Exec("UPDATE eventos SET excepciones=? WHERE id=?", strings.Join(fechas, ","), id); err != nil {
		writeError(w, 500, "No se pudo actualizar el evento")
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}

func handleEventosID(w http.ResponseWriter, r *http.Request) {
	if strings.HasSuffix(strings.TrimRight(r.URL.Path, "/"), "/excepcion") {
		handleEventoExcepcion(w, r)
		return
	}
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	switch r.Method {
	case http.MethodPut:
		var e Evento
		if err := decodeJSON(r, &e); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		e.Title = strings.TrimSpace(e.Title)
		e.Descripcion = strings.TrimSpace(e.Descripcion)
		e.Ubicacion = strings.TrimSpace(e.Ubicacion)
		if len([]rune(e.Ubicacion)) > 200 {
			writeError(w, 400, "El lugar es demasiado largo")
			return
		}
		e.Persona = strings.TrimSpace(e.Persona)
		if e.Persona == "" {
			e.Persona = "Todos"
		}
		if e.Title == "" || e.Start == "" {
			writeError(w, 400, "Título y fecha son obligatorios")
			return
		}
		if _, err := time.Parse(dateLayout, e.Start); err != nil {
			writeError(w, 400, "Fecha inválida")
			return
		}
		if e.FechaFin != "" {
			finParsed, err := time.Parse(dateLayout, e.FechaFin)
			if err != nil {
				writeError(w, 400, "Fecha de fin inválida")
				return
			}
			inicioParsed, _ := time.Parse(dateLayout, e.Start)
			if finParsed.Before(inicioParsed) {
				writeError(w, 400, "La fecha de fin no puede ser anterior a la de inicio")
				return
			}
		}
		for _, h := range []struct{ name, value string }{{"inicio", e.HoraInicio}, {"fin", e.HoraFin}} {
			if h.value != "" {
				if _, err := time.Parse("15:04", h.value); err != nil {
					writeError(w, 400, "Hora "+h.name+" inválida")
					return
				}
			}
		}
		if e.NotificacionMinutos < 0 {
			writeError(w, 400, "Notificación inválida")
			return
		}
		if msg := normalizarRepeticionYAvisos(&e); msg != "" {
			writeError(w, 400, msg)
			return
		}
		res, err := db.Exec(`UPDATE eventos SET titulo=?, fecha=?, fecha_fin=?, hora_inicio=?, hora_fin=?, persona=?, descripcion=?, ubicacion=?, notificacion_minutos=?, repetir_anual=?, avisos=?, repeticion=?, repetir_cada=?, repetir_dias=?, repetir_hasta=?, anio_nacimiento=?, notificado_push=0, notificado_anio=0 WHERE id=?`,
			e.Title, e.Start, e.FechaFin, e.HoraInicio, e.HoraFin, e.Persona, e.Descripcion, e.Ubicacion, e.NotificacionMinutos, e.RepetirAnual, joinAvisos(e.Avisos), e.Repeticion, e.RepetirCada, e.RepetirDias, e.RepetirHasta, e.AnioNacimiento, id)
		if err != nil {
			writeError(w, 500, "No se pudo actualizar el evento")
			return
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			writeError(w, 404, "Evento no encontrado")
			return
		}
		db.Exec("DELETE FROM eventos_avisos WHERE evento_id=?", id)
		e.ID = id
		writeJSON(w, 200, e)
	case http.MethodDelete:
		res, err := db.Exec("DELETE FROM eventos WHERE id=?", id)
		if err != nil {
			writeError(w, 500, "No se pudo eliminar el evento")
			return
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			writeError(w, 404, "Evento no encontrado")
			return
		}
		db.Exec("DELETE FROM eventos_avisos WHERE evento_id=?", id)
		borrarNotasDe("evento", id)
		writeJSON(w, 200, map[string]bool{"success": true})
	default:
		w.Header().Set("Allow", "PUT, DELETE")
		writeError(w, 405, "Método no permitido")
	}
}

func handleMenu(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		values := strings.Split(r.URL.Query().Get("fechas"), ",")
		valid := []string{}
		for _, v := range values {
			v = strings.TrimSpace(v)
			if v == "" {
				continue
			}
			if _, err := time.Parse(dateLayout, v); err != nil {
				writeError(w, 400, "Fecha inválida")
				return
			}
			valid = append(valid, v)
		}
		if len(valid) == 0 {
			writeJSON(w, 200, []Menu{})
			return
		}
		ph := make([]string, len(valid))
		args := make([]any, len(valid))
		for i, v := range valid {
			ph[i] = "?"
			args[i] = v
		}
		rows, err := db.Query("SELECT fecha,comida,cena FROM menu WHERE fecha IN ("+strings.Join(ph, ",")+")", args...)
		if err != nil {
			writeError(w, 500, "Error al cargar el menú")
			return
		}
		defer rows.Close()
		list := []Menu{}
		for rows.Next() {
			var m Menu
			if err := rows.Scan(&m.Fecha, &m.Comida, &m.Cena); err != nil {
				writeError(w, 500, "Error al leer el menú")
				return
			}
			list = append(list, m)
		}
		writeJSON(w, 200, list)
	case http.MethodPost:
		var m Menu
		if err := decodeJSON(r, &m); err != nil || m.Fecha == "" {
			writeError(w, 400, "Datos inválidos")
			return
		}
		if _, err := time.Parse(dateLayout, m.Fecha); err != nil {
			writeError(w, 400, "Fecha inválida")
			return
		}
		_, err := db.Exec(`INSERT INTO menu(fecha,comida,cena) VALUES(?,?,?) ON CONFLICT(fecha) DO UPDATE SET comida=excluded.comida,cena=excluded.cena`, m.Fecha, m.Comida, m.Cena)
		if err != nil {
			writeError(w, 500, "No se pudo guardar el menú")
			return
		}
		writeJSON(w, 200, map[string]bool{"success": true})
	default:
		w.Header().Set("Allow", "GET, POST")
		writeError(w, 405, "Método no permitido")
	}
}

// --- HANDLERS PAGOS / FACTURAS ---

func siguienteFecha(fecha, frecuencia string) (string, error) {
	t, err := time.Parse(dateLayout, fecha)
	if err != nil {
		return "", err
	}
	switch frecuencia {
	case "mensual":
		t = t.AddDate(0, 1, 0)
	case "bimestral":
		t = t.AddDate(0, 2, 0)
	case "trimestral":
		t = t.AddDate(0, 3, 0)
	case "semestral":
		t = t.AddDate(0, 6, 0)
	case "anual":
		t = t.AddDate(1, 0, 0)
	default: // "puntual" u otro valor: no se repite
	}
	return t.Format(dateLayout), nil
}

func handlePagos(w http.ResponseWriter, r *http.Request) {
	switch r.Method {
	case http.MethodGet:
		rows, err := db.Query(`SELECT id,nombre,importe,frecuencia,fecha,persona,notas,pagado FROM pagos ORDER BY fecha ASC`)
		if err != nil {
			writeError(w, 500, "Error al cargar los pagos")
			return
		}
		defer rows.Close()
		list := []Pago{}
		for rows.Next() {
			var p Pago
			if err := rows.Scan(&p.ID, &p.Nombre, &p.Importe, &p.Frecuencia, &p.Fecha, &p.Persona, &p.Notas, &p.Pagado); err != nil {
				writeError(w, 500, "Error al leer los pagos")
				return
			}
			list = append(list, p)
		}
		writeJSON(w, 200, list)
	case http.MethodPost:
		var p Pago
		if err := decodeJSON(r, &p); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}
		p.Nombre = strings.TrimSpace(p.Nombre)
		p.Persona = strings.TrimSpace(p.Persona)
		p.Notas = strings.TrimSpace(p.Notas)
		if p.Nombre == "" {
			writeError(w, 400, "El nombre no puede estar vacío")
			return
		}
		if p.Persona == "" {
			p.Persona = "Todos"
		}
		if p.Frecuencia == "" {
			p.Frecuencia = "mensual"
		}
		if !frecuenciasValidas[p.Frecuencia] {
			writeError(w, 400, "Frecuencia inválida")
			return
		}
		if p.Importe < 0 {
			writeError(w, 400, "Importe inválido")
			return
		}
		if _, err := time.Parse(dateLayout, p.Fecha); err != nil {
			writeError(w, 400, "Fecha inválida")
			return
		}
		res, err := db.Exec(`INSERT INTO pagos(nombre,importe,frecuencia,fecha,persona,notas,pagado) VALUES(?,?,?,?,?,?,0)`,
			p.Nombre, p.Importe, p.Frecuencia, p.Fecha, p.Persona, p.Notas)
		if err != nil {
			log.Printf("ERROR al insertar pago: %v (datos: %+v)", err, p)
			writeError(w, 500, "No se pudo guardar el pago")
			return
		}
		id, _ := res.LastInsertId()
		p.ID = int(id)
		writeJSON(w, 201, p)
	default:
		w.Header().Set("Allow", "GET, POST")
		writeError(w, 405, "Método no permitido")
	}
}

func handlePagosID(w http.ResponseWriter, r *http.Request) {
	id, err := parseID(r)
	if err != nil {
		writeError(w, 400, err.Error())
		return
	}
	switch r.Method {
	case http.MethodPut:
		var d struct {
			Pagado     *bool    `json:"pagado,omitempty"`
			Nombre     *string  `json:"nombre,omitempty"`
			Importe    *float64 `json:"importe,omitempty"`
			Frecuencia *string  `json:"frecuencia,omitempty"`
			Fecha      *string  `json:"fecha,omitempty"`
			Persona    *string  `json:"persona,omitempty"`
			Notas      *string  `json:"notas,omitempty"`
		}
		if err := decodeJSON(r, &d); err != nil {
			writeError(w, 400, "JSON inválido")
			return
		}

		if d.Pagado != nil {
			if !*d.Pagado {
				writeError(w, 400, "Solo se puede marcar un pago como realizado")
				return
			}
			var p Pago
			if err := db.QueryRow("SELECT id,nombre,importe,frecuencia,fecha,persona,notas FROM pagos WHERE id=?", id).
				Scan(&p.ID, &p.Nombre, &p.Importe, &p.Frecuencia, &p.Fecha, &p.Persona, &p.Notas); err != nil {
				if errors.Is(err, sql.ErrNoRows) {
					writeError(w, 404, "Pago no encontrado")
					return
				}
				writeError(w, 500, "No se pudo actualizar el pago")
				return
			}
			next := ""
			if p.Frecuencia != "puntual" {
				n, err := siguienteFecha(p.Fecha, p.Frecuencia)
				if err != nil {
					writeError(w, 500, "No se pudo calcular la siguiente fecha")
					return
				}
				next = n
			}
			tx, err := db.Begin()
			if err != nil {
				writeError(w, 500, "No se pudo actualizar el pago")
				return
			}
			defer tx.Rollback()
			res, err := tx.Exec(`INSERT INTO pagos_historial(pago_id,nombre,importe,frecuencia,persona,notas,fecha_vencimiento,fecha_pago) VALUES(?,?,?,?,?,?,?,?)`,
				p.ID, p.Nombre, p.Importe, p.Frecuencia, p.Persona, p.Notas, p.Fecha, time.Now().Format(dateLayout))
			if err != nil {
				log.Printf("ERROR al guardar historial de pago: %v", err)
				writeError(w, 500, "No se pudo actualizar el pago")
				return
			}
			if next == "" {
				_, err = tx.Exec("UPDATE pagos SET pagado=1 WHERE id=?", id)
			} else {
				_, err = tx.Exec("UPDATE pagos SET fecha=?, pagado=0, notificado_fecha='' WHERE id=?", next, id)
			}
			if err != nil {
				writeError(w, 500, "No se pudo actualizar el pago")
				return
			}
			if err := tx.Commit(); err != nil {
				writeError(w, 500, "No se pudo actualizar el pago")
				return
			}
			hid, _ := res.LastInsertId()
			avisarFacturaCara(p.Nombre, p.Importe)
			writeJSON(w, 200, map[string]any{"success": true, "historial_id": hid})
			return
		}

		// Edición de los datos del pago (no es el toggle de "pagado").
		if d.Nombre == nil || d.Importe == nil || d.Frecuencia == nil || d.Fecha == nil {
			writeError(w, 400, "Faltan datos para editar el pago")
			return
		}
		nombre := strings.TrimSpace(*d.Nombre)
		if nombre == "" {
			writeError(w, 400, "El nombre no puede estar vacío")
			return
		}
		frecuencia := strings.TrimSpace(*d.Frecuencia)
		if !frecuenciasValidas[frecuencia] {
			writeError(w, 400, "Frecuencia inválida")
			return
		}
		if *d.Importe < 0 {
			writeError(w, 400, "Importe inválido")
			return
		}
		fecha := strings.TrimSpace(*d.Fecha)
		if _, err := time.Parse(dateLayout, fecha); err != nil {
			writeError(w, 400, "Fecha inválida")
			return
		}
		persona := "Todos"
		if d.Persona != nil {
			persona = strings.TrimSpace(*d.Persona)
		}
		if persona == "" {
			persona = "Todos"
		}
		notas := ""
		if d.Notas != nil {
			notas = strings.TrimSpace(*d.Notas)
		}

		res, err := db.Exec(`UPDATE pagos SET nombre=?, importe=?, frecuencia=?, fecha=?, persona=?, notas=?, notificado_fecha='' WHERE id=?`,
			nombre, *d.Importe, frecuencia, fecha, persona, notas, id)
		if err != nil {
			writeError(w, 500, "No se pudo actualizar el pago")
			return
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			writeError(w, 404, "Pago no encontrado")
			return
		}
		writeJSON(w, 200, map[string]bool{"success": true})
	case http.MethodDelete:
		res, err := db.Exec("DELETE FROM pagos WHERE id=?", id)
		if err != nil {
			writeError(w, 500, "No se pudo eliminar el pago")
			return
		}
		n, _ := res.RowsAffected()
		if n == 0 {
			writeError(w, 404, "Pago no encontrado")
			return
		}
		borrarNotasDe("pago", id)
		writeJSON(w, 200, map[string]bool{"success": true})
	default:
		w.Header().Set("Allow", "PUT, DELETE")
		writeError(w, 405, "Método no permitido")
	}
}

// GET /pagos/historial: pagos ya realizados, del más reciente al más antiguo.
func handleHistorialPagos(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, 405, "Método no permitido")
		return
	}
	rows, err := db.Query(`SELECT id,pago_id,nombre,importe,frecuencia,persona,notas,fecha_vencimiento,fecha_pago
		FROM pagos_historial ORDER BY fecha_pago DESC, id DESC LIMIT 500`)
	if err != nil {
		writeError(w, 500, "Error al cargar el historial de pagos")
		return
	}
	defer rows.Close()
	list := []PagoHistorial{}
	for rows.Next() {
		var h PagoHistorial
		if err := rows.Scan(&h.ID, &h.PagoID, &h.Nombre, &h.Importe, &h.Frecuencia, &h.Persona, &h.Notas, &h.FechaVencimiento, &h.FechaPago); err != nil {
			writeError(w, 500, "Error al leer el historial de pagos")
			return
		}
		list = append(list, h)
	}
	writeJSON(w, 200, list)
}

// DELETE /pagos/historial/{id}: deshace un pago realizado (el pago vuelve a
// su fecha anterior y se quita del historial). PUT no existe.
func handleHistorialPagoID(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodDelete {
		w.Header().Set("Allow", "DELETE")
		writeError(w, 405, "Método no permitido")
		return
	}
	id, err := strconv.Atoi(strings.TrimPrefix(r.URL.Path, "/pagos/historial/"))
	if err != nil || id <= 0 {
		writeError(w, 400, "ID inválido")
		return
	}
	var h PagoHistorial
	if err := db.QueryRow(`SELECT id,pago_id,nombre,importe,frecuencia,persona,notas,fecha_vencimiento FROM pagos_historial WHERE id=?`, id).
		Scan(&h.ID, &h.PagoID, &h.Nombre, &h.Importe, &h.Frecuencia, &h.Persona, &h.Notas, &h.FechaVencimiento); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			writeError(w, 404, "Registro no encontrado")
			return
		}
		writeError(w, 500, "No se pudo deshacer el pago")
		return
	}
	tx, err := db.Begin()
	if err != nil {
		writeError(w, 500, "No se pudo deshacer el pago")
		return
	}
	defer tx.Rollback()
	res, err := tx.Exec("UPDATE pagos SET fecha=?, pagado=0, notificado_fecha='' WHERE id=?", h.FechaVencimiento, h.PagoID)
	if err == nil {
		if n, _ := res.RowsAffected(); n == 0 {
			// El pago se borró después de pagarlo: se vuelve a crear.
			_, err = tx.Exec(`INSERT INTO pagos(nombre,importe,frecuencia,fecha,persona,notas,pagado) VALUES(?,?,?,?,?,?,0)`,
				h.Nombre, h.Importe, h.Frecuencia, h.FechaVencimiento, h.Persona, h.Notas)
		}
	}
	if err == nil {
		_, err = tx.Exec("DELETE FROM pagos_historial WHERE id=?", id)
	}
	if err == nil {
		err = tx.Commit()
	}
	if err != nil {
		log.Printf("ERROR al deshacer pago: %v", err)
		writeError(w, 500, "No se pudo deshacer el pago")
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}

// anotarEnHistorialCompra recuerda un producto para las sugerencias y los "habituales",
// aunque luego se borre de la lista. sumar=true cuenta una vez más que se añade.
func anotarEnHistorialCompra(producto, supermercado, cantidad string, sumar bool) {
	producto = strings.TrimSpace(producto)
	if producto == "" {
		return
	}
	clave := strings.ToLower(producto)
	hoy := time.Now().Format(dateLayout)
	if sumar {
		db.Exec(`INSERT INTO compra_historial(clave,producto,supermercado,cantidad,veces,ultima) VALUES(?,?,?,?,1,?)
			ON CONFLICT(clave) DO UPDATE SET producto=excluded.producto, supermercado=excluded.supermercado, cantidad=excluded.cantidad, veces=veces+1, ultima=excluded.ultima`,
			clave, producto, supermercado, cantidad, hoy)
		return
	}
	db.Exec(`INSERT OR IGNORE INTO compra_historial(clave,producto,supermercado,cantidad,veces,ultima) VALUES(?,?,?,?,1,?)`,
		clave, producto, supermercado, cantidad, hoy)
}

// GET /compra/sugerencias: todo lo que alguna vez se ha añadido a la lista (aunque
// ya no esté), con cuántas veces, para sugerirlo al escribir y para los "habituales".
func handleCompraSugerencias(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, 405, "Método no permitido")
		return
	}
	enLista := map[string]bool{}
	if filas, err := db.Query(`SELECT producto FROM compra WHERE archivado=0`); err == nil {
		for filas.Next() {
			var p string
			if filas.Scan(&p) == nil {
				enLista[strings.ToLower(strings.TrimSpace(p))] = true
			}
		}
		filas.Close()
	}
	rows, err := db.Query(`SELECT clave, producto, supermercado, cantidad, veces FROM compra_historial ORDER BY producto COLLATE NOCASE ASC`)
	if err != nil {
		writeError(w, 500, "Error al cargar las sugerencias")
		return
	}
	defer rows.Close()
	type sugerencia struct {
		Producto     string `json:"producto"`
		Supermercado string `json:"supermercado"`
		Cantidad     string `json:"cantidad"`
		Veces        int    `json:"veces"`
		EnLista      bool   `json:"en_lista"`
	}
	list := []sugerencia{}
	for rows.Next() {
		var s sugerencia
		var clave string
		if err := rows.Scan(&clave, &s.Producto, &s.Supermercado, &s.Cantidad, &s.Veces); err != nil {
			writeError(w, 500, "Error al leer las sugerencias")
			return
		}
		s.EnLista = enLista[clave]
		list = append(list, s)
	}
	writeJSON(w, 200, list)
}
