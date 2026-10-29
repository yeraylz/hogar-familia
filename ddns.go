package main

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net"
	"net/http"
	"net/url"
	"os"
	"strings"
	"sync"
	"time"
)

// DDNS con Cloudflare: si la IP pública de casa cambia, actualiza los registros A de los
// dominios indicados. Se activa con variables de entorno (ver docker-compose.yml):
//   CF_API_TOKEN     token de API con permiso "Zone · DNS · Edit" sobre la zona
//   CF_ZONE_ID       (recomendado) ID de la zona; si no, se busca por el nombre del dominio
//   CF_DDNS_NOMBRES  dominios separados por comas (sin valor por defecto; si no se indica, se desactiva)

type estadoDDNSTipo struct {
	Activo       bool     `json:"activo"`
	IP           string   `json:"ip"`
	Nombres      []string `json:"nombres"`
	UltimaRevis  string   `json:"ultima_revision"`
	UltimoCambio string   `json:"ultimo_cambio"`
	Error        string   `json:"error"`
}

var (
	muDDNS     sync.Mutex
	estadoDDNS = estadoDDNSTipo{Nombres: []string{}}
	clienteCF  = &http.Client{Timeout: 15 * time.Second}
)

func iniciarDDNS() {
	token := strings.TrimSpace(os.Getenv("CF_API_TOKEN"))
	if token == "" {
		return
	}
	nombres := []string{}
	for _, n := range strings.Split(os.Getenv("CF_DDNS_NOMBRES"), ",") {
		if n = strings.ToLower(strings.TrimSpace(n)); n != "" {
			nombres = append(nombres, n)
		}
	}
	if len(nombres) == 0 {
		return // CF_API_TOKEN sin CF_DDNS_NOMBRES: no hay nada que actualizar
	}
	muDDNS.Lock()
	estadoDDNS.Activo = true
	estadoDDNS.Nombres = nombres
	muDDNS.Unlock()

	zona := strings.TrimSpace(os.Getenv("CF_ZONE_ID"))
	go func() {
		time.Sleep(30 * time.Second)
		for {
			revisarDDNS(token, &zona, nombres)
			time.Sleep(5 * time.Minute)
		}
	}()
	log.Printf("DDNS Cloudflare activo para: %s", strings.Join(nombres, ", "))
}

func ipPublica() (string, error) {
	var ultimo error
	for _, u := range []string{"https://api.ipify.org", "https://ipv4.icanhazip.com", "https://ifconfig.me/ip"} {
		resp, err := clienteCF.Get(u)
		if err != nil {
			ultimo = err
			continue
		}
		b, _ := io.ReadAll(io.LimitReader(resp.Body, 100))
		resp.Body.Close()
		ip := strings.TrimSpace(string(b))
		if p := net.ParseIP(ip); p != nil && p.To4() != nil {
			return ip, nil
		}
		ultimo = fmt.Errorf("respuesta no válida de %s", u)
	}
	return "", ultimo
}

func llamadaCF(token, metodo, ruta string, cuerpo io.Reader, destino any) error {
	req, err := http.NewRequest(metodo, "https://api.cloudflare.com/client/v4"+ruta, cuerpo)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Content-Type", "application/json")
	resp, err := clienteCF.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var envoltorio struct {
		Success bool                       `json:"success"`
		Errors  []struct{ Message string } `json:"errors"`
		Result  json.RawMessage            `json:"result"`
	}
	if err := json.Unmarshal(b, &envoltorio); err != nil {
		return fmt.Errorf("respuesta de Cloudflare ilegible (HTTP %d)", resp.StatusCode)
	}
	if !envoltorio.Success {
		msg := fmt.Sprintf("HTTP %d", resp.StatusCode)
		if len(envoltorio.Errors) > 0 {
			msg = envoltorio.Errors[0].Message
		}
		return fmt.Errorf("Cloudflare: %s", msg)
	}
	if destino != nil {
		return json.Unmarshal(envoltorio.Result, destino)
	}
	return nil
}

func revisarDDNS(token string, zona *string, nombres []string) {
	ponerError := func(msg string) {
		muDDNS.Lock()
		estadoDDNS.Error = msg
		estadoDDNS.UltimaRevis = time.Now().Format(time.RFC3339)
		muDDNS.Unlock()
		log.Printf("DDNS: %s", msg)
	}
	ip, err := ipPublica()
	if err != nil {
		ponerError("no se pudo averiguar la IP pública: " + err.Error())
		return
	}
	if *zona == "" {
		partes := strings.Split(nombres[0], ".")
		if len(partes) < 2 {
			ponerError("dominio inválido: " + nombres[0])
			return
		}
		dominio := strings.Join(partes[len(partes)-2:], ".")
		var zonas []struct {
			ID string `json:"id"`
		}
		if err := llamadaCF(token, "GET", "/zones?name="+url.QueryEscape(dominio), nil, &zonas); err != nil || len(zonas) == 0 {
			if err == nil {
				err = fmt.Errorf("no se encontró la zona %s", dominio)
			}
			ponerError("no se pudo localizar la zona (pon CF_ZONE_ID): " + err.Error())
			return
		}
		*zona = zonas[0].ID
	}

	cambios := []string{}
	for _, nombre := range nombres {
		var registros []struct {
			ID      string `json:"id"`
			Content string `json:"content"`
		}
		if err := llamadaCF(token, "GET", "/zones/"+*zona+"/dns_records?type=A&name="+url.QueryEscape(nombre), nil, &registros); err != nil {
			ponerError(nombre + ": " + err.Error())
			return
		}
		if len(registros) == 0 {
			ponerError(nombre + ": no existe un registro A con ese nombre en Cloudflare")
			return
		}
		if registros[0].Content == ip {
			continue
		}
		cuerpo := strings.NewReader(fmt.Sprintf(`{"content":%q}`, ip))
		if err := llamadaCF(token, "PATCH", "/zones/"+*zona+"/dns_records/"+registros[0].ID, cuerpo, nil); err != nil {
			ponerError(nombre + ": " + err.Error())
			return
		}
		cambios = append(cambios, nombre)
	}

	muDDNS.Lock()
	estadoDDNS.IP = ip
	estadoDDNS.Error = ""
	estadoDDNS.UltimaRevis = time.Now().Format(time.RFC3339)
	if len(cambios) > 0 {
		estadoDDNS.UltimoCambio = estadoDDNS.UltimaRevis
	}
	muDDNS.Unlock()
	if len(cambios) > 0 {
		log.Printf("DDNS: IP pública %s, actualizado %s", ip, strings.Join(cambios, ", "))
		go enviarATodos("🌐 IP de casa actualizada", "Nueva IP "+ip+" · "+strings.Join(cambios, ", "), "ddns")
	}
}

func handleAjusteDDNS(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		w.Header().Set("Allow", "GET")
		writeError(w, 405, "Método no permitido")
		return
	}
	muDDNS.Lock()
	e := estadoDDNS
	muDDNS.Unlock()
	writeJSON(w, 200, e)
}
