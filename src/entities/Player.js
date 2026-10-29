// src/entities/Player.js
import * as THREE from 'three';
import {
  PLAYER_RADIUS,
  PLAYER_SPEED_WALK,
  PLAYER_SPEED_RUN,
  CHARACTER_SCALE
} from '../utils/constants.js';
import { createCharacter } from '../character/character.js';
import { createRealisticCharacter, REALISTIC_SCALE } from '../character/RealisticCharacter.js';
import { PlayerRagdoll } from '../systems/PlayerRagdoll.js';
import { MeleeCombat } from '../systems/MeleeCombat.js';
import { WaterMovement } from '../systems/WaterMovement.js';

export class Player {
  constructor(scene, input, stats=null, audio=null) {
    this.audio = audio;
    this.jumpVelocity = 0;
    this.isGrounded = true;
    this.groundSurface = null;
    this.waterMovement = new WaterMovement();
    this.melee = new MeleeCombat();
    this.isSwimming = false;
    this.inWater = false;
    this.waterDepth = 0;
    this.waterFrame = null;
    this.airTime = 0;
    this.landing = 0;
    this.movement = { grounded: true, verticalVelocity: 0, airTime: 0, landing: 0, swimming: false, waterDepth: 0 };
    this.input = input;
    this.scene = scene;
    this.stats = stats;
    this.position = new THREE.Vector3(16, 0, 16); // zona reservada spawn
    this.radius = PLAYER_RADIUS;
    this.speedWalk = PLAYER_SPEED_WALK;
    this.speedRun = PLAYER_SPEED_RUN;
    this.speedMult = 1; // debuff por salud mental baja
    this.velocity = new THREE.Vector3();
    this.hasInertia = true;
    this._direction = new THREE.Vector3();
    this._forward = new THREE.Vector3();
    this._right = new THREE.Vector3();
    this._delta = new THREE.Vector3();
    this._before = new THREE.Vector3();
    this._impactVelocity = new THREE.Vector3();
    this._impactTime = 0;

    // Contenedor raíz (posición + rumbo); el personaje va escalado adentro
    this.root = new THREE.Group();
    this.root.position.copy(this.position);
    scene.add(this.root);

    this.character = createCharacter();
    this.character.group.scale.setScalar(CHARACTER_SCALE);
    this.character.group.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    this.root.add(this.character.group);
    this.procedural = this.character;
    this.modelScale = CHARACTER_SCALE;
    this.modelKind = 'procedural';
    this.ragdoll = new PlayerRagdoll(this);

    this.time = 0;
    this.speed = 0;
    this.state = 'idle';
    this.load = 0;            // 0..1: llenado del costal (tamaño del saco)
    this.action = null;       // 'pedir' | 'buscar' | 'comer' | 'dormir' | 'saludo'
    this.actionTimer = 0;
    this.actionDuration = 0;
    this.actionProgress = 0;
    this.sorting = false;
    this.hasCart = false;     // seleccionando basura (mantener Q)
  }

  setLook(look) {
    this.look = look;
    this.procedural.setLook(look);
    this.procedural.group.traverse((o) => {
      if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; }
    });
    return this._realistic?.setLook(look);
  }

  /** Cambia entre el personaje realista (MakeHuman, por defecto) y el procedural (liviano) */
  async setModel(kind) {
    if (kind === this.modelKind) return;
    this.clearVehicleImpact();
    this.modelKind = kind;
    if (kind === 'realista') {
      this._realisticPromise ??= createRealisticCharacter(this.look ?? {});
      this._realistic = await this._realisticPromise;
      if (this._realistic.look !== this.look && this.look) await this._realistic.setLook(this.look);
      if (this.modelKind !== 'realista') return; // se cambió mientras cargaba
      this.root.remove(this.character.group);
      this.character = this._realistic;
      this.modelScale = REALISTIC_SCALE;
    } else {
      this.root.remove(this.character.group);
      this.character = this.procedural;
      this.modelScale = CHARACTER_SCALE;
    }
    this.root.add(this.character.group);
  }

  /** Anima una acción breve (segundos) */
  playAction(action, duration = 1) {
    this.action = action;
    this.actionTimer = duration;
    this.actionDuration = duration;
    this.actionProgress = 0;
  }


  punch(npcs = []) {
    if (this.isSwimming || this.isStunned || !this.isGrounded || !this.melee.start(this)) return false;
    this.playAction('golpear', this.melee.duration);
    return true;
  }

  playBeg() {
    this.playAction('pedir', 1.2);
  }

  receiveVehicleImpact(direction, speed, { collisions = this._lastCollisions } = {}) {
    this.melee.cancel();
    if (this.ragdoll.start(direction, speed, collisions)) return;
    this._impactVelocity.copy(direction).setY(0).normalize().multiplyScalar(Math.min(9, speed * .7));
    this._impactTime = 1;
    this.root.rotation.z = .85;
  }

  get isStunned() { return !!this.ragdoll?.active || this._impactTime > 0; }
  get isRagdollActive() { return !!this.ragdoll?.active; }

  clearVehicleImpact() {
    this.melee?.cancel();
    this.velocity?.set(0, 0, 0);
    this.ragdoll.clear();
    this._impactVelocity.set(0, 0, 0);
    this._impactTime = 0;
    this.root.rotation.z = 0;
  }

  resetGrounding() {
    this.jumpVelocity = 0;
    this.isGrounded = true;
    this.groundSurface = null;
    this.waterMovement.reset();
    this.isSwimming = this.inWater = false;
    this.waterDepth = this.airTime = this.landing = 0;
    this.waterFrame = null;
    this.melee.cancel();
  }

  update(dt, camera, collisions, groundHeight = null, npcs = [], waterInfo = null) {
    this.time += dt;
    this._lastCollisions = collisions;
    if (this.ragdoll?.active) {
      this.melee.cancel();
      this.velocity?.set(0, 0, 0);
      this.ragdoll.update(dt, collisions);
      this.speed = 0; this.state = 'ragdoll';
      return;
    }
    if (this.actionTimer > 0) {
      this.actionTimer -= dt;
      this.actionProgress = Math.min(1, 1 - Math.max(0, this.actionTimer) / (this.actionDuration || 1));
      if (this.actionTimer <= 0) this.action = null;
    }
    this.landing = Math.max(0, this.landing - dt / .22);

    const wasGrounded = this.isGrounded ?? true;
    // Salto y combate cuerpo a cuerpo estilo GTA
    const wantsJump = typeof this.input?.consumePress === 'function' && (this.input.consumePress('Space') || this.input.consumePress('KeySpace'));
    if (wantsJump && this.isGrounded && !this.isSwimming && !this.melee.active && !this.isStunned && !this.hasCart && !this.sorting) {
      this.jumpVelocity = 5.2;
      this.isGrounded = false;
      this.playAction('saltar', 0.65);
      this.audio?.playJump?.();
    }

    const wantsPunch = typeof this.input?.consumePress === 'function' && (this.input.consumePress('KeyG') || this.input.consumePress('Mouse0'));
    if (wantsPunch && !this.isSwimming && !this.isStunned && !this.action && !this.hasCart && !this.sorting) {
      this.punch(npcs);
    }

    const { x = 0, z = 0 } = this.input?.axis ?? {};
    const stunned = this._impactTime > 0;
    const moving = !stunned && (x !== 0 || z !== 0);
    const running = Boolean(this.input?.isRunning && moving);
    let speed = running ? this.speedRun : this.speedWalk;
    if (this.stats?.getSpeedMultiplier) {
      speed *= this.stats.getSpeedMultiplier();
    }
    if (this.hasCart) {
      speed *= 0.82;
    }
    speed = this.waterMovement.getSpeed({ walkSpeed: speed, runSpeed: speed, moving, running, energy: this.stats?.energia ?? 100 });
    if (this.melee.active) speed *= .55;
    // Movimiento
    const dir = this._direction.set(x, 0, z);
    if (camera?.userData?.cameraMode === 'third-person') {
      const forward = camera.getWorldDirection(this._forward);
      forward.y = 0;
      forward.normalize();
      const right = this._right.set(-forward.z, 0, forward.x);
      dir.copy(right).multiplyScalar(x).addScaledVector(forward, -z);
    }
    if (moving) dir.normalize();
    let delta;
    if (this.hasInertia && dt > 0) {
      this.velocity ??= new THREE.Vector3();
      const targetSpeed = moving ? speed : 0;
      const targetVelX = moving ? dir.x * targetSpeed : 0;
      const targetVelZ = moving ? dir.z * targetSpeed : 0;
      const accelRate = this.waterMovement.swimming ? (moving ? 5 : 4) : (moving ? 22 : 18);
      this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVelX, 1 - Math.exp(-accelRate * dt));
      this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVelZ, 1 - Math.exp(-accelRate * dt));
      if (!moving && this.velocity.lengthSq() < 0.0005) {
        this.velocity.set(0, 0, 0);
      }
      delta = this._delta.copy(this.velocity).multiplyScalar(dt);
    } else {
      delta = this._delta.copy(dir).multiplyScalar(moving ? speed * dt : 0);
    }
    if (stunned) {
      delta.addScaledVector(this._impactVelocity, (1 - Math.exp(-4 * dt)) / 4);
      this._impactVelocity.multiplyScalar(Math.exp(-4 * dt));
      this._impactTime = Math.max(0, this._impactTime - dt);
    }
    this.root.rotation.z = .85 * this._impactTime;

    const before = this._before.copy(this.position);
    if (collisions) {
      this.position.copy(
        collisions.resolveMove(this.position, delta, this.radius, this.position)
      );
    } else {
      this.position.add(delta);
    }
    this.speed = dt > 0 ? before.distanceTo(this.position) / dt : 0;
    this.isGrounded ??= true;
    this.jumpVelocity ??= 0;
    const resolved = typeof groundHeight === 'function'
      ? groundHeight(this.position.x, this.position.z, {
        from: before, grounded: wasGrounded, surface: this.groundSurface
      }) : 0;
    const surface = typeof resolved === 'number' ? { height: resolved, layer: 'ground' } : resolved;
    const groundY = Number.isFinite(surface?.height) ? surface.height : 0;
    const water = typeof waterInfo === 'function' ? waterInfo(this.position.x, this.position.z) : null;
    this.waterFrame = this.waterMovement.update(dt, {
      water, feetY: this.position.y, verticalVelocity: this.jumpVelocity, grounded: this.isGrounded,
      groundY, surfaceLayer: surface?.layer, moving, running, energy: this.stats?.energia ?? 100, speed: this.speed
    });
    this.isSwimming = this.waterFrame.swimming;
    this.inWater = this.waterFrame.inWater;
    this.waterDepth = this.waterFrame.depth ?? water?.depth ?? 0;
    if (this.stats && this.waterFrame.energyDrain > 0) this.stats.energia = Math.max(0, (this.stats.energia ?? 100) - this.waterFrame.energyDrain);
    if (this.isSwimming && this.melee.active) {
      this.melee.cancel();
      this.action = null;
      this.actionTimer = 0;
    }
    // Al despegar se conserva la capa de apoyo, no la altura cambiante del cuerpo.
    // Así un salto bajo un puente no se convierte en una entrada al tablero.
    if (wasGrounded && !this.isGrounded) this.groundSurface = surface;
    if (!this.waterFrame.handlesVertical && this.isGrounded && typeof groundHeight === 'function' && before.y - groundY > .6) {
      this.isGrounded = false;
      this.jumpVelocity = 0;
    }
    if (this.waterFrame.handlesVertical) {
      this.position.y = this.waterFrame.feetY;
      this.jumpVelocity = this.waterFrame.verticalVelocity;
      this.isGrounded = this.waterFrame.grounded;
      this.groundSurface = { height: groundY, layer: 'ground' };
    } else if (!this.isGrounded) {
      this.jumpVelocity -= 17.0 * dt;
      this.position.y += this.jumpVelocity * dt;
      // La pendiente también puede alcanzar los pies al avanzar cuesta arriba,
      // incluso antes del ápice; la superficie ya respeta la capa de despegue.
      if (this.position.y <= groundY) {
        this.position.y = groundY;
        this.jumpVelocity = 0;
        this.isGrounded = true;
        this.groundSurface = surface;
        this.landing = 1;
        this.audio?.playLanding?.();
      }
    } else if (typeof groundHeight === 'function') {
      // El apoyo sigue la pendiente directamente; interpolar hacia la calle
      // inferior puede perder la capa del viaducto antes de resolver el suelo.
      this.position.y = groundY;
      this.groundSurface = surface;
    }

    this.root.position.copy(this.position);
    this.airTime = !this.isGrounded && !this.isSwimming ? this.airTime + dt : 0;

    // Rotación suave
    if (moving) {
      const targetAngle = Math.atan2(dir.x, dir.z);
      let diff = targetAngle - this.root.rotation.y;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.root.rotation.y += diff * Math.min(1, 14 * dt);

      // Inclinación centrífuga (banking lateral en giros)
      const targetBank = THREE.MathUtils.clamp(-diff * (this.isSwimming ? .08 : running ? 0.38 : 0.22), -0.22, 0.22);
      this.root.rotation.z = THREE.MathUtils.lerp(this.root.rotation.z, targetBank, 1 - Math.exp(-14 * dt));
      // Inclinación hacia adelante con la aceleración
      this.root.rotation.x = THREE.MathUtils.lerp(this.root.rotation.x, this.isSwimming ? 0 : running ? 0.08 : 0.02, 1 - Math.exp(-10 * dt));
    } else {
      this.root.rotation.z = THREE.MathUtils.lerp(this.root.rotation.z, 0, 1 - Math.exp(-12 * dt));
      this.root.rotation.x = THREE.MathUtils.lerp(this.root.rotation.x, 0, 1 - Math.exp(-10 * dt));
    }

    const hit = this.melee.update(dt, this, npcs);
    if (hit?.reward > 0 && typeof this.stats?.dinero === 'number') this.stats.dinero += hit.reward;
    if (this.melee.active) {
      this.action = 'golpear';
      this.actionProgress = this.melee.progress;
    } else if (this.action === 'golpear') this.action = null;
    this.state = this.isSwimming ? (moving ? 'swim' : 'tread') : !this.isGrounded ? 'jump' : (this.speed < 0.25) ? 'idle' : (running ? 'run' : 'walk');
    Object.assign(this.movement, {
      grounded: this.isGrounded, verticalVelocity: this.jumpVelocity, airTime: this.airTime,
      landing: this.landing, swimming: this.isSwimming, waterDepth: this.waterDepth,
      surfaceY: this.waterFrame?.surfaceY
    });

    // Animación del personaje (velocidad en metros del modelo, no del mundo)
    this.character.update(dt, {
      speed: stunned ? 0 : this.speed / this.modelScale,
      running,
      action: stunned ? null : this.isSwimming ? null : !this.isGrounded ? 'saltar' : (this.sorting ? 'buscar' : this.action),
      actionProgress: this.actionProgress,
      movement: this.movement,
      t: this.time,
      load: this.load,
      dirt: this.stats ? Math.max(0, (40 - this.stats.higiene) / 40) : 0
    });
  }

  dispose() {
    this.ragdoll.clear();
    this._realistic?.dispose?.();
    this._realisticPromise?.then(character => character.dispose?.()).catch(() => {});
    this.procedural.group.traverse((o) => {
      o.geometry?.dispose?.();
      o.material?.dispose?.();
    });
    this.scene.remove(this.root);
  }
}
