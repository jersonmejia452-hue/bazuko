import test from 'node:test';
import assert from 'node:assert/strict';
import {
  SaveSystem, SAVE_KEY, BACKUP_KEY, CORRUPT_KEY, SAVE_VERSION,
  checksum, migrateSave, sanitizeSave, parseSave
} from '../src/systems/SaveSystem.js';

class MemoryStorage {
  constructor(entries = {}) { this.map = new Map(Object.entries(entries)); this.failWrites = false; }
  getItem(key) { return this.map.has(key) ? this.map.get(key) : null; }
  setItem(key, value) {
    if (this.failWrites) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; }
    this.map.set(key, String(value));
  }
  removeItem(key) { this.map.delete(key); }
}

const sample = (dinero = 5000) => ({
  stats: { hambre: 80, sed: 70, energia: 60, salud: 90, higiene: 50, animo: 40, vicio: 30, dinero, xp: 12, level: 2 },
  clock: { day: 3, hour: 14.5 },
  inventory: { items: [{ id: 'lata', qty: 4 }] },
  talents: {}, diseases: {},
  player: { pos: [112.98, 0, 97.84] },
  built: { base: true }, costal: true,
  look: { nombre: 'Parcero' },
  dog: { isFriend: true, look: null }
});

test('guardar y cargar conserva la partida con versión y fecha', () => {
  const storage = new MemoryStorage();
  const save = new SaveSystem(storage, { now: () => 1234 });
  assert.equal(save.save(sample()), true);
  const loaded = save.load();
  assert.equal(loaded.v, SAVE_VERSION);
  assert.equal(loaded.savedAt, 1234);
  assert.equal(loaded.stats.dinero, 5000);
  assert.deepEqual(loaded.inventory.items, [{ id: 'lata', qty: 4 }]);
  assert.deepEqual(loaded.player.pos, [112.98, 0, 97.84]);
  assert.equal(save.restoredFromBackup, false);
});

test('el guardado anterior queda como respaldo', () => {
  const storage = new MemoryStorage();
  const save = new SaveSystem(storage);
  save.save(sample(1000));
  save.save(sample(2000));
  assert.equal(parseSave(storage.getItem(BACKUP_KEY)).stats.dinero, 1000);
  assert.equal(parseSave(storage.getItem(SAVE_KEY)).stats.dinero, 2000);
});

test('un guardado cortado se recupera desde el respaldo y se aparta', () => {
  const storage = new MemoryStorage();
  const save = new SaveSystem(storage);
  save.save(sample(1000));
  save.save(sample(2000));
  const broken = storage.getItem(SAVE_KEY).slice(0, 40);
  storage.setItem(SAVE_KEY, broken);

  const loaded = save.load();
  assert.equal(loaded.stats.dinero, 1000);
  assert.equal(save.restoredFromBackup, true);
  assert.equal(storage.getItem(CORRUPT_KEY), broken);
  // El respaldo vuelve a ser el principal: recargar ya no falla.
  assert.equal(new SaveSystem(storage).load().stats.dinero, 1000);
});

test('un guardado editado no pasa la suma de verificación', () => {
  const storage = new MemoryStorage();
  const save = new SaveSystem(storage);
  save.save(sample(1000));
  storage.setItem(SAVE_KEY, storage.getItem(SAVE_KEY).replace('"dinero":1000', '"dinero":9999999'));
  assert.equal(save.load(), null);
  assert.match(save.lastError.message, /verificación/);
  assert.ok(storage.getItem(CORRUPT_KEY));
});

test('un respaldo dañado no reemplaza un guardado bueno', () => {
  const storage = new MemoryStorage();
  const save = new SaveSystem(storage);
  save.save(sample(1000));
  storage.setItem(SAVE_KEY, '{basura');
  save.save(sample(3000));
  assert.equal(storage.getItem(BACKUP_KEY), null);
  assert.equal(save.load().stats.dinero, 3000);
});

test('migra partidas v1 (dólares) y v2 (pesos sin sobre)', () => {
  const v1 = new MemoryStorage({ [SAVE_KEY]: JSON.stringify({ stats: { dinero: 10 }, clock: { day: 2, hour: 8 } }) });
  assert.equal(new SaveSystem(v1).load().stats.dinero, 2500);

  const v2 = new MemoryStorage({ [SAVE_KEY]: JSON.stringify({ v: 2, stats: { dinero: 10 }, clock: { day: 2, hour: 8 } }) });
  const loaded = new SaveSystem(v2).load();
  assert.equal(loaded.stats.dinero, 10);
  assert.equal(loaded.v, SAVE_VERSION);
  assert.equal(migrateSave({ v: 2 }).v, SAVE_VERSION);
});

test('sanea valores imposibles sin perder el resto de la partida', () => {
  const data = sanitizeSave({
    stats: { hambre: 250, sed: -5, energia: 'mucha', dinero: -40, xp: NaN },
    clock: { day: 0, hour: 30 },
    inventory: 'nada',
    player: { pos: [1, null, 3] },
    built: { base: true },
    radio: 7
  });
  assert.equal(data.stats.hambre, 100);
  assert.equal(data.stats.sed, 0);
  assert.equal('energia' in data.stats, false);
  assert.equal(data.stats.dinero, 0);
  assert.equal('xp' in data.stats, false);
  assert.deepEqual(data.clock, { day: 1, hour: 6 });
  assert.deepEqual(data.inventory, {});
  assert.equal(data.player, undefined);
  assert.deepEqual(data.built, { base: true });
  assert.equal('radio' in data, false);
});

test('si el navegador no deja escribir, informa el fallo y conserva lo anterior', () => {
  const storage = new MemoryStorage();
  const save = new SaveSystem(storage);
  save.save(sample(1000));
  storage.failWrites = true;
  assert.equal(save.save(sample(2000)), false);
  assert.match(save.lastError.message, /Quota/);
  storage.failWrites = false;
  assert.equal(save.load().stats.dinero, 1000);

  const none = new SaveSystem(null);
  assert.equal(none.save(sample()), false);
  assert.equal(none.load(), null);
});

test('la suma de verificación es estable y detecta cambios', () => {
  assert.equal(checksum('abc'), checksum('abc'));
  assert.notEqual(checksum('abc'), checksum('abd'));
});
