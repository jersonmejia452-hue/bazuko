// src/ui/MapView.js
// Mapa grande de la pestaña «Mapa»: norte arriba, arrastre, rueda para zoom y clic para marcar destino.
import { el, button } from './dom.js';
import { streetLabels, MAP_COLORS } from '../world/bogota/CityMapRaster.js';
import { formatDistance } from './Minimap.js';
import { FILTERS, NEED_COPY, hasTag, noOptionText, placeMeta, rankPlaces, sellFirstPlaces } from './mapServices.js';

const PRESS_KEYS = new Set(['Enter', 'NumpadEnter', 'Space']); // las teclas que pulsan un botón
const PAN_STEP = 24;
const HIT_RADIUS = 14;
const SERVICE_MIN_ZOOM = 1.6; // por debajo, «Ver toda la ciudad» se saturaría de puestos
const FRAME_MARGIN = 60;
const SAME_PLACE_METERS = 4; // el destino puede moverse a la acera más cercana al lugar
const LEGEND =[['Andén', 'sidewalk'], ['Calle', 'road'], ['Parque', 'grass'], ['Agua', 'water'], ['Edificio', 'building']];

export class MapView {
  constructor(game) {
    this.game = game;
    this.zoom = 0;          // píxeles CSS por metro; 0 = aún sin calcular
    this.centerX = 0;
    this.centerZ = 0;
    this.hover = null;
    this.filter = 'todo';   // dura toda la sesión; nunca cambia solo
    this._drag = null;
    this._labels = streetLabels();
    this._walkCache = new Map();
    this._focusCta = null;
    this._panned = false;   // Enter marca el centro solo si el jugador movió la vista

    this.canvas = el('canvas', {
      class: 'map-view__canvas', tabindex: '0',
      'aria-label': 'Mapa de la ciudad. Clic para marcar destino, clic derecho para quitarlo, arrastrar para mover y rueda para acercar.'
    });
    this.ctx = this.canvas.getContext?.('2d');
    this.sidebar = el('aside', { class: 'map-view__side' });
    this.coords = el('span', { class: 'map-view__coords' });
    const tool = (text, label, onclick) => el('button', { type: 'button', class: 'map-view__tool', title: label, 'aria-label': label, onclick, text });
    this.root = el('div', { class: 'map-view' },
      el('div', { class: 'map-view__stage' }, this.canvas,
        el('div', { class: 'map-view__tools' },
          tool('+', 'Acercar', () => this._zoomAt(this.cssWidth / 2, this.cssHeight / 2, 1.3)),
          tool('−', 'Alejar', () => this._zoomAt(this.cssWidth / 2, this.cssHeight / 2, 1 / 1.3)),
          tool('◎', 'Centrar en mí', () => this.centerOnPlayer()),
          tool('⤢', 'Ver toda la ciudad', () => this.fitCity())),
        el('ul', { class: 'map-view__legend', 'aria-label': 'Leyenda' },
          LEGEND.map(([name, key]) => el('li', { style: `--c:${MAP_COLORS[key]}`, text: name })),
          el('li', { class: 'is-route', text: 'Ruta' })),
        el('div', { class: 'map-view__hint' },
          el('span', {}, el('kbd', { text: 'Clic' }), ' marcar'),
          el('span', {}, el('kbd', { text: 'Clic der.' }), ' quitar'),
          el('span', {}, el('kbd', { text: 'Rueda' }), ' zoom'),
          this.coords)),
      this.sidebar);
    this._bind();
  }

  /** Se llama cada vez que la pestaña se muestra. */
  mount({ recenter = true } = {}) {
    const p = this.game.player?.position;
    if (recenter && p) { this.centerX = p.x; this.centerZ = p.z; }
    this._panned = false;
    this._drag = null; // un arrastre cortado al cambiar de pestaña no sigue al volver
    this._walkCache.clear();
    this._renderSidebar();
    requestAnimationFrame?.(() => { this._resize(); this.draw(); (this._focusCta ?? this.canvas).focus?.({ preventScroll: true }); });
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect?.();
    if (!rect || !rect.width) return;
    this.dpr = Math.min(2, window.devicePixelRatio || 1);
    this.canvas.width = Math.round(rect.width * this.dpr);
    this.canvas.height = Math.round(rect.height * this.dpr);
    this.cssWidth = rect.width;
    this.cssHeight = rect.height;
    if (!this.zoom) this.zoom = 2.2;
    this.zoom = this._clampZoom(this.zoom);
  }

  centerOnPlayer() {
    const p = this.game.player?.position;
    if (p) { this.centerX = p.x; this.centerZ = p.z; this._panned = false; this.draw(); }
  }

  fitCity() {
    const r = this.game.mapRaster;
    if (!r || !this.cssWidth) return;
    this.centerX = r.originX + r.worldWidth / 2;
    this.centerZ = r.originZ + r.worldHeight / 2;
    this.zoom = this._clampZoom(0);
    this._panned = false;
    this.draw();
  }

  _clampZoom(z) {
    const r = this.game.mapRaster;
    const min = r && this.cssWidth ? Math.min(this.cssWidth / r.worldWidth, this.cssHeight / r.worldHeight) * .9 : .5;
    return Math.max(min, Math.min(9, z));
  }

  /** Pantalla CSS → mundo. */
  _toWorld(sx, sy) {
    return { x: this.centerX + (sx - this.cssWidth / 2) / this.zoom, z: this.centerZ + (sy - this.cssHeight / 2) / this.zoom };
  }

  /** Mundo → pantalla CSS. */
  _toScreen(x, z) {
    return [(x - this.centerX) * this.zoom + this.cssWidth / 2, (z - this.centerZ) * this.zoom + this.cssHeight / 2];
  }

  _pois() { return this.game._getPOIs?.() ?? []; }

  /** Lo que el lienzo dibuja y deja marcar, de abajo arriba: con filtro, lo que coincide queda encima. */
  _visiblePois() {
    const pois = this._pois();
    if (this.filter === 'todo') return this.zoom >= SERVICE_MIN_ZOOM ? pois : pois.filter(poi => !poi.service);
    return [...pois.filter(poi => !hasTag(poi, this.filter)), ...pois.filter(poi => hasTag(poi, this.filter))];
  }

  _hit(sx, sy) {
    let best = null, bestD = HIT_RADIUS;
    for (const poi of this._visiblePois()) {
      const [px, py] = this._toScreen(poi.x, poi.z);
      const d = Math.hypot(px - sx, py - sy);
      // En un empate gana lo que está dibujado encima.
      if (d <= bestD) { bestD = d; best = poi; }
    }
    return best;
  }

  /** Metros a pie desde el jugador; null si no hay camino. Vale mientras dure la pestaña: en pausa nadie se mueve. */
  _walk(poi) {
    const p = this.game.player?.position, gps = this.game.gps;
    if (!p) return 0;
    if (!gps?.routeLengthTo) return Math.hypot(poi.x - p.x, poi.z - p.z);
    const key = `${poi.x}|${poi.z}`;
    if (!this._walkCache.has(key)) this._walkCache.set(key, gps.routeLengthTo(p, poi));
    return this._walkCache.get(key);
  }

  /** Centra la vista entre el jugador y el lugar, y aleja solo si hace falta para ver ambos. */
  _frame(poi) {
    const p = this.game.player?.position;
    if (!p || !this.cssWidth) { this.centerX = poi.x; this.centerZ = poi.z; return; }
    this.centerX = (p.x + poi.x) / 2;
    this.centerZ = (p.z + poi.z) / 2;
    const fit = Math.min((this.cssWidth - 2 * FRAME_MARGIN) / Math.max(1, Math.abs(poi.x - p.x)),
      (this.cssHeight - 2 * FRAME_MARGIN) / Math.max(1, Math.abs(poi.z - p.z)));
    this.zoom = this._clampZoom(Math.min(this.zoom, fit));
  }

  _go(poi) {
    this._frame(poi);
    this._mark(poi);
  }

  _local(e) {
    const rect = this.canvas.getBoundingClientRect();
    return [e.clientX - rect.left, e.clientY - rect.top];
  }

  _bind() {
    const c = this.canvas;
    c.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      const [sx, sy] = this._local(e);
      this._drag = { sx, sy, cx: this.centerX, cz: this.centerZ, moved: false };
      c.setPointerCapture?.(e.pointerId);
    });
    c.addEventListener('pointermove', (e) => {
      if (e.buttons === 0) this._drag = null; // el botón se soltó donde el lienzo no lo vio
      const [sx, sy] = this._local(e);
      const d = this._drag;
      if (d) {
        if (Math.hypot(sx - d.sx, sy - d.sy) > 4) d.moved = true;
        if (d.moved) {
          this.centerX = d.cx - (sx - d.sx) / this.zoom;
          this.centerZ = d.cz - (sy - d.sy) / this.zoom;
          this._panned = true;
        }
      }
      const hover = this._hit(sx, sy);
      const w = this._toWorld(sx, sy);
      this.coords.textContent = `X ${Math.round(w.x)} ∙ Z ${Math.round(w.z)}`;
      if (d?.moved || hover !== this.hover) { this.hover = hover; this.draw(); }
      c.style.cursor = d?.moved ? 'grabbing' : hover ? 'pointer' : 'crosshair';
    });
    c.addEventListener('pointerup', (e) => {
      const d = this._drag;
      this._drag = null;
      // Con el menú cerrado a mitad del clic, soltar no debe marcar nada en un mapa que ya no se ve.
      if (!d || d.moved || !(c.getClientRects?.().length ?? 1)) return;
      const [sx, sy] = this._local(e);
      const poi = this._hit(sx, sy);
      this._mark(poi ?? { ...this._toWorld(sx, sy), name: 'Punto marcado', icon: '📍' });
    });
    c.addEventListener('pointercancel', () => { this._drag = null; });
    c.addEventListener('contextmenu', (e) => { e.preventDefault(); this._clear(); });
    c.addEventListener('wheel', (e) => {
      e.preventDefault();
      const [sx, sy] = this._local(e);
      this._zoomAt(sx, sy, e.deltaY < 0 ? 1.18 : 1 / 1.18);
    }, { passive: false });
    c.addEventListener('keydown', (e) => { this._onKey(e); });
    // Con el foco en el panel el teclado sigue manejando el mapa; las teclas que pulsan son del botón enfocado.
    this.root.addEventListener('keydown', (e) => {
      if (e.target === c || PRESS_KEYS.has(e.code)) return;
      if (this._onKey(e)) c.focus?.({ preventScroll: true });
    });
    if (typeof ResizeObserver !== 'undefined') {
      new ResizeObserver(() => { this._resize(); this.draw(); }).observe(c);
    }
  }

  /** Teclado del mapa. Devuelve true si la tecla era suya. */
  _onKey(e) {
    if (e.metaKey || e.ctrlKey || e.altKey) return false; // los atajos del navegador siguen su camino
    const pan = PAN_STEP * 2.2 / this.zoom;
    const moves = { ArrowLeft: [-pan, 0], ArrowRight: [pan, 0], ArrowUp: [0, -pan], ArrowDown: [0, pan] };
    if (moves[e.code]) { this.centerX += moves[e.code][0]; this.centerZ += moves[e.code][1]; this._panned = true; }
    // También por `key`: en teclados español y latinoamericano, «+» y «-» están en otras teclas físicas.
    else if (e.code === 'Equal' || e.code === 'NumpadAdd' || e.key === '+') this._zoomAt(this.cssWidth / 2, this.cssHeight / 2, 1.25);
    else if (e.code === 'Minus' || e.code === 'NumpadSubtract' || e.key === '-') this._zoomAt(this.cssWidth / 2, this.cssHeight / 2, 1 / 1.25);
    // Solo tras mover la vista: M + Enter sin botón, o mantener Enter, no deben reemplazar la ruta con el centro.
    else if (PRESS_KEYS.has(e.code)) { if (!e.repeat && this._panned) this._mark({ x: this.centerX, z: this.centerZ, name: 'Punto marcado', icon: '📍' }); }
    else if (e.code === 'Delete' || e.code === 'Backspace') this._clear();
    else return false;
    e.preventDefault();
    e.stopPropagation();
    this.draw();
    return true;
  }

  _zoomAt(sx, sy, factor) {
    const before = this._toWorld(sx, sy);
    this.zoom = this._clampZoom(this.zoom * factor);
    const after = this._toWorld(sx, sy);
    this.centerX += before.x - after.x;
    this.centerZ += before.z - after.z;
    this.draw();
  }

  _mark(target) {
    const { name, icon, x, z } = target;
    this.game.setGpsWaypoint?.({ name, icon: icon || '📍', x, z });
    this._panned = false;
    this._renderSidebar();
    this.draw();
  }

  _clear() {
    this.game.clearGpsWaypoint?.();
    this._renderSidebar();
    this.draw();
  }

  _renderSidebar({ keepScroll = true } = {}) {
    const gps = this.game.gps;
    const p = this.game.player?.position;
    const wp = gps?.waypoint;
    const pois = this._pois();
    const needs = this.game._needs ?? {};
    const need = needs.need ?? null;
    const carried = need ? needs.carried?.[need] : null;
    const filter = this.filter !== 'todo' ? this.filter : null;
    // `replaceChildren` quita el control enfocado: sin esto, el mando pierde su sitio.
    const focused = globalThis.document?.activeElement;
    const hadFocus = !!focused && !!this.sidebar.contains?.(focused);
    const scroll = keepScroll ? this.sidebar.querySelector?.('.map-view__list')?.scrollTop ?? 0 : 0;

    const current = wp
      ? el('div', { class: 'map-view__dest' },
        el('span', { class: 'map-view__dest-label', text: 'Destino' }),
        el('strong', { text: `${wp.icon} ${wp.name}` }),
        el('span', { class: 'map-view__dest-meta', text: gps.route.length && p
          ? `${formatDistance(gps.remainingDistance(p))} a pie` : 'Sin ruta a pie' }),
        button('Quitar destino', { onClick: () => this._clear() }))
      : el('div', { class: 'map-view__dest is-empty' },
        el('span', { class: 'map-view__dest-label', text: 'Sin destino' }),
        need ? el('strong', { text: NEED_COPY[need].alert })
          : el('span', { class: 'map-view__dest-meta', text: 'Haz clic en el mapa o elige un lugar.' }),
        carried ? el('span', { class: 'map-view__dest-meta', text: `Llevas: ${carried} ∙ cierra el mapa y úsalo con I` }) : null);

    const filters = el('div', { class: 'map-view__filters', role: 'group', 'aria-label': 'Filtrar lugares' },
      FILTERS.map(([id, label]) => el('button', {
        type: 'button', 'data-focus': `filtro-${id}`, 'aria-pressed': String(id === this.filter), text: label,
        class: `map-view__filter${id === this.filter ? ' is-active' : ''}${id === need ? ' is-need' : ''}`,
        onclick: () => { this.filter = id; this._renderSidebar({ keepScroll: false }); this.draw(); },
      })));

    const rank = (tag) => rankPlaces(pois, { tag, walk: (poi) => this._walk(poi), needs, from: p });
    const rows = rank(filter);
    // Lo urgente manda sobre el filtro, que dura toda la sesión: M + Enter siempre lleva a lo que más se necesita.
    const urgent = !wp && need && !carried ? need : null;
    const tag = urgent ?? filter;
    const goButton = (label, poi) => el('button', {
      type: 'button', class: 'btn btn--primary btn--small map-view__nearest', 'data-focus': 'cta', text: label,
      onclick: () => this._go(poi),
    });
    let cta = null, noOption = null;
    if (tag) {
      const options = tag === filter ? rows : rank(tag);
      // Igual que en el radar: el Dealer no compra reciclaje, así que no alivia el costal.
      const best = options.find(tag === 'vender' && need === 'vender' ? (row) => row.usable && !row.poi.dealer : (row) => row.usable);
      const sellers = best ? [] : sellFirstPlaces(pois, tag, needs);
      const sell = sellers.length ? rank('vender').find(row => sellers.includes(row.poi)) : null;
      if (best) cta = goButton(NEED_COPY[tag].cta, best.poi);
      else {
        if (sell) cta = goButton(NEED_COPY.vender.cta, sell.poi);
        const text = noOptionText(tag, options, needs, sell?.poi);
        if (text) noOption = el('p', { class: 'map-view__no-option', text });
      }
    }
    this._focusCta = urgent ? cta : null;

    const list = el('ul', { class: 'map-view__list' }, rows.map(({ poi, meters, usable }, i) => {
      const dist = !p ? '' : meters === null ? 'sin ruta' : formatDistance(meters);
      // Las fogatas se llaman igual: su fila solo es el destino si es esa misma fogata.
      const active = wp && wp.name === poi.name && (!poi.service || Math.hypot(wp.x - poi.x, wp.z - poi.z) < SAME_PLACE_METERS);
      const broke = filter && filter !== 'vender' && !usable;
      const meta = placeMeta(poi, filter, needs);
      return el('li', {},
        el('button', { type: 'button', 'data-focus': `lugar-${i}`,
          class: `map-view__place${active ? ' is-active' : ''}${broke ? ' is-broke' : ''}`,
          onclick: () => this._go(poi) },
        el('span', { class: 'map-view__place-icon', style: `--c:${poi.color || '#ffd166'}`, text: poi.icon }),
        el('span', { class: 'map-view__place-name', text: poi.name }),
        el('span', { class: 'map-view__place-dist', text: dist }),
        // Si no cabe, baja «desde $ 1.000» completo y no parte el precio en dos líneas.
        meta ? el('span', { class: 'map-view__place-meta', text: meta.replace('desde $ ', 'desde $ ') }) : null));
    }));

    this.sidebar.replaceChildren(...[
      current, filters, cta, noOption,
      el('h4', { class: 'map-view__list-title', text: filter ? 'Ir a… (primero lo que puedes usar)' : 'Ir a… (más cerca a pie primero)' }),
      list].filter(Boolean));
    list.scrollTop = scroll;
    if (!keepScroll) this.sidebar.scrollTop = 0; // con la identidad urbana se desplaza el panel entero, no la lista
    if (hadFocus) {
      const key = focused.dataset?.focus;
      const next = key ? this.sidebar.querySelector?.(`[data-focus="${key}"]`) : null;
      (next ?? this.canvas).focus?.({ preventScroll: true });
    }
  }

  draw() {
    const ctx = this.ctx, r = this.game.mapRaster;
    if (!ctx || !this.cssWidth) return;
    const dpr = this.dpr, w = this.cssWidth, h = this.cssHeight;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = '#0b0d11';
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.scale(this.zoom, this.zoom);
    ctx.translate(-this.centerX, -this.centerZ);
    ctx.imageSmoothingEnabled = this.zoom < 3;
    if (r) ctx.drawImage(r.canvas, r.originX, r.originZ, r.worldWidth, r.worldHeight);
    const gps = this.game.gps, p = this.game.player?.position;
    const route = gps?.waypoint && p ? gps.remainingRoute(p) : [];
    if (route.length > 1) {
      ctx.lineJoin = 'round';
      ctx.lineCap = 'round';
      for (const [color, width] of [['rgba(0,0,0,.7)', 7], ['#f6c400', 4]]) {
        ctx.beginPath();
        ctx.moveTo(route[0].x, route[0].z);
        for (const pt of route) ctx.lineTo(pt.x, pt.z);
        ctx.strokeStyle = color;
        ctx.lineWidth = width / this.zoom;
        ctx.stroke();
      }
    }
    ctx.restore();

    // Nombres de vías en el centro de la vista, solo si hay espacio para leerlos
    if (this.zoom > 1.1) {
      ctx.font = '800 11px Overpass, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(214, 228, 255, .75)';
      for (const label of this._labels) {
        ctx.save();
        if (label.vertical) {
          const [sx] = this._toScreen(label.x, 0);
          if (sx < 20 || sx > w - 20) { ctx.restore(); continue; }
          const [, top] = this._toScreen(0, r?.originZ ?? 0), [, bottom] = this._toScreen(0, (r?.originZ ?? 0) + (r?.worldHeight ?? 0));
          ctx.translate(sx, Math.min(Math.max(h * .3, top + 50), bottom - 50));
          ctx.rotate(-Math.PI / 2);
        } else {
          const [, sy] = this._toScreen(0, label.z);
          if (sy < 20 || sy > h - 20) { ctx.restore(); continue; }
          // Sobre la parte visible del plano, no en el vacío fuera de la ciudad.
          const [left] = this._toScreen(Math.max(r?.originX ?? 0, label.minX ?? -Infinity), 0), [right] = this._toScreen((r?.originX ?? 0) + (r?.worldWidth ?? 0), 0);
          ctx.translate(Math.min(Math.max(w * .3, left + 50), right - 50), sy);
        }
        ctx.fillText(label.name.toUpperCase(), 0, 0);
        ctx.restore();
      }
    }

    // Lugares
    const filter = this.filter !== 'todo' ? this.filter : null;
    for (const poi of this._visiblePois()) {
      const [sx, sy] = this._toScreen(poi.x, poi.z);
      if (sx < -20 || sy < -20 || sx > w + 20 || sy > h + 20) continue;
      const match = !filter || hasTag(poi, filter), big = poi === this.hover;
      const base = poi.service && !(filter && match) ? 7 : 10;
      ctx.globalAlpha = match ? 1 : .35;
      ctx.beginPath();
      ctx.arc(sx, sy, base + (big ? 2 : 0), 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(14,15,18,.85)';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = poi.color || '#ffd166';
      ctx.stroke();
      ctx.font = `${base + (big ? 3 : 1)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(poi.icon, sx, sy + 1);
      ctx.globalAlpha = 1;
      if (big || this.zoom > 3.5) this._tag(poi.name, sx, sy - 18);
    }

    // Destino
    if (gps?.waypoint) {
      const [sx, sy] = this._toScreen(gps.waypoint.x, gps.waypoint.z);
      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.arc(sx, sy - 14, 9, Math.PI * .8, Math.PI * .2);
      ctx.closePath();
      ctx.fillStyle = '#f6c400';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0e0f12';
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(sx, sy - 14, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = '#0e0f12';
      ctx.fill();
    }

    // Jugador: flecha en la dirección de la cámara
    if (p) {
      const [sx, sy] = this._toScreen(p.x, p.z);
      ctx.save();
      ctx.translate(sx, sy);
      ctx.rotate(-(this.game._cameraYaw?.() ?? 0));
      ctx.beginPath();
      ctx.arc(0, 0, 13, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(11,79,163,.35)';
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(0, -10);
      ctx.lineTo(7, 7);
      ctx.lineTo(0, 3);
      ctx.lineTo(-7, 7);
      ctx.closePath();
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#0b4fa3';
      ctx.stroke();
      ctx.restore();
    }

    // Norte fijo, junto a los botones de zoom
    ctx.beginPath();
    ctx.arc(w - 64, 26, 15, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(14,15,18,.85)';
    ctx.fill();
    ctx.lineWidth = 1.5;
    ctx.strokeStyle = 'rgba(255,255,255,.25)';
    ctx.stroke();
    ctx.font = '900 12px Overpass, sans-serif';
    ctx.fillStyle = '#f6c400';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('▲', w - 64, 20);
    ctx.fillText('N', w - 64, 32);
  }

  _tag(text, x, y) {
    const ctx = this.ctx;
    ctx.font = '800 11px Overpass, sans-serif';
    const tw = ctx.measureText(text).width + 12;
    ctx.fillStyle = 'rgba(11,79,163,.95)';
    ctx.fillRect(x - tw / 2, y - 9, tw, 18);
    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, x, y + 1);
  }
}
