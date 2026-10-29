'use strict';

/* ============================================================
   Visor de archivos dentro de la app (PDF e imágenes).
   En el iPhone, abrir un PDF con un enlace saca de la app y no hay forma de
   volver atrás. Aquí se abre encima de la app con un botón ✕ para cerrar.
   Los PDF se dibujan con pdf.js (se carga de este servidor, o de internet si falta la copia local).
   ============================================================ */

const PDFJS_VERSION = '3.11.174';
// Solo la copia local (scripts/descargar-librerias.sh); no se pide nada a terceros.
const PDFJS_FUENTES = [
  ['/vendor/pdf.min.js', '/vendor/pdf.worker.min.js']
];

let pdfjsPromesa = null;
function cargarScriptPdf(url) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = url;
    s.onload = () => resolve();
    s.onerror = () => { s.remove(); reject(new Error('no disponible')); };
    document.head.appendChild(s);
  });
}
function cargarPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib);
  if (!pdfjsPromesa) {
    pdfjsPromesa = (async () => {
      for (const [js, worker] of PDFJS_FUENTES) {
        try {
          await cargarScriptPdf(js);
          if (!window.pdfjsLib) continue;
          window.pdfjsLib.GlobalWorkerOptions.workerSrc = worker;
          return window.pdfjsLib;
        } catch (e) { /* se prueba la siguiente fuente */ }
      }
      pdfjsPromesa = null;
      throw new Error('No se pudo cargar el visor de PDF');
    })();
  }
  return pdfjsPromesa;
}

const Visor = {
  el: null,
  zoom: 1,
  blob: null,
  nombre: '',
  pdf: null,
  token: 0,

  crear() {
    if (this.el) return;
    const el = document.createElement('div');
    el.id = 'visor-archivo';
    el.className = 'hidden fixed inset-0 z-[80] flex flex-col bg-slate-900';
    el.innerHTML = `
      <div class="flex items-center gap-2 px-3 py-2 bg-slate-900 text-white" style="padding-top:max(0.5rem, env(safe-area-inset-top))">
        <button type="button" id="visor-cerrar" aria-label="Cerrar" class="w-10 h-10 shrink-0 rounded-full bg-white/15 text-xl font-bold">✕</button>
        <p id="visor-titulo" class="flex-grow min-w-0 truncate text-sm font-semibold"></p>
        <button type="button" id="visor-menos" aria-label="Alejar" class="w-10 h-10 shrink-0 rounded-full bg-white/15 text-xl font-bold">−</button>
        <button type="button" id="visor-mas" aria-label="Acercar" class="w-10 h-10 shrink-0 rounded-full bg-white/15 text-xl font-bold">+</button>
        <button type="button" id="visor-compartir" aria-label="Compartir o guardar" class="w-10 h-10 shrink-0 rounded-full bg-white/15 text-lg">⬆️</button>
      </div>
      <div id="visor-cuerpo" class="flex-grow overflow-auto bg-slate-700" style="-webkit-overflow-scrolling:touch; padding-bottom:env(safe-area-inset-bottom)"></div>`;
    document.body.appendChild(el);
    this.el = el;
    el.querySelector('#visor-cerrar').onclick = () => this.cerrar();
    el.querySelector('#visor-menos').onclick = () => this.cambiarZoom(-0.25);
    el.querySelector('#visor-mas').onclick = () => this.cambiarZoom(0.25);
    el.querySelector('#visor-compartir').onclick = () => this.compartir();
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !el.classList.contains('hidden')) this.cerrar(); });
  },

  cerrar() {
    if (!this.el) return;
    this.token++;
    this.el.classList.add('hidden');
    this.el.querySelector('#visor-cuerpo').innerHTML = '';
    this.pdf = null;
    this.blob = null;
  },

  cambiarZoom(delta) {
    this.zoom = Math.min(3, Math.max(0.5, this.zoom + delta));
    this.dibujar();
  },

  async compartir() {
    if (!this.blob) return;
    const archivo = new File([this.blob], this.nombre || 'archivo', { type: this.blob.type });
    try {
      if (navigator.canShare && navigator.canShare({ files: [archivo] })) {
        await navigator.share({ files: [archivo], title: this.nombre });
        return;
      }
    } catch (e) {
      if (e && e.name === 'AbortError') return; // el usuario cerró el menú de compartir
    }
    // App de Android: se guarda en Descargas (el WebView no admite descargas de «blob:»)
    if (window.MjNative && typeof mjGuardarNativo === 'function' && await mjGuardarNativo(this.blob, this.nombre || 'archivo')) return;
    // Sin "compartir": descarga normal
    const url = URL.createObjectURL(this.blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = this.nombre || 'archivo';
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 30000);
  },

  async abrir(url, titulo) {
    this.crear();
    const miToken = ++this.token;
    this.zoom = 1;
    this.nombre = titulo || '';
    this.el.querySelector('#visor-titulo').textContent = titulo || '';
    const cuerpo = this.el.querySelector('#visor-cuerpo');
    cuerpo.innerHTML = '<p class="text-center text-slate-300 text-sm py-10">Cargando…</p>';
    this.el.classList.remove('hidden');

    try {
      const res = await fetch(url, { credentials: 'same-origin' });
      if (res.status === 401) {
        this.cerrar();
        if (typeof mostrarPantallaLogin === 'function') mostrarPantallaLogin();
        return;
      }
      if (!res.ok) throw new Error('No se pudo abrir el archivo');
      const blob = await res.blob();
      if (miToken !== this.token) return; // se cerró mientras cargaba
      this.blob = blob;

      if ((blob.type || '').startsWith('image/')) {
        this.pdf = null;
        this.modo = 'imagen';
      } else {
        const pdfjs = await cargarPdfJs();
        this.pdf = await pdfjs.getDocument({ data: await blob.arrayBuffer() }).promise;
        this.modo = 'pdf';
      }
      if (miToken !== this.token) return;
      await this.dibujar();
    } catch (err) {
      if (miToken !== this.token) return;
      cuerpo.innerHTML = `<div class="text-center text-slate-200 text-sm py-10 px-6 space-y-3">
        <p>${escapeHTML(err.message || 'No se pudo abrir el archivo')}</p>
        <p class="text-slate-400 text-xs">Hace falta conexión la primera vez. Pulsa ⬆️ para guardarlo o compartirlo.</p></div>`;
    }
  },

  async dibujar() {
    if (!this.el || !this.blob) return;
    const miToken = this.token;
    const cuerpo = this.el.querySelector('#visor-cuerpo');
    cuerpo.innerHTML = '';
    const ancho = Math.max(280, cuerpo.clientWidth) * this.zoom;

    if (this.modo === 'imagen') {
      const img = document.createElement('img');
      img.src = URL.createObjectURL(this.blob);
      img.style.width = `${ancho}px`;
      img.style.maxWidth = 'none';
      img.className = 'block mx-auto';
      cuerpo.appendChild(img);
      return;
    }

    const contenedor = document.createElement('div');
    contenedor.style.width = `${ancho}px`;
    contenedor.className = 'mx-auto';
    cuerpo.appendChild(contenedor);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    for (let n = 1; n <= this.pdf.numPages; n++) {
      if (miToken !== this.token || !this.pdf) return;
      const pagina = await this.pdf.getPage(n);
      const base = pagina.getViewport({ scale: 1 });
      const escala = ancho / base.width;
      const vp = pagina.getViewport({ scale: escala * dpr });
      const canvas = document.createElement('canvas');
      canvas.width = Math.floor(vp.width);
      canvas.height = Math.floor(vp.height);
      canvas.style.width = `${ancho}px`;
      canvas.style.height = `${Math.floor(vp.height / dpr)}px`;
      canvas.className = 'block bg-white mb-2';
      contenedor.appendChild(canvas);
      await pagina.render({ canvasContext: canvas.getContext('2d'), viewport: vp }).promise;
    }
  }
};

// Todo enlace marcado con data-visor abre el archivo dentro de la app.
document.addEventListener('click', (e) => {
  const a = e.target.closest('a[data-visor]');
  if (!a) return;
  e.preventDefault();
  Visor.abrir(a.getAttribute('href'), a.dataset.visor);
});
