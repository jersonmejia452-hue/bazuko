import { TILE_SIZE } from '../../src/utils/constants.js';
import { ZONA_NOMBRES, zonaDe } from '../../src/ui/ZonaAviso.js';
export { zonaDe, ZONA_NOMBRES };

export const ESCENAS_ENTRADA = Object.freeze({
  creador: { tipo: 'entrada', titulo: 'Creador de personaje' },
  nota: { tipo: 'entrada', titulo: 'Nota del desarrollador' }
});

export function catalogoEscenas() {
  const catalogo = { ...ESCENAS_ENTRADA };
  for (const [id, titulo] of Object.entries(ZONA_NOMBRES)) {
    catalogo[id] = { tipo: 'zona', titulo };
  }
  return catalogo;
}

export function nombresEscenas() {
  return Object.keys(catalogoEscenas());
}

export function normalizarNombre(nombre) {
  return String(nombre ?? '').trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

export function resolverEscena(nombre, catalogo = catalogoEscenas()) {
  const pedido = normalizarNombre(nombre);
  if (!pedido) {
    throw new Error(`Falta --escena. Escenas: ${listarEscenas(catalogo)}`);
  }
  for (const [id, escena] of Object.entries(catalogo)) {
    if (normalizarNombre(id) === pedido || normalizarNombre(escena.titulo) === pedido) {
      return { id, ...escena };
    }
  }
  throw new Error(`Escena desconocida: ${nombre}. Escenas: ${listarEscenas(catalogo)}`);
}

export function listarEscenas(catalogo = catalogoEscenas()) {
  return Object.entries(catalogo).map(([id, escena]) => `${id} (${escena.titulo})`).join(', ');
}

export function puntoEnZona(district, zona, { paso = 4 } = {}) {
  const ancho = (district.width ?? 0) * TILE_SIZE;
  const alto = (district.height ?? 0) * TILE_SIZE;
  let candidato = null;
  for (let z = 0; z <= alto; z += paso) {
    for (let x = 0; x <= ancho; x += paso) {
      if (zonaDe(district, x, z) !== zona) continue;
      const punto = { x, z };
      if (district.isWalkableAt?.(x, z)) return punto;
      candidato ??= punto;
    }
  }
  return candidato;
}
