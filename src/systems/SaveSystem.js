// Guardado de la partida en el almacenamiento local del navegador.
//
// Cada guardado lleva versión, fecha y una suma de verificación. Antes de
// escribir se conserva el último guardado válido como respaldo, y al cargar se
// valida, migra y sanea el contenido: si el principal está dañado se recupera
// el respaldo y la copia dañada se aparta en lugar de sobrescribirla.

export const SAVE_KEY = 'habitante-de-calle-save-v1';
export const BACKUP_KEY = `${SAVE_KEY}-respaldo`;
export const CORRUPT_KEY = `${SAVE_KEY}-danado`;

// v1: sin campo `v`, dinero en "dólares".
// v2: dinero en pesos colombianos + necesidad de vicio.
// v3: suma de verificación, fecha de guardado y respaldo.
export const SAVE_VERSION = 3;

/** Intervalo del autoguardado durante el juego activo, en segundos reales. */
export const AUTOSAVE_INTERVAL = 120;

// Cuántos pesos vale un "dólar" de las partidas v1
const V1_TO_COP = 250;

const NEEDS = ['hambre', 'sed', 'energia', 'salud', 'higiene', 'animo', 'saludMental', 'vicio'];

/** Migraciones en orden: cada una lleva la partida de la versión `from` a la siguiente. */
const MIGRATIONS = [
  { from: 1, run(data) {
    if (data.stats && Number.isFinite(data.stats.dinero)) {
      data.stats.dinero = Math.round(data.stats.dinero * V1_TO_COP);
    }
  } },
  { from: 2, run() { /* solo cambia el formato del sobre */ } }
];

/** FNV-1a de 32 bits: barato y suficiente para detectar escrituras cortadas o editadas. */
export function checksum(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
const finite = value => typeof value === 'number' && Number.isFinite(value);

/** Lleva cualquier versión anterior a la actual. Devuelve un objeto nuevo. */
export function migrateSave(input) {
  const data = structuredClone(input);
  let version = finite(data.v) ? data.v : 1;
  for (const step of MIGRATIONS) {
    if (version === step.from) {
      step.run(data);
      version = step.from + 1;
    }
  }
  data.v = Math.max(version, SAVE_VERSION);
  return data;
}

/**
 * Corrige valores imposibles en lugar de descartar toda la partida:
 * necesidades fuera de 0–100, dinero negativo, posiciones con NaN o
 * secciones con un tipo inesperado vuelven a un valor seguro.
 */
export function sanitizeSave(data) {
  if (!isObject(data)) return null;
  const out = { ...data };

  const stats = isObject(out.stats) ? { ...out.stats } : {};
  for (const key of NEEDS) {
    if (key in stats) {
      if (finite(stats[key])) stats[key] = Math.min(100, Math.max(0, stats[key]));
      else delete stats[key];
    }
  }
  if ('dinero' in stats) {
    if (finite(stats.dinero)) stats.dinero = Math.max(0, Math.round(stats.dinero));
    else delete stats.dinero;
  }
  for (const key of ['xp', 'level']) {
    if (key in stats && !(finite(stats[key]) && stats[key] >= 0)) delete stats[key];
  }
  out.stats = stats;

  for (const key of ['clock', 'inventory', 'talents', 'diseases', 'built']) {
    out[key] = isObject(out[key]) ? out[key] : {};
  }
  // Clock.deserialize asigna ambos campos sin comprobar: siempre deben ser números válidos.
  const { day, hour } = out.clock;
  out.clock = {
    ...out.clock,
    day: finite(day) && day >= 1 ? Math.floor(day) : 1,
    hour: finite(hour) ? ((hour % 24) + 24) % 24 : 6
  };
  if (out.inventory.items !== undefined && !Array.isArray(out.inventory.items)) delete out.inventory.items;

  const pos = out.player?.pos;
  if (!(Array.isArray(pos) && pos.length === 3 && pos.every(finite))) delete out.player;

  for (const key of ['look', 'radio', 'dog', 'cart', 'gps']) {
    if (key in out && out[key] !== null && !isObject(out[key])) delete out[key];
  }
  out.costal = !!out.costal;
  return out;
}

/** Interpreta un texto guardado. Devuelve la partida lista para usar o lanza un error. */
export function parseSave(raw) {
  const envelope = JSON.parse(raw);
  if (!isObject(envelope)) throw new Error('El guardado no es un objeto');

  let data;
  if ('checksum' in envelope && 'data' in envelope) {
    const body = JSON.stringify(envelope.data);
    if (checksum(body) !== envelope.checksum) throw new Error('La suma de verificación no coincide');
    data = envelope.data;
  } else {
    data = envelope; // v1 y v2 guardaban la partida sin sobre
  }
  if (!isObject(data)) throw new Error('El guardado no contiene una partida');

  const result = sanitizeSave(migrateSave(data));
  if (!result) throw new Error('El guardado no contiene una partida');
  return result;
}

function defaultStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

/**
 * Guardado local tolerante a fallos: nunca lanza excepciones al juego.
 * `storage` puede ser cualquier objeto con getItem/setItem/removeItem.
 */
export class SaveSystem {
  constructor(storage = defaultStorage(), { now = () => Date.now() } = {}) {
    this.storage = storage;
    this.now = now;
    this.lastError = null;
    /** true si la última carga tuvo que usar la copia de respaldo. */
    this.restoredFromBackup = false;
  }

  _read(key) {
    try { return this.storage?.getItem(key) ?? null; } catch { return null; }
  }

  _write(key, value) {
    this.storage.setItem(key, value);
  }

  /** Guarda la partida. Devuelve `true` si quedó escrita y verificada. */
  save(state) {
    try {
      if (!this.storage) throw new Error('Almacenamiento no disponible');
      const data = { ...state, v: SAVE_VERSION, savedAt: this.now() };
      const body = JSON.stringify(data);
      const raw = JSON.stringify({ v: SAVE_VERSION, checksum: checksum(body), data: JSON.parse(body) });

      // El guardado anterior pasa a respaldo solo si se puede leer bien.
      const previous = this._read(SAVE_KEY);
      if (previous && previous !== raw && this._isValid(previous)) {
        try { this._write(BACKUP_KEY, previous); } catch { /* sin espacio para el respaldo */ }
      }

      this._write(SAVE_KEY, raw);
      if (this._read(SAVE_KEY) !== raw) throw new Error('La escritura no se pudo verificar');
      this.lastError = null;
      return true;
    } catch (error) {
      // Cuota llena, almacenamiento bloqueado o estado no serializable.
      this.lastError = error;
      return false;
    }
  }

  _isValid(raw) {
    try { parseSave(raw); return true; } catch { return false; }
  }

  /** Carga la partida principal o, si está dañada, el respaldo. */
  load() {
    this.restoredFromBackup = false;
    const primary = this._read(SAVE_KEY);
    if (primary) {
      try {
        return parseSave(primary);
      } catch (error) {
        this.lastError = error;
        // Apartar la copia dañada para que el próximo guardado no la borre sin dejar rastro.
        try { this._write(CORRUPT_KEY, primary); } catch { /* sin espacio */ }
      }
    }
    const backup = this._read(BACKUP_KEY);
    if (!backup) return null;
    try {
      const data = parseSave(backup);
      this.restoredFromBackup = true;
      // Restaurar el respaldo como principal para no volver a fallar al recargar.
      try { this._write(SAVE_KEY, backup); } catch { /* se reintenta en el próximo guardado */ }
      return data;
    } catch (error) {
      this.lastError = error;
      return null;
    }
  }

  clear() {
    for (const key of [SAVE_KEY, BACKUP_KEY, CORRUPT_KEY]) {
      try { this.storage?.removeItem(key); } catch { /* sin almacenamiento */ }
    }
  }
}
