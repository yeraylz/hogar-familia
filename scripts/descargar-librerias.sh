#!/bin/sh
# Descarga UNA vez las librerías externas para servirlas desde tu propio servidor
# (así el móvil no pide nada a jsDelivr ni a cdnjs). Ejecútalo en la carpeta del proyecto
# (donde está la carpeta web/) y vuelve a construir el contenedor.
set -e
cd "$(dirname "$0")/.."
mkdir -p web/vendor
curl -fL -o web/vendor/fullcalendar.min.js https://cdn.jsdelivr.net/npm/fullcalendar@6.1.10/index.global.min.js
curl -fL -o web/vendor/pdf.min.js https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js
curl -fL -o web/vendor/pdf.worker.min.js https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js
ls -la web/vendor
echo "Listo. Reconstruye: docker compose up -d --build"
