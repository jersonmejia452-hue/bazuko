// src/ui/needsMeta.js
// Nombre, icono (lucide, ver icons.js) y color de cada necesidad; el HUD y la pestaña Estado usan los mismos.

export const NEED_META = [
  { id: 'hambre', glyph: 'food', label: 'Hambre', color: '#efca52' },
  { id: 'sed', glyph: 'droplet', label: 'Sed', color: '#82b8dc' },
  { id: 'energia', glyph: 'zap', label: 'Energía', color: '#8fc3cf' },
  { id: 'salud', glyph: 'heart', label: 'Salud', color: '#97c887' },
  { id: 'higiene', glyph: 'bath', label: 'Higiene', color: '#75bfa8' },
  { id: 'animo', glyph: 'smile', label: 'Ánimo', color: '#cc9cae' },
  { id: 'vicio', glyph: 'cigarette', label: 'Vicio', color: '#c5ad8b' },
];

/** Bajo este valor la necesidad se resalta; bajo el crítico, parpadea. */
export const NEED_LOW = 30;
export const NEED_CRITICAL = 15;

export function needLevel(value) {
  return value < NEED_CRITICAL ? 'critical' : value < NEED_LOW ? 'low' : 'ok';
}
