import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';
import * as THREE from 'three';
import { DrugDealer } from '../src/entities/DrugDealer.js';
import { ITEMS, dealerOffer, dealerPrice } from '../src/data/items.js';
import { TALENTS } from '../src/data/talents.js';
import { InteractionSystem } from '../src/systems/InteractionSystem.js';
import { InventorySystem } from '../src/systems/InventorySystem.js';
import { StatsSystem } from '../src/systems/StatsSystem.js';
import { HUD } from '../src/ui/HUD.js';
import { cop } from '../src/utils/money.js';

beforeEach(() => { globalThis.window = new EventTarget(); });

function dealerScene(t) {
  const stats = new StatsSystem();
  stats.dinero = 0;
  const inventory = new InventorySystem();
  inventory.add(ITEMS.basuco, 2);
  inventory.add(ITEMS.pastilla, 1);
  const interaction = new InteractionSystem({ position: new THREE.Vector3() }, inventory, stats, { play() {} },
    null, { getEffect: (_key, base) => base }, null);
  const dealer = new DrugDealer(new THREE.Scene(), new THREE.Vector3(1, 0, 0));
  t.after(() => dealer.dispose());
  interaction.register(dealer);
  return { stats, inventory, interaction, dealer };
}

// Una tecla pulsada una sola vez
const press = (code) => {
  const pending = new Set([code]);
  return { isDown: () => false, consumePress: (key) => pending.delete(key) };
};

test('comprarle al dealer para revenderle nunca deja ganancia, ni con el mejor talento', () => {
  const best = Math.max(...Object.values(TALENTS).map((talent) => talent.effects?.substancePriceMult ?? 1));
  assert.ok(best > 1, 'hay un talento que mejora el precio');
  for (const item of Object.values(ITEMS).filter((i) => i.substance)) {
    assert.ok(dealerOffer(item, best) < dealerPrice(item), `${item.id}: paga ${dealerOffer(item, best)} y cobra ${dealerPrice(item)}`);
  }
});

test('E junto al dealer abre su tienda y no vende nada sin preguntar', (t) => {
  const { stats, inventory, interaction, dealer } = dealerScene(t);
  const opened = [];
  window.addEventListener('dealer-toggle', (e) => opened.push(e.detail.dealer));
  interaction.update(0.016, press('KeyE'), { isNight: true });
  assert.deepEqual(opened, [dealer]);
  assert.equal(inventory.count('basuco'), 2);
  assert.equal(inventory.count('pastilla'), 1);
  assert.equal(stats.dinero, 0);
});

test('de noche le vende solo la sustancia elegida y paga lo que anuncia la tienda', (t) => {
  t.mock.method(Math, 'random', () => 0.99); // sin requisa
  const { stats, inventory, interaction } = dealerScene(t);
  const result = interaction.sellSubstancesToDealer('basuco', { isNight: true });
  assert.equal(result.earned, dealerOffer(ITEMS.basuco) * 2);
  assert.equal(stats.dinero, result.earned);
  assert.equal(inventory.count('basuco'), 0);
  assert.equal(inventory.count('pastilla'), 1, 'lo demás se queda en el costal');
});

test('de día el dealer no compra y no se pierde nada', (t) => {
  const { stats, inventory, interaction } = dealerScene(t);
  const refusals = [];
  window.addEventListener('substance-fail', (e) => refusals.push(e.detail.reason));
  assert.equal(interaction.sellSubstancesToDealer('basuco', { isNight: false }), null);
  assert.deepEqual(refusals, ['day']);
  assert.equal(inventory.count('basuco'), 2);
  assert.equal(stats.dinero, 0);
});

test('en una requisa la policía se lleva lo que ibas a vender y no te pagan', (t) => {
  t.mock.method(Math, 'random', () => 0);
  const { stats, inventory, interaction } = dealerScene(t);
  const raids = [];
  window.addEventListener('substance-raid', (e) => raids.push(e.detail.lost));
  assert.deepEqual(interaction.sellSubstancesToDealer('basuco', { isNight: true }), { earned: 0, raided: true });
  assert.deepEqual(raids, [[`${ITEMS.basuco.name} ×2`]]);
  assert.equal(stats.dinero, 0);
  assert.equal(inventory.count('basuco'), 0);
  assert.equal(inventory.count('pastilla'), 1);
});

test('la tienda muestra lo que cobra y, de noche, una fila con lo que paga por cada sustancia', (t) => {
  const { stats, inventory, interaction, dealer } = dealerScene(t);
  const panel = { html: '', set innerHTML(value) { this.html = value; }, querySelectorAll: () => [] };
  const hud = Object.assign(Object.create(HUD.prototype), { _htmlCache: new WeakMap(), dealerPanel: panel });
  window.__game = { stats, inventory, interaction, dealer, clock: { isNight: false } };
  hud.renderDealer();
  assert.ok(panel.html.includes(cop(dealerPrice(ITEMS.basuco))));
  assert.ok(!panel.html.includes('dealer-sell-btn'), 'de día no hay nada que vender');
  window.__game.clock.isNight = true;
  hud.renderDealer();
  assert.equal(panel.html.match(/class="dealer-sell-btn"/g).length, 2);
  assert.ok(panel.html.includes(cop(dealerOffer(ITEMS.basuco) * 2)));
  assert.ok(panel.html.includes('te paga 1,8×'));
  // Con Contactos la cuenta de cada fila sube: la frase no puede seguir diciendo lo de antes.
  interaction.substancePriceMult = () => 1.3;
  hud.renderDealer();
  assert.ok(panel.html.includes('te paga 2,34×'));
  assert.ok(panel.html.includes(cop(dealerOffer(ITEMS.basuco, 1.3) * 2)));
});
