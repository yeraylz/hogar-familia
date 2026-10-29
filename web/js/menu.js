'use strict';

// Personalizar el menú «Más»: cada persona decide qué secciones ve en su móvil.
// Se guarda en este dispositivo. Por defecto están ocultas Enlaces y Fotos.
const MENU_SECCIONES = [
  { k: 'documentos', nombre: '📄 Documentación' },
  { k: 'cole', nombre: '🎒 Cole' },
  { k: 'fotos', nombre: '📷 Fotos' },
  { k: 'reto', nombre: '💪 Reto' },
  { k: 'enlaces', nombre: '🔗 Enlaces' },
  { k: 'actividad', nombre: '🕑 Actividad' },
  { k: 'sistema', nombre: '🛠 Copias y red' }
];
const MENU_OCULTAS_DEFECTO = ['enlaces', 'fotos'];

function menuOcultas() {
  try {
    const v = localStorage.getItem('hogar_menu_ocultas');
    if (v !== null) { const a = JSON.parse(v); if (Array.isArray(a)) return a; }
  } catch (e) { /* sin almacenamiento */ }
  return MENU_OCULTAS_DEFECTO.slice();
}

function menuElemento(k) {
  if (k === 'fotos') { const c = document.getElementById('card-fotos'); return c ? c.parentElement : null; }
  return document.querySelector(`#modulo-mas > [onclick*="cambiarModulo('${k}')"]`);
}

function aplicarMenu() {
  const ocultas = menuOcultas();
  MENU_SECCIONES.forEach(s => {
    const el = menuElemento(s.k);
    if (el) el.classList.toggle('hidden', ocultas.includes(s.k));
  });
}

function menuCambiar(k, visible) {
  const set = new Set(menuOcultas());
  if (visible) set.delete(k); else set.add(k);
  try { localStorage.setItem('hogar_menu_ocultas', JSON.stringify([...set])); } catch (e) { /* ignorar */ }
  aplicarMenu();
}

function menuAlternarPanel() {
  const p = document.getElementById('menu-panel');
  if (p) p.classList.toggle('hidden');
}

function iniciarMenuPersonal() {
  const mas = document.getElementById('modulo-mas');
  if (!mas || document.getElementById('menu-personalizar')) return;
  const ocultas = menuOcultas();
  const cont = document.createElement('div');
  cont.id = 'menu-personalizar';
  cont.innerHTML = `
    <button type="button" onclick="menuAlternarPanel()" class="w-full text-center text-xs font-semibold text-slate-400 hover:text-slate-600 py-2">⚙️ Personalizar menú</button>
    <div id="menu-panel" class="hidden bg-white rounded-2xl border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
      <p class="px-4 py-2.5 text-xs text-slate-400">Elige qué secciones quieres ver en este dispositivo.</p>
      ${MENU_SECCIONES.map(s => `<label class="flex items-center justify-between px-4 py-3 text-sm text-slate-700"><span>${s.nombre}</span>
        <input type="checkbox" ${ocultas.includes(s.k) ? '' : 'checked'} onchange="menuCambiar('${s.k}', this.checked)" class="w-5 h-5 accent-indigo-600"></label>`).join('')}
    </div>`;
  mas.appendChild(cont);
}

iniciarMenuPersonal();
aplicarMenu();
