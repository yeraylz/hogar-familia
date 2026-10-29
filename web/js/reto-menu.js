'use strict';

// ---------------- RETO: menú con cantidades y proteína ----------------
// Cada ingrediente: n = nombre, p = gramos de proteína por 100 g (o por unidad
// si u = 'ud'), g = grupo de intercambio, ref = medida casera (cantidad que
// equivale a 1 unidad de esa medida). Las raciones son orientativas: salvo
// carne y pescado (150–200 g en crudo), el plan no fija cantidades, así que son
// valores típicos que puedes ajustar.
const RETO_ING = {
  pollo: { n: 'Pollo (crudo)', p: 22, k: 110, g: 'prot', rac: 175 },
  pavo: { n: 'Pechuga de pavo (cruda)', p: 22, k: 105, g: 'prot', rac: 175 },
  ternera: { n: 'Ternera magra (cruda)', p: 21, k: 125, g: 'prot', rac: 175 },
  ternera_picada: { n: 'Ternera picada (cruda)', p: 20, k: 160, g: 'prot', rac: 175 },
  cerdo: { n: 'Cerdo magro (crudo)', p: 21, k: 140, g: 'prot', rac: 175 },
  legumbre: { n: 'Legumbre cocida (bote escurrido)', p: 7.5, k: 120, g: 'prot', rac: 240 },
  merluza: { n: 'Merluza (cruda)', p: 17, k: 80, g: 'prot', rac: 200 },
  salmon: { n: 'Salmón (crudo)', p: 20, k: 200, g: 'prot', rac: 180 },
  pescado: { n: 'Pescado blanco (crudo)', p: 18, k: 85, g: 'prot', rac: 200 },
  sardinas: { n: 'Pescado azul (sardina, caballa)', p: 20, k: 180, g: 'prot', rac: 180 },
  marisco: { n: 'Marisco', p: 18, k: 85, g: 'prot', rac: 200 },
  huevo: { n: 'Huevos', p: 6.5, k: 75, g: 'prot', rac: 3, u: 'ud', ref: null },
  atun: { n: 'Atún en lata (escurrido)', p: 25, k: 110, g: 'prot', rac: 160, ref: { g: 80, t: 'lata' } },
  jamon: { n: 'Jamón serrano', p: 30, k: 240 },
  pavo_lonchas: { n: 'Lonchas de pavo', p: 17, k: 100 },
  yogur_griego: { n: 'Yogur griego', p: 9, k: 100, g: 'prot', rac: 250, ref: { g: 125, t: 'yogur' } },
  queso_fresco: { n: 'Queso fresco batido / skyr', p: 10, k: 55, g: 'prot', rac: 250 },
  leche: { n: 'Leche (ml)', p: 3.4, k: 47, u: 'ml' },
  arroz: { n: 'Arroz (crudo)', p: 7, k: 350, g: 'hid', rac: 80 },
  pasta: { n: 'Pasta integral (cruda)', p: 12, k: 350, g: 'hid', rac: 90 },
  quinoa: { n: 'Quinoa (cruda)', p: 14, k: 360, g: 'hid', rac: 80 },
  avena: { n: 'Avena', p: 13, k: 375, g: 'hid', rac: 60 },
  polvo: { n: 'Proteína en polvo (batido)', p: 80, k: 380, ref: { g: 30, t: 'cazo' } },
  pan: { n: 'Pan integral', p: 9, k: 250, g: 'hid', rac: 60, ref: { g: 30, t: 'rebanada' } },
  lentejas: { n: 'Lentejas (crudas)', p: 24, k: 340 },
  garbanzos: { n: 'Garbanzos cocidos', p: 8, k: 130 },
  patata: { n: 'Patata', p: 2, k: 77, g: 'hid', rac: 250 },
  boniato: { n: 'Boniato', p: 1.6, k: 86, g: 'hid', rac: 250 },
  nueces: { n: 'Nueces', p: 15, k: 650, ref: { g: 30, t: 'puñado' } },
  almendras: { n: 'Almendras', p: 21, k: 600, ref: { g: 30, t: 'puñado' } },
  cacahuete: { n: 'Crema de cacahuete', p: 25, k: 600 },
  aguacate: { n: 'Aguacate', p: 2, k: 160 },
  platano: { n: 'Plátano', p: 1.1, k: 90, ref: { g: 120, t: 'plátano' } },
  kiwi: { n: 'Kiwi', p: 1, k: 60, ref: { g: 75, t: 'kiwi' } },
  manzana: { n: 'Manzana', p: 0.3, k: 52, ref: { g: 150, t: 'manzana' } },
  naranja: { n: 'Naranja', p: 0.9, k: 45, ref: { g: 150, t: 'naranja' } },
  fruta: { n: 'Fruta', p: 0.8, k: 50 },
  frutos_rojos: { n: 'Frutos rojos', p: 1, k: 45 },
  verdura: { n: 'Verdura', p: 2.3, k: 30 },
  ensalada: { n: 'Ensalada', p: 1, k: 20 },
  espinacas: { n: 'Espinacas', p: 2.9, k: 25 },
  brocoli: { n: 'Brócoli', p: 2.8, k: 35 },
  judias: { n: 'Judías verdes', p: 2, k: 30 },
  tomate: { n: 'Tomate', p: 0.9, k: 20 },
  aceite: { n: 'Aceite de oliva', p: 0, k: 900, ref: { g: 10, t: 'cucharada' } },
  miel: { n: 'Miel', p: 0.3, k: 300 }
};

// Grupos de intercambio (g), ración orientativa (rac) y medidas caseras (med).
// med = [gramos o ml por medida, singular, plural, modo]; modo: 'q' cuartos (tazas), 'h' mitades
// (piezas), 'c' enteros (cucharadas). coc = veces que pesa más una vez cocinado.
// alt = alimentos con los que se puede cambiar cuando no hay un grupo claro.
const RETO_EXTRA = {
  pollo: { med: [[180, 'pechuga mediana', 'pechugas medianas', 'h'], [100, 'filete fino', 'filetes finos', 'h']], coc: 0.75 },
  pavo: { med: [[100, 'filete fino', 'filetes finos', 'h']], coc: 0.75 },
  ternera: { med: [[150, 'filete', 'filetes', 'h']], coc: 0.75 },
  ternera_picada: { med: [[120, 'hamburguesa', 'hamburguesas', 'h']], coc: 0.75 },
  cerdo: { med: [[120, 'filete de lomo', 'filetes de lomo', 'h']], coc: 0.75 },
  legumbre: { med: [[240, 'bote (escurrido)', 'botes (escurridos)', 'h'], [165, 'taza', 'tazas', 'q']] },
  merluza: { med: [[180, 'lomo', 'lomos', 'h']], coc: 0.85 },
  salmon: { med: [[170, 'lomo', 'lomos', 'h']], coc: 0.85 },
  pescado: { med: [[180, 'filete', 'filetes', 'h']], coc: 0.85 },
  sardinas: { med: [[40, 'sardina', 'sardinas', 'h']], coc: 0.85 },
  marisco: { med: [[240, 'taza de gambas o mejillones', 'tazas de gambas o mejillones', 'q']] },
  huevo: { med: [] },
  atun: { med: [[80, 'lata (escurrida)', 'latas (escurridas)', 'h']] },
  jamon: { g: 'prot', rac: 50, med: [[15, 'loncha', 'lonchas', 'h']] },
  pavo_lonchas: { g: 'prot', rac: 100, med: [[15, 'loncha', 'lonchas', 'h']] },
  yogur_griego: { med: [[125, 'yogur normal', 'yogures normales', 'h'], [250, 'yogur grande', 'yogures grandes', 'h']] },
  queso_fresco: { med: [[250, 'tarrina', 'tarrinas', 'h'], [25, 'cucharada colmada', 'cucharadas colmadas', 'c']] },
  polvo: { g: 'prot', rac: 30, med: [[30, 'cazo', 'cazos', 'h']] },
  leche: { alt: ['leche', 'yogur_griego'], med: [[240, 'taza', 'tazas', 'q'], [200, 'vaso', 'vasos', 'h']] },
  arroz: { med: [[185, 'taza', 'tazas', 'q'], [15, 'cucharada sopera', 'cucharadas soperas', 'c']], coc: 2.5 },
  pasta: { med: [[100, 'taza de macarrones', 'tazas de macarrones', 'q']], coc: 2.3 },
  quinoa: { med: [[170, 'taza', 'tazas', 'q'], [12, 'cucharada sopera', 'cucharadas soperas', 'c']], coc: 3 },
  avena: { med: [[90, 'taza de copos', 'tazas de copos', 'q'], [7, 'cucharada sopera', 'cucharadas soperas', 'c']] },
  pan: { med: [[30, 'rebanada', 'rebanadas', 'h']] },
  lentejas: { g: 'prot', rac: 90, med: [[190, 'taza', 'tazas', 'q']], coc: 2.5 },
  garbanzos: { g: 'prot', rac: 200, med: [[165, 'taza', 'tazas', 'q'], [240, 'bote (escurrido)', 'botes (escurridos)', 'h']] },
  patata: { med: [[170, 'patata mediana', 'patatas medianas', 'h']] },
  boniato: { med: [[200, 'boniato mediano', 'boniatos medianos', 'h']] },
  nueces: { g: 'grasa', rac: 30, med: [[30, 'puñado (8–10 nueces)', 'puñados (8–10 nueces cada uno)', 'h'], [7, 'nuez', 'nueces', 'c']] },
  almendras: { g: 'grasa', rac: 30, med: [[30, 'puñado (≈25 almendras)', 'puñados (≈25 almendras cada uno)', 'h']] },
  cacahuete: { g: 'grasa', rac: 20, med: [[15, 'cucharada sopera', 'cucharadas soperas', 'c']] },
  aguacate: { g: 'grasa', rac: 70, med: [[150, 'aguacate mediano (con piel)', 'aguacates medianos (con piel)', 'h']] },
  aceite: { g: 'grasa', rac: 15, med: [[10, 'cucharada sopera', 'cucharadas soperas', 'c']] },
  platano: { g: 'fruta', rac: 120, med: [[120, 'plátano mediano', 'plátanos medianos', 'h']] },
  kiwi: { g: 'fruta', rac: 150, med: [[75, 'kiwi', 'kiwis', 'h']] },
  manzana: { g: 'fruta', rac: 150, med: [[150, 'manzana mediana', 'manzanas medianas', 'h']] },
  naranja: { g: 'fruta', rac: 150, med: [[150, 'naranja mediana', 'naranjas medianas', 'h']] },
  fruta: { g: 'fruta', rac: 150, med: [[150, 'pieza mediana', 'piezas medianas', 'h']] },
  frutos_rojos: { g: 'fruta', rac: 80, med: [[150, 'taza', 'tazas', 'q']] },
  verdura: { g: 'verd', rac: 150, med: [[200, 'plato hondo', 'platos hondos', 'h']] },
  ensalada: { g: 'verd', rac: 150, med: [[150, 'plato llano', 'platos llanos', 'h']] },
  espinacas: { g: 'verd', rac: 100, med: [[30, 'puñado', 'puñados', 'h']] },
  brocoli: { g: 'verd', rac: 150, med: [[90, 'taza de ramilletes', 'tazas de ramilletes', 'q']] },
  judias: { g: 'verd', rac: 150, med: [[100, 'taza', 'tazas', 'q']] },
  tomate: { g: 'verd', rac: 100, med: [[120, 'tomate mediano', 'tomates medianos', 'h']] },
  miel: { alt: ['miel', 'platano'], med: [[20, 'cucharada sopera', 'cucharadas soperas', 'c'], [7, 'cucharadita', 'cucharaditas', 'c']] }
};
Object.keys(RETO_EXTRA).forEach(k => Object.assign(RETO_ING[k], RETO_EXTRA[k]));

// Más alimentos habituales (por 100 g salvo que se indique). Se añaden a su grupo y aparecen solos en las listas.
const RETO_MAS = {
  // Proteínas
  pollo_cocido: { n: 'Pechuga de pollo cocida / asada', p: 31, k: 150, g: 'prot', rac: 130, med: [[100, 'filete mediano', 'filetes medianos', 'h']] },
  bacalao: { n: 'Bacalao (crudo)', p: 17, k: 80, g: 'prot', rac: 200 },
  dorada: { n: 'Dorada / lubina (cruda)', p: 19, k: 100, g: 'prot', rac: 200 },
  pulpo: { n: 'Pulpo / calamar', p: 15, k: 80, g: 'prot', rac: 200 },
  mejillones: { n: 'Mejillones / almejas (sin concha)', p: 12, k: 80, g: 'prot', rac: 250 },
  caballa_lata: { n: 'Sardinas / caballa en lata (escurridas)', p: 22, k: 190, g: 'prot', rac: 120, med: [[85, 'lata (escurrida)', 'latas (escurridas)', 'h']] },
  claras: { n: 'Claras de huevo', p: 11, k: 50, g: 'prot', rac: 200, med: [[33, 'clara', 'claras', 'c']] },
  tofu: { n: 'Tofu firme', p: 14, k: 130, g: 'prot', rac: 200 },
  seitan: { n: 'Seitán', p: 25, k: 130, g: 'prot', rac: 150 },
  cottage: { n: 'Queso cottage / requesón', p: 11, k: 100, g: 'prot', rac: 250 },
  mozzarella: { n: 'Mozzarella / queso fresco', p: 18, k: 250, g: 'prot', rac: 125 },
  jamon_cocido: { n: 'Jamón cocido / fiambre de pollo', p: 18, k: 105, g: 'prot', rac: 100, med: [[15, 'loncha', 'lonchas', 'h']] },
  conejo: { n: 'Conejo / pavo muslo (crudo)', p: 21, k: 125, g: 'prot', rac: 175 },
  // Hidratos
  cuscus: { n: 'Cuscús (crudo)', p: 12, k: 360, g: 'hid', rac: 80 },
  arroz_integral: { n: 'Arroz integral (crudo)', p: 7.5, k: 350, g: 'hid', rac: 80, coc: 2.5 },
  pasta_blanca: { n: 'Pasta blanca (cruda)', p: 12, k: 355, g: 'hid', rac: 90, coc: 2.3 },
  pan_blanco: { n: 'Pan blanco / barra', p: 9, k: 265, g: 'hid', rac: 60, med: [[30, 'rebanada', 'rebanadas', 'h']] },
  pan_molde: { n: 'Pan de molde integral', p: 9, k: 250, g: 'hid', rac: 60, med: [[25, 'rebanada', 'rebanadas', 'h']] },
  wrap: { n: 'Tortilla de trigo (wrap)', p: 9, k: 310, g: 'hid', rac: 60, med: [[60, 'tortilla', 'tortillas', 'h']] },
  cereales: { n: 'Cereales / copos de maíz', p: 7, k: 375, g: 'hid', rac: 50, med: [[30, 'taza', 'tazas', 'q']] },
  tortitas: { n: 'Tortitas de arroz', p: 8, k: 385, g: 'hid', rac: 30, med: [[9, 'tortita', 'tortitas', 'c']] },
  galletas: { n: 'Galletas María', p: 7, k: 440, g: 'hid', rac: 40, med: [[6, 'galleta', 'galletas', 'c']] },
  maiz: { n: 'Maíz dulce (lata)', p: 3, k: 90, g: 'hid', rac: 150 },
  // Fruta
  pera: { n: 'Pera', p: 0.4, k: 57, g: 'fruta', rac: 150, med: [[150, 'pera mediana', 'peras medianas', 'h']] },
  fresas: { n: 'Fresas', p: 0.7, k: 32, g: 'fruta', rac: 200 },
  uvas: { n: 'Uvas', p: 0.7, k: 70, g: 'fruta', rac: 150 },
  mandarina: { n: 'Mandarina', p: 0.8, k: 45, g: 'fruta', rac: 100, med: [[80, 'mandarina', 'mandarinas', 'c']] },
  melocoton: { n: 'Melocotón / nectarina', p: 1, k: 40, g: 'fruta', rac: 150, med: [[150, 'pieza mediana', 'piezas medianas', 'h']] },
  pina: { n: 'Piña / mango', p: 0.6, k: 55, g: 'fruta', rac: 150 },
  sandia: { n: 'Sandía / melón', p: 0.7, k: 32, g: 'fruta', rac: 300 },
  datiles: { n: 'Dátiles', p: 2, k: 280, g: 'fruta', rac: 40, med: [[8, 'dátil', 'dátiles', 'c']] },
  // Grasas
  anacardos: { n: 'Anacardos', p: 18, k: 600, g: 'grasa', rac: 30, med: [[30, 'puñado', 'puñados', 'h']] },
  avellanas: { n: 'Avellanas', p: 15, k: 650, g: 'grasa', rac: 30, med: [[30, 'puñado', 'puñados', 'h']] },
  pistachos: { n: 'Pistachos', p: 20, k: 580, g: 'grasa', rac: 30, med: [[30, 'puñado', 'puñados', 'h']] },
  aceitunas: { n: 'Aceitunas', p: 1, k: 145, g: 'grasa', rac: 40 },
  // Verdura
  pimiento: { n: 'Pimiento', p: 1, k: 25, g: 'verd', rac: 100 },
  calabacin: { n: 'Calabacín / berenjena', p: 1.2, k: 20, g: 'verd', rac: 150 },
  zanahoria: { n: 'Zanahoria', p: 0.9, k: 40, g: 'verd', rac: 100 },
  champi: { n: 'Champiñones / setas', p: 3, k: 25, g: 'verd', rac: 150 },
  coliflor: { n: 'Coliflor / repollo', p: 2, k: 28, g: 'verd', rac: 150 },
  lechuga: { n: 'Lechuga / rúcula', p: 1.4, k: 15, g: 'verd', rac: 100 }
};
Object.keys(RETO_MAS).forEach(k => { if (!RETO_ING[k]) RETO_ING[k] = RETO_MAS[k]; });

// Con qué se puede cambiar cada alimento.
function retoOpcionesCambio(id) {
  const ing = RETO_ING[id];
  if (ing.alt) return ing.alt;
  if (!ing.g) return [id];
  return Object.keys(RETO_ING).filter(k => RETO_ING[k].g === ing.g);
}

// Cantidad del alimento nuevo que "cumple lo mismo" que la línea actual: misma proteína entre
// fuentes de proteína, mismas calorías entre hidratos, fruta o grasas, y una ración normal en verdura.
function retoCantidadEquivalente(actual, idNuevo) {
  const nuevo = RETO_ING[idNuevo];
  if (nuevo.g === 'verd' || actual.cant <= 0) return nuevo.rac || actual.def;
  const porProt = actual.ing.g === 'prot' && nuevo.g === 'prot';
  const valor = porProt ? actual.prot : actual.kcal;
  const por = porProt ? nuevo.p : nuevo.k;
  if (!por) return nuevo.rac || actual.def;
  let c = valor / (nuevo.u === 'ud' ? por : por / 100);
  if (porProt && nuevo.rac) c = Math.min(c, nuevo.rac * 1.3);
  if (nuevo.u === 'ud') return Math.max(1, Math.round(c));
  if (nuevo.u === 'ml') return Math.max(50, Math.round(c / 50) * 50);
  return c < 50 ? Math.max(5, Math.round(c / 5) * 5) : Math.round(c / 10) * 10;
}

// Medidas caseras de una línea, p. ej. ["½ taza", "5 cucharadas soperas"] y lo que pesa cocinado.
function retoMedidasCaseras(l) {
  const out = [];
  const frac = { 0.25: '¼', 0.5: '½', 0.75: '¾' };
  const fmt = n => {
    const e = Math.floor(n), f = n - e;
    const t = frac[f];
    if (!f) return String(e);
    return e ? `${e} ${t}` : t;
  };
  (l.ing.med || []).forEach(([g, sing, plur, modo]) => {
    let n = l.cant / g;
    if (modo === 'q') n = Math.round(n * 4) / 4;
    else if (modo === 'h') n = Math.round(n * 2) / 2;
    else n = Math.round(n);
    if (n < 0.25) return;
    out.push(`≈ ${fmt(n)} ${n <= 1 ? sing : plur}`);
  });
  if (l.ing.coc && !l.ing.u) {
    const g = Math.round(l.cant * l.ing.coc / 10) * 10;
    out.push(l.ing.coc < 1 ? `cocinado queda en ≈ ${g} g` : `cocinado pesa ≈ ${g} g`);
  }
  return out;
}

// dow (0 = domingo) → [desayuno, comida, merienda, cena] → [[ingrediente, cantidad por defecto]]
const RETO_MENU_ING = {
  1: [
    [['huevo', 3], ['pan', 80], ['aceite', 10], ['kiwi', 150], ['platano', 120]],
    [['pollo', 200], ['arroz', 100], ['ensalada', 150], ['aceite', 20]],
    [['yogur_griego', 250], ['platano', 120], ['nueces', 30]],
    [['merluza', 200], ['patata', 300], ['judias', 150], ['aceite', 20]]
  ],
  2: [
    [['avena', 90], ['leche', 250], ['yogur_griego', 125], ['platano', 120], ['frutos_rojos', 80], ['miel', 15]],
    [['lentejas', 100], ['huevo', 2], ['verdura', 150], ['aceite', 20], ['pan', 40]],
    [['pan', 60], ['pavo_lonchas', 100], ['aceite', 10], ['manzana', 150]],
    [['huevo', 3], ['atun', 80], ['ensalada', 150], ['pan', 60], ['aceite', 15], ['aguacate', 50]]
  ],
  3: [
    [['pan', 80], ['jamon', 40], ['tomate', 80], ['aceite', 10], ['yogur_griego', 125], ['fruta', 150]],
    [['ternera', 180], ['pasta', 120], ['verdura', 150], ['aceite', 20]],
    [['queso_fresco', 170], ['avena', 60], ['miel', 15], ['almendras', 20]],
    [['salmon', 170], ['boniato', 300], ['brocoli', 150], ['aceite', 15]]
  ],
  4: [
    [['huevo', 2], ['pan', 80], ['aceite', 10], ['naranja', 150], ['yogur_griego', 125], ['platano', 120]],
    [['garbanzos', 200], ['espinacas', 100], ['atun', 80], ['aceite', 20], ['arroz', 80]],
    [['yogur_griego', 200], ['almendras', 30], ['platano', 120]],
    [['pavo', 180], ['verdura', 200], ['pan', 70], ['aceite', 20], ['patata', 150]]
  ],
  5: [
    [['avena', 90], ['platano', 120], ['cacahuete', 30], ['leche', 250], ['miel', 10]],
    [['arroz', 100], ['pollo', 200], ['verdura', 150], ['aceite', 20]],
    [['pan', 90], ['atun', 80], ['aceite', 10], ['fruta', 150]],
    [['sardinas', 150], ['ensalada', 150], ['patata', 300], ['aceite', 15]]
  ],
  6: [
    [['avena', 80], ['huevo', 2], ['fruta', 150], ['leche', 250], ['aceite', 5]],
    [['pescado', 200], ['quinoa', 100], ['ensalada', 150], ['aceite', 20]],
    [['leche', 300], ['platano', 120], ['avena', 50], ['cacahuete', 25]],
    [['ternera_picada', 180], ['pan', 80], ['ensalada', 150], ['aceite', 15], ['patata', 150]]
  ],
  0: [
    [['pan', 90], ['aguacate', 80], ['huevo', 3], ['fruta', 150], ['aceite', 10]],
    [['arroz', 100], ['marisco', 200], ['ensalada', 150], ['aceite', 20]],
    [['yogur_griego', 200], ['fruta', 150], ['nueces', 30], ['miel', 15], ['platano', 120]],
    [['pollo', 180], ['verdura', 200], ['patata', 250], ['aceite', 20]]
  ]
};

function retoUnidad(ing) { return ing.u === 'ud' ? 'ud' : ing.u === 'ml' ? 'ml' : 'g'; }

// Devuelve las líneas de una comida con lo que has ajustado: cantidad,
// ingrediente (si lo cambiaste por otro del mismo grupo) y proteína.
function retoDetalleComida(dow, comida, porciones) {
  porciones = porciones || {};
  return RETO_MENU_ING[dow][comida].map(([id0, cant0], i) => {
    const ajuste = porciones[comida + '.' + i];
    const id = ajuste && ajuste.i && RETO_ING[ajuste.i] ? ajuste.i : id0;
    const cant = ajuste ? ajuste.c : cant0;
    const ing = RETO_ING[id];
    const f = ing.u === 'ud' ? cant : cant / 100;
    const prot = f * ing.p;
    const kcal = f * ing.k;
    return { i, id, ing, cant, def: cant0, prot, kcal, cambiado: !!ajuste };
  });
}

function retoProteinaComida(dow, comida, porciones) {
  return retoDetalleComida(dow, comida, porciones).reduce((a, l) => a + l.prot, 0);
}

// Línea corta con lo que toca comer: "Pollo 200 g (crudo) · Arroz 80 g (crudo) · Ensalada 150 g"
function retoLineaComida(dow, comida, porciones) {
  return retoDetalleComida(dow, comida, porciones).filter(l => l.cant > 0).map(l => {
    const crudo = /\((cruda|crudo|crudas|crudos)\)/.test(l.ing.n);
    let nombre = l.ing.n.replace(/\s*\([^)]*\)/, '');
    if (l.ing.u === 'ml') nombre = nombre.replace(/\s*\(ml\)/, '');
    const cant = String(Math.round(l.cant * 10) / 10).replace('.', ',');
    const u = retoUnidad(l.ing);
    return `${nombre} ${cant} ${u}${crudo ? ' (crudo)' : ''}`;
  }).join(' · ');
}

function retoKcalComida(dow, comida, porciones) {
  return retoDetalleComida(dow, comida, porciones).reduce((a, l) => a + l.kcal, 0);
}

// Guía de proteínas del plan (la misma tabla del documento).
const RETO_GUIA = [
  ['Pollo (pechuga o muslo)', '175 g', '38 g', 'Plancha, al horno, salteado con verdura'],
  ['Pavo', '175 g', '38 g', 'Filetes a la plancha, picada para boloñesa'],
  ['Ternera magra', '175 g', '38 g', 'Plancha, guiso, hamburguesa casera'],
  ['Cerdo magro (lomo, solomillo)', '175 g', '36 g', 'Plancha, al horno'],
  ['Pescado blanco (merluza, bacalao, lubina)', '200 g', '36 g', 'Al horno, plancha, en papillote'],
  ['Pescado azul (salmón, caballa, sardina, atún)', '180 g', '38 g', 'Plancha, horno, lata para ensaladas'],
  ['Huevos', '3 enteros', '19 g', 'Revueltos, tortilla, cocidos (añade claras para subir)'],
  ['Legumbre (lentejas, garbanzos, alubias)', '1 bote escurrido (240 g)', '18 g', 'Guiso, ensalada, con arroz'],
  ['Yogur griego', '1 grande (250 g)', '22 g', 'Con avena, frutos secos y fruta'],
  ['Queso fresco batido / skyr', '250 g', '25 g', 'Merienda o postre con fruta']
];

// MODO LIBRE: las comidas no traen alimentos puestos. Cada comida tiene "huecos" vacíos
// (proteína, hidrato, verdura, fruta, grasa, otra proteína) y eliges tú qué comer de cada uno.
// La cantidad al elegir es la ración de la guía (ing.rac).
Object.keys(RETO_MENU_ING).forEach(d => {
  RETO_MENU_ING[d] = RETO_MENU_ING[d].map(() => [['pollo', 0], ['arroz', 0], ['ensalada', 0], ['platano', 0], ['aceite', 0], ['huevo', 0]]);
});

// Líneas "principales" de una comida: la proteína y el hidrato. Son las que se cambian de un toque.
function retoLineaPrincipal(lineas, grupo) {
  const c = lineas.filter(l => l.ing.g === grupo);
  if (!c.length) return null;
  return grupo === 'prot' ? c.reduce((a, b) => (b.prot > a.prot ? b : a)) : c[0];
}
