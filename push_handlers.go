package main

import (
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

func handlePushPublicKey(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, 405, "Método no permitido")
		return
	}
	writeJSON(w, 200, map[string]string{"publicKey": vapidPublicKeyB64})
}

func handlePushSubscribe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeError(w, 405, "Método no permitido")
		return
	}
	var body struct {
		Endpoint string `json:"endpoint"`
		Keys     struct {
			P256dh string `json:"p256dh"`
			Auth   string `json:"auth"`
		} `json:"keys"`
		Persona string `json:"persona"`
	}
	if err := decodeJSON(r, &body); err != nil || body.Endpoint == "" || body.Keys.P256dh == "" || body.Keys.Auth == "" {
		writeError(w, 400, "Suscripción inválida")
		return
	}
	persona := strings.TrimSpace(body.Persona)
	if persona == "" {
		// Se asocia el dispositivo a quien tiene la sesión abierta, para avisos dirigidos.
		if u := usuarioActual(r); u != nil {
			persona = u.Nombre
		} else {
			persona = "Todos"
		}
	}
	_, err := db.Exec(`INSERT INTO push_subscripciones(endpoint,p256dh,auth,persona,origen) VALUES(?,?,?,?,?)
		ON CONFLICT(endpoint) DO UPDATE SET p256dh=excluded.p256dh, auth=excluded.auth, persona=excluded.persona, origen=excluded.origen`,
		body.Endpoint, body.Keys.P256dh, body.Keys.Auth, persona, strings.ToLower(r.Host))
	if err != nil {
		writeError(w, 500, "No se pudo guardar la suscripción")
		return
	}
	writeJSON(w, 200, map[string]bool{"success": true})
}

func handlePushUnsubscribe(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		w.Header().Set("Allow", "POST")
		writeError(w, 405, "Método no permitido")
		return
	}
	var body struct {
		Endpoint string `json:"endpoint"`
	}
	if err := decodeJSON(r, &body); err != nil || body.Endpoint == "" {
		writeError(w, 400, "Petición inválida")
		return
	}
	db.Exec("DELETE FROM push_subscripciones WHERE endpoint=?", body.Endpoint)
	writeJSON(w, 200, map[string]bool{"success": true})
}

// enviarATodos manda el mismo aviso a todas las suscripciones guardadas,
// eliminando las que el navegador ya haya invalidado.
func enviarATodos(titulo, cuerpo, tag string) {
	enviarPushFiltrado(titulo, cuerpo, tag, "")
}

// enviarAPersona avisa solo a los dispositivos de esa persona; enviarAOtros, a todos menos a ella.
func enviarAPersona(nombre, titulo, cuerpo, tag string) {
	enviarPushFiltrado(titulo, cuerpo, tag, "WHERE persona = ? COLLATE NOCASE", nombre)
}

func enviarAOtros(nombre, titulo, cuerpo, tag string) {
	enviarPushFiltrado(titulo, cuerpo, tag, "WHERE persona <> ? COLLATE NOCASE", nombre)
}

func enviarPushFiltrado(titulo, cuerpo, tag, filtro string, args ...any) {
	enviarPushFiltradoOpc(true, titulo, cuerpo, tag, filtro, args...)
}

// enviarPushFiltradoOpc: igual que enviarPushFiltrado; con nativos=false no se envía a las apps de Android (APK).
func enviarPushFiltradoOpc(nativos bool, titulo, cuerpo, tag, filtro string, args ...any) {
	if nativos {
		go enviarNativos(titulo, cuerpo, tag, filtro, args...)
	} // apps de Android (APK); los avisos web van abajo
	rows, err := db.Query("SELECT id,endpoint,p256dh,auth,persona FROM push_subscripciones "+filtro, args...)
	if err != nil {
		log.Printf("push: error leyendo suscripciones: %v", err)
		return
	}
	var subs []PushSubscription
	for rows.Next() {
		var s PushSubscription
		if err := rows.Scan(&s.ID, &s.Endpoint, &s.P256dh, &s.Auth, &s.Persona); err == nil {
			subs = append(subs, s)
		}
	}
	rows.Close()

	payload, _ := json.Marshal(map[string]string{"title": titulo, "body": cuerpo, "tag": tag})
	log.Printf("push: enviando a %d suscripción(es)", len(subs))

	for _, s := range subs {
		if err := enviarPush(s, payload); err != nil {
			if err == errSuscripcionCaducada {
				log.Printf("push: suscripción %d caducada, se borra", s.ID)
				db.Exec("DELETE FROM push_subscripciones WHERE id=?", s.ID)
			} else {
				log.Printf("push: error enviando a %d: %v", s.ID, err)
			}
		} else {
			log.Printf("push: enviado correctamente a la suscripción %d", s.ID)
		}
	}
}

// iniciarPlanificadorPush revisa cada minuto si hay eventos o pagos que
// avisar y envía las notificaciones push correspondientes.
func iniciarPlanificadorPush() {
	ticker := time.NewTicker(1 * time.Minute)
	go func() {
		// Cada comprobación va en su propia goroutine: si una se atasca (p. ej. la web del cole
		// o una suscripción push que no responde), los avisos de eventos no se retrasan.
		lanzar := func(nombre string, f func()) {
			go func() {
				defer func() {
					if r := recover(); r != nil {
						log.Printf("planificador: pánico en %s: %v", nombre, r)
					}
				}()
				f()
			}()
		}
		lanzar("eventos", revisarEventosParaAvisar)
		lanzar("pagos", revisarPagosParaAvisar)
		lanzar("tareas", revisarTareasParaAvisar)
		lanzar("mis-cosas", revisarMisCosasParaAvisar)
		lanzar("saldo", revisarSaldoConjuntaParaAvisar)
		lanzar("menu-cole", intentarDescargarMenuColegio) // probar una vez al arrancar, por si acaso
		for range ticker.C {
			lanzar("eventos", revisarEventosParaAvisar)
			lanzar("pagos", revisarPagosParaAvisar)
			lanzar("tareas", revisarTareasParaAvisar)
			lanzar("mis-cosas", revisarMisCosasParaAvisar)
			lanzar("saldo", revisarSaldoConjuntaParaAvisar)
			// El menú del cole solo se intenta una vez al día (a las 7:00), no
			// tiene sentido pedírselo a su web cada minuto como el resto de avisos.
			if time.Now().Hour() == 7 && time.Now().Minute() == 0 {
				lanzar("menu-cole", intentarDescargarMenuColegio)
			}
		}
	}()
}

func revisarEventosParaAvisar() {
	ahora := time.Now()
	hoy, _ := time.Parse(dateLayout, ahora.Format(dateLayout)) // el día de hoy (calendario local) como fecha UTC

	rows, err := db.Query(`SELECT id,titulo,fecha,COALESCE(hora_inicio,''),persona,COALESCE(avisos,''),COALESCE(notificacion_minutos,0),
		COALESCE(repeticion,''),COALESCE(repetir_cada,1),COALESCE(repetir_dias,''),COALESCE(repetir_hasta,''),COALESCE(excepciones,''),COALESCE(anio_nacimiento,0)
		FROM eventos WHERE COALESCE(avisos,'')!='' OR COALESCE(notificacion_minutos,0)>0`)
	if err != nil {
		return
	}
	type ev struct {
		id                         int
		titulo, fecha, hora        string
		persona                    string
		avisos                     []int
		rep, dias, hasta, excepcio string
		cada, anioNac              int
	}
	var lista []ev
	for rows.Next() {
		var e ev
		var avisosTxt string
		var notif int
		if err := rows.Scan(&e.id, &e.titulo, &e.fecha, &e.hora, &e.persona, &avisosTxt, &notif, &e.rep, &e.cada, &e.dias, &e.hasta, &e.excepcio, &e.anioNac); err == nil {
			e.avisos = avisosEfectivos(avisosTxt, notif)
			lista = append(lista, e)
		}
	}
	rows.Close()

	for _, e := range lista {
		inicioSerie, err := time.Parse(dateLayout, e.fecha)
		if err != nil {
			continue
		}
		hora := e.hora
		if hora == "" {
			hora = "09:00"
		}
		for _, minutos := range e.avisos {
			// Ocurrencias que empiezan entre hoy y dentro de lo que dure el aviso
			// (un aviso "2 días antes" ya puede tocar una ocurrencia de pasado mañana).
			diasVista := minutos/1440 + 1
			for d := 0; d <= diasVista; d++ {
				dia := hoy.AddDate(0, 0, d)
				if !ocurreEnDia(inicioSerie, e.rep, e.cada, e.dias, e.hasta, e.excepcio, dia) {
					continue
				}
				fechaOcurrencia := dia.Format(dateLayout)
				inicio, err := time.ParseInLocation("2006-01-02 15:04", fechaOcurrencia+" "+hora, time.Local)
				if err != nil {
					continue
				}
				momentoAviso := inicio.Add(-time.Duration(minutos) * time.Minute)
				if ahora.Before(momentoAviso) || ahora.After(inicio) {
					continue
				}
				// Se anota ANTES de enviar: si dos comprobaciones coinciden, solo una pasa.
				res, err := db.Exec(`INSERT OR IGNORE INTO eventos_avisos(evento_id,fecha_ocurrencia,minutos) VALUES(?,?,?)`, e.id, fechaOcurrencia, minutos)
				if err != nil {
					continue
				}
				if n, _ := res.RowsAffected(); n == 0 {
					continue
				}
				icono := "📅"
				if e.rep == "anual" {
					icono = "🎂"
				}
				titulo := e.titulo
				if e.rep == "anual" && e.anioNac > 0 && dia.Year() > e.anioNac {
					titulo += " · " + textoEdad(dia.Year()-e.anioNac)
				}
				// Si el aviso se envía tarde (evento creado o editado cuando ya había pasado el momento del aviso),
				// se dice el tiempo real que falta en vez del programado.
				retraso := ahora.Sub(momentoAviso)
				texto := textoAntelacion(minutos)
				if retraso > 2*time.Minute {
					texto = fmt.Sprintf("en %d min", int(inicio.Sub(ahora).Minutes())+1)
				}
				log.Printf("aviso evento %d %q: previsto %s, enviado %s (retraso %s)", e.id, e.titulo, momentoAviso.Format("15:04"), ahora.Format("15:04:05"), retraso.Round(time.Second))
				enviarATodos(icono+" "+titulo, "Para: "+e.persona+" · "+hora+" · "+texto, "evento-"+time.Now().String())
			}
		}
	}
}

// textoEdad: 1 -> "1 año", 8 -> "8 años".
func textoEdad(n int) string {
	if n == 1 {
		return "1 año"
	}
	return fmt.Sprintf("%d años", n)
}

// textoAntelacion: 1440 -> "en 1 día", 60 -> "en 1 h", 15 -> "en 15 min".
func textoAntelacion(minutos int) string {
	switch {
	case minutos >= 1440 && minutos%1440 == 0:
		if minutos == 1440 {
			return "mañana"
		}
		return fmt.Sprintf("en %d días", minutos/1440)
	case minutos >= 60 && minutos%60 == 0:
		return fmt.Sprintf("en %d h", minutos/60)
	default:
		return fmt.Sprintf("en %d min", minutos)
	}
}

func revisarPagosParaAvisar() {
	hoy := time.Now().Format(dateLayout)
	ahora := time.Now()

	rows, err := db.Query(`SELECT id,nombre,importe,fecha FROM pagos
		WHERE pagado=0 AND COALESCE(notificado_fecha,'')!=?`, hoy)
	if err != nil {
		return
	}
	type pg struct {
		id      int
		nombre  string
		importe float64
		fecha   string
	}
	var lista []pg
	for rows.Next() {
		var p pg
		if err := rows.Scan(&p.id, &p.nombre, &p.importe, &p.fecha); err == nil {
			lista = append(lista, p)
		}
	}
	rows.Close()

	for _, p := range lista {
		fechaCobro, err := time.Parse(dateLayout, p.fecha)
		if err != nil {
			continue
		}
		diaAntes := fechaCobro.AddDate(0, 0, -1).Format(dateLayout)

		vencidoOVenceHoy := p.fecha <= hoy
		avisoDiaAntes := diaAntes == hoy && ahora.Hour() >= 17
		if !vencidoOVenceHoy && !avisoDiaAntes {
			continue // todavía no toca avisar de este pago
		}

		var estado string
		switch {
		case p.fecha < hoy:
			estado = "vencido"
		case p.fecha == hoy:
			estado = "vence hoy"
		default:
			estado = "vence mañana"
		}
		enviarATodos("💳 "+p.nombre, fmt.Sprintf("%.2f € · %s", p.importe, estado), "pago-"+p.fecha)
		db.Exec("UPDATE pagos SET notificado_fecha=? WHERE id=?", hoy, p.id)
	}
}

// revisarTareasParaAvisar avisa de las tareas con fecha propia que vencen hoy
// o que ya están vencidas y siguen sin completarse. Las tareas sin fecha
// (siempre pendientes) no generan aviso, para no repetir notificaciones
// indefinidamente por algo sin plazo.
func revisarTareasParaAvisar() {
	ahora := time.Now()
	hoy := ahora.Format(dateLayout)
	horaAhora := ahora.Format("15:04")
	rows, err := db.Query(`SELECT id,titulo,asignado_a,fecha,COALESCE(hora,''),COALESCE(prioridad,0) FROM tareas
		WHERE completada=0 AND fecha!='' AND fecha<=? AND COALESCE(notificado_fecha,'')!=?`, hoy, hoy)
	if err != nil {
		return
	}
	type tr struct {
		id                            int
		titulo, asignado, fecha, hora string
		prioridad                     int
	}
	var lista []tr
	for rows.Next() {
		var t tr
		if err := rows.Scan(&t.id, &t.titulo, &t.asignado, &t.fecha, &t.hora, &t.prioridad); err == nil {
			lista = append(lista, t)
		}
	}
	rows.Close()

	for _, t := range lista {
		// Con hora propia, el aviso de hoy espera a esa hora (las vencidas avisan ya).
		if t.hora != "" && t.fecha == hoy && horaAhora < t.hora {
			continue
		}
		estado := "vence hoy"
		if t.hora != "" && t.fecha == hoy {
			estado = "a las " + t.hora
		}
		if t.fecha < hoy {
			estado = "vencida"
		}
		icono := "✅ "
		if t.prioridad > 0 {
			icono = "❗ "
		}
		enviarATodos(icono+t.titulo, "Para: "+t.asignado+" · "+estado, "tarea-"+t.fecha+"-"+fmt.Sprint(t.id))
		db.Exec("UPDATE tareas SET notificado_fecha=? WHERE id=?", hoy, t.id)
	}
}

// revisarMisCosasParaAvisar avisa por notificación push de las tareas y eventos privados de
// "Mis cosas" (son por usuario, nunca se mezclan con el Hogar familiar ni se ven entre personas).
// Las tareas avisan el día que vencen y, si siguen sin hacerse, cada día siguiente (como las
// del Hogar); los eventos solo el propio día, una vez.
func revisarMisCosasParaAvisar() {
	ahora := time.Now()
	hoy := ahora.Format(dateLayout)

	type aviso struct {
		id, usuarioID     int
		nombre, texto     string
		fecha, hora, tipo string
	}
	var lista []aviso

	rowsT, err := db.Query(`SELECT tp.id, tp.usuario_id, u.nombre, tp.texto, tp.fecha
		FROM tareas_personales tp JOIN usuarios u ON u.id = tp.usuario_id
		WHERE tp.hecha=0 AND tp.fecha!='' AND tp.fecha<=? AND COALESCE(tp.notificado_fecha,'')!=?`, hoy, hoy)
	if err == nil {
		for rowsT.Next() {
			var a aviso
			if rowsT.Scan(&a.id, &a.usuarioID, &a.nombre, &a.texto, &a.fecha) == nil {
				a.tipo = "tarea"
				lista = append(lista, a)
			}
		}
		rowsT.Close()
	}

	rowsE, err := db.Query(`SELECT ep.id, ep.usuario_id, u.nombre, ep.texto, ep.fecha, COALESCE(ep.hora,'')
		FROM eventos_personales ep JOIN usuarios u ON u.id = ep.usuario_id
		WHERE ep.fecha=? AND COALESCE(ep.notificado_fecha,'')!=?`, hoy, hoy)
	if err == nil {
		for rowsE.Next() {
			var a aviso
			if rowsE.Scan(&a.id, &a.usuarioID, &a.nombre, &a.texto, &a.fecha, &a.hora) == nil {
				a.tipo = "evento"
				lista = append(lista, a)
			}
		}
		rowsE.Close()
	}

	for _, a := range lista {
		titulo := "📝 " + a.texto
		cuerpo := "Vence hoy"
		if a.tipo == "evento" {
			titulo = "📅 " + a.texto
			cuerpo = "Hoy"
			if a.hora != "" {
				cuerpo += " · " + a.hora
			}
		}
		enviarAPersona(a.nombre, titulo, cuerpo, "mis-cosas-"+a.tipo+"-"+fmt.Sprint(a.id)+"-"+hoy)
		if a.tipo == "tarea" {
			db.Exec("UPDATE tareas_personales SET notificado_fecha=? WHERE id=?", hoy, a.id)
		} else {
			db.Exec("UPDATE eventos_personales SET notificado_fecha=? WHERE id=?", hoy, a.id)
		}
	}
}
