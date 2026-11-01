// src/features/steal.js
import { ITEMS } from '../data/items.js';
import { cop } from '../utils/money.js';
import { LOW_STANCES } from '../character/archetypes.js';

export const CONFIG = {
  stealDistance: 1.8,
  globalCooldown: 3.0,
  npcCooldown: 30.0,
  markerSpeed: 1.8,
  baseZoneSize: 0.35,
  lootMoneyCosquilleo: [800, 4000],
  lootMoneyDirect: [12000, 45000],
  lootItems: ['pan', 'lataComida', 'cigarrillo', 'tintico', 'moneda', 'reloj'],
  directDamageMin: 6,
  directDamageMax: 16
};

/** Objetivos con los que la Q ya hace otra cosa. */
const QUIET_Q_TARGETS = new Set(['pickup', 'dealer']);

export class StealSystem {
  // Inicializa el sistema de robo a peatones.
  constructor(game) {
    this.game = game;
    this.cooldown = 0;
    this.buscado = 0;
    this.targetNpc = null;
    this.minigameActive = false;
    this.markerPos = 0;
    this.markerDir = 1;
    this.zoneStart = 0.35;
    this.zoneSize = CONFIG.baseZoneSize;
    this._spaceOwned = false;
    if (typeof window !== 'undefined') window.addEventListener('keyup', (e) => { if (e.code === 'Space') this._spaceOwned = false; }, true);
    this._dom = null;
    this._buildUI();
    // En captura, como los paneles: el jugador gasta Espacio antes de que la barra se actualice y Esc abriría la pausa.
    globalThis.window?.addEventListener?.('keydown', (e) => this._onMinigameKey(e), true);
  }

  // Construye la interfaz HTML para el minijuego de cosquilleo.
  _buildUI() {
    if (typeof document === 'undefined') return;
    const box = document.createElement('div');
    box.id = 'steal-minigame';
    box.style.cssText = 'display:none;position:fixed;bottom:140px;left:50%;transform:translateX(-50%);width:280px;height:36px;background:rgba(15,15,18,0.92);border:2px solid #555;border-radius:6px;overflow:hidden;z-index:90;box-shadow:0 0 16px rgba(0,0,0,0.8);';
    box.innerHTML = `
      <div id="steal-track" style="position:relative;width:100%;height:100%;">
        <div id="steal-zone" style="position:absolute;top:0;bottom:0;background:#27ae60;opacity:0.85;"></div>
        <div id="steal-marker" style="position:absolute;top:0;bottom:0;width:8px;background:#ffd166;transform:translateX(-50%);box-shadow:0 0 8px #ffd166;"></div>
        <div style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;font:bold 11px monospace;color:#fff;text-shadow:0 0 4px #000;pointer-events:none;">[ESPACIO] DETENER · [ESC] CANCELAR</div>
      </div>
    `;
    document.body.appendChild(box);
    this._dom = {
      box,
      zone: box.querySelector('#steal-zone'),
      marker: box.querySelector('#steal-marker')
    };
  }

  // Actualiza tiempos, detección de peatones y el minijuego de cosquilleo.
  update(dt) {
    if (this.cooldown > 0) this.cooldown = Math.max(0, this.cooldown - dt);
    const npcs = this.game?.world?.active?.npcs ?? [];
    for (const n of npcs) {
      if (n._robadoTimer > 0) n._robadoTimer = Math.max(0, n._robadoTimer - dt);
    }
    if (this.minigameActive) {
      // Tirado por un carro no se le mete la mano a nadie.
      if (this.game.player?.isStunned) this._endMinigame(false, 'cancel');
      else this._updateMinigame(dt);
      return;
    }
    this._checkProximity(npcs);
  }

  // Encuentra el NPC más cercano y procesa las teclas de interacción E y Q.
  _checkProximity(npcs) {
    const playerPos = this.game?.player?.position;
    if (!playerPos || this.game.paused || this.game.player?.isStunned) {
      this.targetNpc = null;
      return;
    }
    let nearest = null;
    let minD = CONFIG.stealDistance;
    for (const n of npcs) {
      // Ni al desmayado ni a quien atiende un puesto: su aviso es la tienda.
      if (!n?.position || (n._robadoTimer ?? 0) > 0 || n.koState || n.isVendor) continue;
      const d = playerPos.distanceTo(n.position);
      if (d < minD) {
        minD = d;
        nearest = n;
      }
    }
    this.targetNpc = nearest;
    if (!nearest || this.cooldown > 0) return;
    if (this.game.interaction) {
      this.game.interaction.stealPrompt = '[E] Cosquilleo (sigiloso) · [Q] Robo directo';
    }
    if (this.game.input.consumePress('KeyE')) this.startCosquilleo(nearest);
    // Junto a basura o al dealer, Q ya tiene otro uso: no se le roba al que justo va pasando.
    else if (!QUIET_Q_TARGETS.has(this.game.interaction?.currentTargetType) && this.game.input.consumePress('KeyQ')) this.executeRoboDirecto(nearest);
  }

  // Dice si hay a quién hacerle cosquilleo a menos de esa distancia: un carro más lejano le cede el aviso y la tecla.
  personCloserThan(distance) {
    if (!this.targetNpc || this.cooldown > 0) return false;
    return this.game.player.position.distanceTo(this.targetNpc.position) < distance;
  }

  // Inicia el minijuego de timing para el cosquilleo.
  startCosquilleo(npc) {
    this.minigameActive = true;
    this.targetNpc = npc;
    npc.alerta ??= 0.35 + Math.random() * 0.4;
    this.zoneSize = Math.max(0.18, CONFIG.baseZoneSize * (1.1 - npc.alerta * 0.4));
    this.zoneStart = 0.15 + Math.random() * (0.85 - this.zoneSize - 0.15);
    this.markerPos = 0;
    this.markerDir = 1;
    if (this._dom) {
      this._dom.zone.style.left = `${this.zoneStart * 100}%`;
      this._dom.zone.style.width = `${this.zoneSize * 100}%`;
      this._dom.box.style.display = 'block';
    }
  }

  // Mientras dura la barra, Espacio la detiene sin saltar y Esc la cancela sin abrir la pausa.
  _onMinigameKey(e) {
    // El Espacio que detuvo la barra sigue siendo suyo hasta soltarlo: su repetición no es un salto.
    if (this._spaceOwned && e.code === 'Space' && e.repeat) {
      e.preventDefault?.();
      e.stopImmediatePropagation();
      return;
    }
    if (!this.minigameActive || this.game.paused) return;
    if (e.code === 'Escape') {
      e._panelHandled = true;
      this._endMinigame(false, 'cancel');
    } else if (e.code === 'Space') {
      e.preventDefault?.();
      e.stopImmediatePropagation();
      if (e.repeat) return;
      this._spaceOwned = true;
      const success = this.markerPos >= this.zoneStart && this.markerPos <= (this.zoneStart + this.zoneSize);
      this._endMinigame(success, 'play');
    }
  }

  // Actualiza la oscilación del marcador; si el jugador y la persona se separan, ya no hay a quién robarle.
  _updateMinigame(dt) {
    const npc = this.targetNpc, player = this.game.player?.position;
    if (npc?.position && player && player.distanceTo(npc.position) > CONFIG.stealDistance * 2) {
      this._endMinigame(false, 'cancel');
      return;
    }
    const speed = CONFIG.markerSpeed * (1 + (this.targetNpc?.alerta ?? 0.3) * 0.5);
    this.markerPos += this.markerDir * speed * dt;
    if (this.markerPos >= 1) {
      this.markerPos = 1;
      this.markerDir = -1;
    } else if (this.markerPos <= 0) {
      this.markerPos = 0;
      this.markerDir = 1;
    }
    if (this._dom) {
      this._dom.marker.style.left = `${this.markerPos * 100}%`;
    }
  }

  // Concluye el minijuego aplicando botín o alertando al peatón.
  _endMinigame(success, reason) {
    this.minigameActive = false;
    if (this._dom) this._dom.box.style.display = 'none';
    if (reason === 'cancel') return;
    const npc = this.targetNpc;
    this.cooldown = CONFIG.globalCooldown;
    if (npc) npc._robadoTimer = CONFIG.npcCooldown;
    if (success) {
      this._giveLoot(CONFIG.lootMoneyCosquilleo, true);
      this._toast('🧤 ¡Cosquilleo exitoso! Nadie se dio cuenta.', 'rare');
    } else {
      const bonus = this.game?.dog?.distractionBonus?.(this.game.player?.position) ?? 0;
      const noticeChance = Math.max(0.2, (npc?.alerta ?? 0.5) - bonus);
      if (Math.random() < noticeChance) {
        npc?.alarmedByTheft?.(this.game.player.position);
        this._toast('🚨 ¡Lo cogieron con las manos en la masa! El peatón gritó.', 'death');
        // De último: los avisos caen uno encima del otro y este es el que hay que alcanzar a leer.
        this._alertPolice();
      } else {
        this._toast('💨 Fallaste el cosquilleo, pero lograste disimular.', 'warn');
      }
    }
  }

  // Ejecuta un robo directo agresivo con mayor botín y consecuencias.
  executeRoboDirecto(npc) {
    this.cooldown = CONFIG.globalCooldown;
    npc._robadoTimer = CONFIG.npcCooldown;
    this.buscado = Math.min(3, this.buscado + 1);
    this._giveLoot(CONFIG.lootMoneyDirect, false);
    // Quien está en el piso o en la banca no alcanza a defenderse: bastante hace con pararse.
    const down = LOW_STANCES.has(npc.stance);
    npc.alarmedByTheft?.(this.game.player.position);
    const isStrong = !down && (npc.look?.real?.edad === 'adulto' || Math.random() < 0.45);
    if (isStrong && this.game.stats) {
      const dmg = Math.floor(CONFIG.directDamageMin + Math.random() * (CONFIG.directDamageMax - CONFIG.directDamageMin));
      this.game.stats.salud = Math.max(0, this.game.stats.salud - dmg);
      this._toast(`👊 ¡El peatón se defendió! Recibiste -${dmg} de salud. Buscado: ${this.buscado}/3`, 'death');
    } else {
      this._toast(`⚡ ¡Robo directo ejecutado! Peatón asustado. Buscado: ${this.buscado}/3`, 'warn');
    }
    this._alertPolice();
  }

  // Una patrulla que lo ve lo persigue, igual que por un retrovisor robado.
  _alertPolice() {
    if (this.game.traffic?.alertForTheft?.(this.game.player.position) && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('police-chase', {}));
    }
  }

  // Otorga botín aleatorio entre dinero e ítems al inventario del jugador.
  _giveLoot(moneyRange, includeItemChance) {
    const money = Math.round((moneyRange[0] + Math.random() * (moneyRange[1] - moneyRange[0])) / 100) * 100;
    if (this.game.stats) this.game.stats.dinero += money;
    this._toast(`💰 +${cop(money)}`, 'sell');
    if (includeItemChance && Math.random() < 0.4 && this.game.inventory) {
      const itemId = CONFIG.lootItems[Math.floor(Math.random() * CONFIG.lootItems.length)];
      if (ITEMS[itemId]) {
        if (this.game.inventory.add(ITEMS[itemId], 1)) this._toast(`📦 Objeto obtenido: ${ITEMS[itemId].name}`, 'info');
        else this._toast(`🎒 No te cabe más en el costal: dejaste ${ITEMS[itemId].name}.`, 'warn');
      }
    }
  }

  // Dispara una notificación toast en pantalla.
  _toast(text, type = 'info') {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('toast', { detail: { text, type } }));
    }
  }
}
