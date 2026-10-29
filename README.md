# Hogar

[![ko-fi](https://ko-fi.com/img/githubbutton_sm.svg)](https://ko-fi.com/yeraylz)

Organizador familiar autoalojado: una sola app para las tareas, el calendario, los gastos
compartidos, la hipoteca, los documentos importantes y más cosas del día a día de una casa.
Pensada para instalarse en un servidor propio (un mini PC, una Raspberry Pi, una VPS...) con
Docker, sin depender de ningún servicio de terceros para funcionar.

Backend en Go (un solo binario, sin dependencias externas en tiempo de ejecución) con SQLite
como base de datos, y un frontend PWA en JavaScript sin frameworks: se instala en el móvil como
una app, con icono propio y funcionando sin conexión.

## Qué incluye

- **Hoy**: resumen del día para toda la familia, con el tiempo, cumpleaños próximos, estados y
  lo pendiente más urgente.
- **Tareas y calendario**: compartidos, con repetición, avisos y asignación por persona.
- **Gastos**: gasto diario y facturas por categorías, presupuestos, resumen mensual y cálculo de
  cuánto debería aportar cada adulto de la casa según el gasto real.
- **Hipoteca**: datos del préstamo y simulador de cuotas e intereses.
- **Documentos**: guarda DNI, tarjetas sanitarias, pasaportes, etc. (cifrables en reposo).
- **Enlaces**: accesos directos a otros servicios que tengas en casa (Immich, Jellyfin...).
- **Cole**: menú del comedor del colegio, subido a mano o descargado automáticamente si tu
  colegio publica un PDF con URL fija (configurable, ver `HOGAR_MENU_COLE_URL`).
- **Mis cosas**: lista de tareas y calendario privados de cada persona, aparte del hogar
  familiar.
- **Perfiles**: avatar, apodo, rol y cumpleaños de cada miembro de la casa.
- **Reto**: seguimiento personal de entrenamiento (sesiones, pesos, hábitos, medidas).
- **Ruleta y cuentas atrás**: para decidir quién hace una tarea y para fechas señaladas.
- Avisos push (Web Push estándar, y FCM si empaquetas tu propia app Android), copias de
  seguridad automáticas de la base de datos, y actualización de DNS dinámico en Cloudflare
  (opcional) si accedes desde fuera de casa con tu propio dominio.

## Primeros pasos

1. Clona este repositorio en tu servidor.
2. Descarga una vez las librerías externas (FullCalendar y pdf.js) para servirlas tú mismo, sin
   que el móvil las pida a ningún CDN:

   ```bash
   sh scripts/descargar-librerias.sh
   ```

3. Copia `env-ejemplo.txt` como `.env` en la misma carpeta y rellena lo que vayas a usar (todo es
   opcional salvo lo que necesites: ninguna variable es obligatoria para arrancar).
4. Arranca con Docker Compose:

   ```bash
   docker compose up -d --build
   ```

5. Abre `http://<ip-de-tu-servidor>:8080` desde el móvil o el navegador. La primera vez se crean
   unos perfiles de ejemplo ("Persona 1", "Persona 2", "Hogar"; cámbialos con la variable
   `HOGAR_PERFILES` o renómbralos luego desde la app) sin PIN: cada quien lo configura al entrar
   la primera vez.
5. Para usarla fuera de casa, ponla detrás de tu propio proxy/VPN o dominio con HTTPS (por
   ejemplo, Cloudflare Tunnel, Tailscale o un reverse proxy con Let's Encrypt). La app no incluye
   nada de eso por sí misma.

## Configuración (variables de entorno)

Todas son opcionales. Ver `env-ejemplo.txt` para la lista completa con ejemplos:

| Variable | Para qué |
|---|---|
| `HOGAR_DB` | Ruta del archivo SQLite (por defecto, la que marca `docker-compose.yml`). |
| `HOGAR_PERFILES` | Nombres de los perfiles de la casa, separados por comas. |
| `HOGAR_CLAVE_CHAT` | Clave para cifrar en reposo fotos de perfil y tickets de gasto. |
| `HOGAR_LAT` / `HOGAR_LON` | Ubicación para el tiempo del saludo de "Hoy" (por defecto, Madrid). |
| `HOGAR_MENU_COLE_URL` | Plantilla de URL para descargar el menú del comedor automáticamente. |
| `CF_API_TOKEN` / `CF_ZONE_ID` / `CF_DDNS_NOMBRES` | DNS dinámico en Cloudflare (opcional). |

## Desarrollo

- Backend: Go, un solo módulo (`go build .`), SQLite vía `modernc.org/sqlite` (sin CGO).
- Frontend: JavaScript sin build step, en `web/js/`; HTML en `web/index.html`; estilos con
  Tailwind precompilado en `web/css/`.
- No hay base de datos de ejemplo ni datos de prueba incluidos: la app crea su propio esquema al
  arrancar por primera vez.

## Apoyar el proyecto

Es gratis y de código abierto, pero si te resulta útil y quieres invitarme a un café:
[ko-fi.com/yeraylz](https://ko-fi.com/yeraylz) ☕

## Licencia

MIT. Ver [LICENSE](LICENSE).
