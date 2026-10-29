'use strict';

// Tema de la app (claro / oscuro / automático). Se guarda en este móvil y, en automático,
// sigue el del sistema aunque cambie solo (ahorro de batería, hora programada…) sin recargar la app.

const PERS_CLAVE = 'hogar_tema';

function persLeer() {
  let v = {};
  try { v = JSON.parse(localStorage.getItem(PERS_CLAVE) || '{}') || {}; } catch (e) { v = {}; }
  return Object.assign({ tema: 'auto' }, v);
}

let pers = persLeer();

function persGuardar() {
  try { localStorage.setItem(PERS_CLAVE, JSON.stringify(pers)); } catch (e) { /* sin almacenamiento */ }
}

try {
  const mqOscuro = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)');
  if (mqOscuro && mqOscuro.addEventListener) {
    mqOscuro.addEventListener('change', () => { if (pers.tema === 'auto') persTemaAplicar(); });
  }
} catch (e) { /* sin matchMedia */ }

function persTemaAplicar() {
  const sis = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  const oscuro = pers.tema === 'oscuro' || (pers.tema === 'auto' && sis);
  try {
    if (pers.tema === 'auto') localStorage.removeItem('tema'); else localStorage.setItem('tema', pers.tema);
    document.cookie = 'tema=' + (pers.tema === 'auto' ? '' : pers.tema) + ';path=/;max-age=' + (pers.tema === 'auto' ? '0' : '31536000') + ';SameSite=Lax';
  } catch (e) { /* nada */ }
  document.documentElement.classList.toggle('dark', oscuro);
}

persTemaAplicar();
