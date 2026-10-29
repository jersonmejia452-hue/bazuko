import * as THREE from 'three';

export const MELEE_ATTACK = Object.freeze({
  windup: .18,
  impact: .22,
  duration: .58,
  cooldown: .78,
  range: 1.85,
  maxHeightDifference: .85,
  minFacingDot: .25
});

// Interseccion del segmento del golpe con una caja; respeta tambien la altura del obstaculo.
function crossesBox(start, end, min, max) {
  let near = 0, far = 1;
  for (const axis of ['x', 'y', 'z']) {
    const delta = end[axis] - start[axis];
    if (Math.abs(delta) < 1e-8) {
      if (start[axis] < min[axis] || start[axis] > max[axis]) return false;
      continue;
    }
    const a = (min[axis] - start[axis]) / delta;
    const b = (max[axis] - start[axis]) / delta;
    near = Math.max(near, Math.min(a, b));
    far = Math.min(far, Math.max(a, b));
    if (near > far) return false;
  }
  return far > 1e-5 && near < 1 - 1e-5;
}

const validPosition = (position) => position && ['x', 'y', 'z'].every(axis => Number.isFinite(position[axis]));

/** Un golpe tiene anticipacion, un unico instante de contacto y recuperacion. No acredita dinero. */
export class MeleeCombat {
  constructor() {
    this.active = false;
    this.elapsed = 0;
    this.cooldownRemaining = 0;
    this.duration = MELEE_ATTACK.duration;
    this._resolved = false;
    this._attacker = null;
    this._start = new THREE.Vector3();
    this._end = new THREE.Vector3();
    this._localStart = new THREE.Vector3();
    this._localEnd = new THREE.Vector3();
    this._min = new THREE.Vector3();
    this._candidates = [];
  }

  get progress() { return Math.min(1, this.elapsed / this.duration); }
  get phase() {
    if (!this.active) return 'idle';
    if (this.elapsed < MELEE_ATTACK.windup) return 'windup';
    return this.elapsed < MELEE_ATTACK.impact ? 'strike' : 'recovery';
  }

  _canAttack(attacker) {
    return validPosition(attacker?.position) && Number.isFinite(attacker?.root?.rotation?.y)
      && !attacker.isStunned && attacker.isGrounded !== false && !attacker.hasCart && !attacker.sorting
      && !(attacker.stats?.salud <= 0);
  }

  start(attacker) {
    if (this.active || this.cooldownRemaining > 1e-8 || !this._canAttack(attacker)) return false;
    this.active = true;
    this.elapsed = 0;
    this.cooldownRemaining = MELEE_ATTACK.cooldown;
    this._resolved = false;
    this._attacker = attacker;
    attacker.audio?.playWhoosh?.();
    return true;
  }

  cancel() {
    this.active = false;
    this._resolved = true;
    this._attacker = null;
    // Cancelar por una caida no permite saltarse el enfriamiento.
  }

  _clearLine(attacker, target) {
    const collisions = attacker._lastCollisions;
    if (!collisions) return true;
    this._start.copy(attacker.position); this._start.y += 1.05;
    this._end.copy(target.position); this._end.y += 1.05;
    const blocked = (entry) => {
      if (!entry?.box) return false;
      const obb = entry.obb;
      if (obb) {
        this._localStart.copy(this._start).sub(obb.center).applyQuaternion(obb.inverse);
        this._localEnd.copy(this._end).sub(obb.center).applyQuaternion(obb.inverse);
        this._min.copy(obb.halfSize).negate();
        return crossesBox(this._localStart, this._localEnd, this._min, obb.halfSize);
      }
      return crossesBox(this._start, this._end, entry.box.min, entry.box.max);
    };
    const statics = collisions.queryStatic
      ? collisions.queryStatic(Math.min(this._start.x, this._end.x), Math.min(this._start.z, this._end.z),
        Math.max(this._start.x, this._end.x), Math.max(this._start.z, this._end.z), this._candidates)
      : collisions.colliders ?? [];
    return !statics.some(blocked) && !(collisions.dynamicColliders ?? []).some(blocked);
  }

  _target(attacker, npcs) {
    const forwardX = Math.sin(attacker.root.rotation.y), forwardZ = Math.cos(attacker.root.rotation.y);
    let closest = null, closestDistance = MELEE_ATTACK.range;
    for (const npc of npcs ?? []) {
      if (!npc || npc._disposed || !validPosition(npc.position) || typeof npc.takePunch !== 'function') continue;
      if (Math.abs(npc.position.y - attacker.position.y) > MELEE_ATTACK.maxHeightDifference) continue;
      const dx = npc.position.x - attacker.position.x, dz = npc.position.z - attacker.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance >= closestDistance) continue;
      const facing = distance > 1e-6 ? (dx * forwardX + dz * forwardZ) / distance : 1;
      if (facing <= MELEE_ATTACK.minFacingDot || !this._clearLine(attacker, npc)) continue;
      closest = npc; closestDistance = distance;
    }
    return closest;
  }

  /** Devuelve { target, reward } solo en el cuadro del contacto; update(0) no avanza el ataque. */
  update(dt, attacker, npcs = []) {
    if (!Number.isFinite(dt) || dt <= 0) return null;
    this.cooldownRemaining = Math.max(0, this.cooldownRemaining - dt);
    if (!this.active) return null;
    if (attacker !== this._attacker || !this._canAttack(attacker)) { this.cancel(); return null; }
    this.elapsed = Math.min(this.duration, this.elapsed + dt);
    let contact = null;
    if (!this._resolved && this.elapsed + 1e-8 >= MELEE_ATTACK.impact) {
      this._resolved = true;
      // Se comprueba al extender el brazo: un peaton que ya se alejo no recibe daño remoto.
      const target = this._target(attacker, npcs);
      if (target) {
        const reward = target.takePunch(attacker);
        if (reward !== false) {
          attacker.audio?.playPunchHit?.();
          contact = { target, reward: Number.isFinite(reward) ? Math.max(0, reward) : 0 };
        }
      }
    }
    if (this.elapsed >= this.duration) this.active = false;
    return contact;
  }
}
