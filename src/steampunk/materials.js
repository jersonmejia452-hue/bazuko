// src/steampunk/materials.js
// Paleta maestra steampunk + fábricas de materiales estilo PS1.
// Todos los materiales usan flatShading para un look low-poly definido.

import * as THREE from 'three';

// ============================================================
// PALETA MAESTRA (colores base del vertical slice)
// ============================================================
export const PALETTE = {
  // Tonos base
  base:     0x292B2A,  // negro verdoso profundo
  brown:    0x625047,  // cuero / madera oscura
  rust:     0xA66F43,  // óxido / metal desgastado
  brass:    0xB7A17B,  // latón / metal claro
  patina:   0x65766A,  // pátina verde / verdín

  // Derivados (tonos calculados para variación)
  baseDark:  0x1a1c1b,
  baseLight: 0x3d403e,
  brownDark: 0x3d322c,
  brownLight:0x8a7164,
  rustDark:  0x6e4728,
  rustLight: 0xcb905c,
  brassDark: 0x8a7858,
  brassLight:0xd6c29a,
  patinaDark:0x445147,
  patinaLight:0x889989,

  // Acentos funcionales
  copper:   0xb87333,  // cobre (tubos)
  iron:     0x4a4a4a,  // hierro forjado
  steel:    0x6c6c6c,  // acero pulido
  leather:  0x5a3a2a,  // cuero sintético
  glass:    0x9bb8c4,  // cristal ahumado
  wood:     0x6e4a2e,  // madera
  ember:    0xff7a1a,  // brasas / vapor caliente
  steam:    0xc8d0d8   // vapor / humo
};

/** Convierte un número hex a string hex para cálculos */
function hexToRgb(hex) {
  return {
    r: (hex >> 16) & 255,
    g: (hex >> 8) & 255,
    b: hex & 255
  };
}

/** Mezcla dos colores hex con factor t (0..1) */
export function mixHex(hexA, hexB, t) {
  const a = hexToRgb(hexA);
  const b = hexToRgb(hexB);
  const r = Math.round(a.r + (b.r - a.r) * t);
  const g = Math.round(a.g + (b.g - a.g) * t);
  const bl = Math.round(a.b + (b.b - a.b) * t);
  return (r << 16) | (g << 8) | bl;
}

/** Variación de brillo (-1..1) sobre un color hex */
export function shadeHex(hex, amount) {
  const { r, g, b } = hexToRgb(hex);
  const f = (c) => Math.max(0, Math.min(255, Math.round(c + 255 * amount)));
  return (f(r) << 16) | (f(g) << 8) | f(b);
}

// ============================================================
// FÁBRICAS DE MATERIALES
// ============================================================

/** Cache de materiales para evitar duplicados */
const _cache = new Map();

function key(kind, params) {
  return kind + ':' + JSON.stringify(params);
}

/**
 * Material base steampunk con flat shading.
 * Soporta variación de vértices (vertexColors) para desgaste.
 */
export function makeMaterial(color, opts = {}) {
  const k = key('mat', { color, ...opts });
  if (_cache.has(k)) return _cache.get(k);

  const mat = new THREE.MeshLambertMaterial({
    color,
    flatShading: true,
    vertexColors: opts.vertexColors ?? false,
    transparent: opts.transparent ?? false,
    opacity: opts.opacity ?? 1,
    side: opts.side ?? THREE.FrontSide
  });
  _cache.set(k, mat);
  return mat;
}

/**
 * Material metálico (más reflectante, specular bajo).
 * Para acero, latón, cobre.
 */
export function makeMetalMaterial(color, opts = {}) {
  const k = key('metal', { color, ...opts });
  if (_cache.has(k)) return _cache.get(k);

  const mat = new THREE.MeshPhongMaterial({
    color,
    flatShading: true,
    shininess: opts.shininess ?? 20,
    specular: new THREE.Color(opts.specular ?? shadeHex(color, 0.2)),
    vertexColors: opts.vertexColors ?? false
  });
  _cache.set(k, mat);
  return mat;
}

/**
 * Material de cristal (transparente, para ventanas y gafas).
 */
export function makeGlassMaterial(color = PALETTE.glass) {
  const k = key('glass', { color });
  if (_cache.has(k)) return _cache.get(k);

  const mat = new THREE.MeshPhongMaterial({
    color,
    flatShading: true,
    transparent: true,
    opacity: 0.35,
    shininess: 80,
    specular: 0xffffff
  });
  _cache.set(k, mat);
  return mat;
}

/**
 * Material de vapor (transparente, additive).
 */
export function makeSteamMaterial() {
  const k = 'steam';
  if (_cache.has(k)) return _cache.get(k);

  const mat = new THREE.MeshBasicMaterial({
    color: PALETTE.steam,
    transparent: true,
    opacity: 0.25,
    depthWrite: false
  });
  _cache.set(k, mat);
  return mat;
}

/**
 * Aplica variación de color por vértice a una geometría.
 * Simula desgaste, óxido o suciedad irregular.
 * @param {THREE.BufferGeometry} geo
 * @param {number} baseColor - color base
 * @param {number} variationColor - color de variación (óxido/suciedad)
 * @param {number} intensity - 0..1, cuánta variación aplicar
 */
export function applyVertexWear(geo, baseColor, variationColor, intensity = 0.3) {
  const count = geo.attributes.position.count;
  const colors = new Float32Array(count * 3);
  const base = new THREE.Color(baseColor);
  const vary = new THREE.Color(variationColor);

  for (let i = 0; i < count; i++) {
    const t = Math.random() * intensity;
    const c = base.clone().lerp(vary, t);
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

/**
 * Crea un material que usa vertex colors (para wear procedural).
 */
export function makeWornMaterial(baseColor, variationColor) {
  const mat = new THREE.MeshLambertMaterial({
    vertexColors: true,
    flatShading: true
  });
  // Guardamos los colores base para referencia
  mat.userData = { baseColor, variationColor };
  return mat;
}
