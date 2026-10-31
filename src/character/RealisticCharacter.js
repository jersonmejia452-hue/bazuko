// src/character/RealisticCharacter.js
// Personaje realista armado por piezas: cuerpo de MakeHuman/MPFB2 (esqueleto Mixamo) + pelo, barba,
// ropa y calzado exportados por tools/personaje/exportar_variantes.py, con animaciones Mixamo.
// Expone la misma interfaz que createCharacter(): { group, setLook, update }.
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { clone as cloneSkinned } from 'three/examples/jsm/utils/SkeletonUtils.js';
import { ACTIONFORGE_CLIPS, buildCharacterClips } from './actionforge.js';
import { buildMixamoPreviewClips, buildMixamoGameComplements, isMixamoProfile, resolveAnimationProfile } from './animationProfiles.js';
import { groundMixamoClips, MixamoGroundContact } from './mixamoGrounding.js';
import { locomotionBlend, locomotionRate, measureLocomotion } from './locomotion.js';
import { DEFAULT_LOOK, PALETTES } from './look.js';
import { addGrime, addHairTone } from './weathering.js';
import { applyStreetMaterial, createStreetFrame, resolveAppearanceProfile, streetMaterialSeed } from './streetMaterials.js';
import { attachAccessories, attachWeapon, FAR_ACCESSORIES } from './props.js';
import { attachCigaretteToHand, emberGlow } from './smoking.js';
import { attachBasucoProps } from './pipe.js';
import { addHatClip, hatEdgeProfile } from './hatFit.js';
import { animationDamping, SecondaryMotion } from './SecondaryMotion.js';
import { ActionPose } from './ActionPose.js';
import { preparePlayback, blendAnimationWeights } from './AnimationPlayback.js';

const MODEL_BASE = `${import.meta.env?.BASE_URL ?? '/'}models/`;
const BASE = `${MODEL_BASE}personaje/`;
// Animaciones descargadas de Mixamo (tools/personaje/mixamo_a_glb.py); si no están, las de prueba
const ANIM_URLS = ['animaciones.glb', 'animaciones-prueba.glb'].map(file => MODEL_BASE + file);

// El modelo mide ~1,7 m; el mundo usa la escala del personaje procedural (~1,85 m)
export const REALISTIC_SCALE = 1.08;

const ACTIONFORGE_URL = `${MODEL_BASE}animaciones-actionforge.glb`;

// Peso compartido de caminar y correr; su reparto lo decide la velocidad.
const LOCOMOTION = 'locomocion';
// Acciones sin clip propio: clip sustituto y velocidad de reproducción.
const ACTION_FALLBACKS = {
  cagar: ['buscar'], lanzar: ['pedir'], saludo: ['pedir']
};

export const REAL_DEFAULT = {
  sexo: 'hombre', edad: 'adulto', pelo: 'desordenado', barba: 'descuidada', ropa: 'chaqueta', calzado: 'tenis-rotos', cabeza: 'sin-sombrero'
};

const loader = new GLTFLoader();
let skinDetailPromise;
function loadStreetSkinDetail() {
  skinDetailPromise ??= new THREE.TextureLoader().loadAsync(`${MODEL_BASE}preview/skin/skin-micro-normal.png`).then(texture => {
    texture.colorSpace = THREE.NoColorSpace;
    texture.flipY = false;
    texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(18, 18);
    return texture;
  }).catch(error => {
    console.warn('El detalle de piel no está disponible; se conservan los materiales de la apariencia.', error);
    return null;
  });
  return skinDetailPromise;
}
const cache = new Map();
const load = (url) => {
  if (!cache.has(url)) cache.set(url, loader.loadAsync(url));
  return cache.get(url);
};

let catalogPromise = null;
/** Catálogo exportado: cuerpos (sexo × edad) y piezas con sus etiquetas. */
export function loadCatalog() {
  catalogPromise ??= fetch(BASE + 'catalogo.json').then((r) => r.json());
  return catalogPromise;
}

// Categorías de piezas; `cabeza` puede faltar en catálogos exportados antes de que existiera
const PART_CATS = ['pelo', 'barba', 'ropa', 'calzado', 'cabeza'];

/** Piezas válidas para un sexo */
export function optionsFor(catalog, cat, sexo) {
  return (catalog.piezas[cat] ?? []).filter((p) => !p.sexo || p.sexo === sexo);
}

/** Corrige una apariencia realista para que todas sus piezas existan en ese cuerpo. */
export function normalizeReal(catalog, raw = {}) {
  const r = { ...REAL_DEFAULT, ...(raw || {}) };
  if (!['hombre', 'mujer'].includes(r.sexo)) r.sexo = REAL_DEFAULT.sexo;
  if (!['joven', 'adulto', 'mayor'].includes(r.edad)) r.edad = REAL_DEFAULT.edad;
  for (const cat of PART_CATS) {
    const opts = optionsFor(catalog, cat, r.sexo);
    if (!opts.some((o) => o.id === r[cat])) r[cat] = opts[0]?.id ?? REAL_DEFAULT[cat];
  }
  if (r.sexo === 'mujer') r.barba = 'ninguna';
  return r;
}

/** Combinación al azar de piezas realistas */
export function randomReal(catalog, base = {}) {
  const any = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const sexo = base.sexo ?? any(['hombre', 'mujer']);
  const pick = (cat) => any(optionsFor(catalog, cat, sexo)).id;
  return normalizeReal(catalog, {
    sexo, edad: any(['joven', 'adulto', 'mayor']),
    pelo: pick('pelo'), barba: Math.random() < 0.3 ? 'ninguna' : pick('barba'), ropa: pick('ropa'), calzado: pick('calzado'),
    cabeza: Math.random() < 0.6 ? REAL_DEFAULT.cabeza : optionsFor(catalog, 'cabeza', sexo).length ? pick('cabeza') : REAL_DEFAULT.cabeza
  });
}

// ---------- animaciones (retargeteadas una vez por cuerpo) ----------

let animsPromise = null;
function loadAnimations() {
  animsPromise ??= (async () => {
    for (const url of ANIM_URLS) {
      try { return await loader.loadAsync(url); } catch { /* probar la siguiente */ }
    }
    throw new Error('No hay animaciones del personaje');
  })();
  return animsPromise;
}

const clipCache = new Map();
const groundedClipCache = new Map();
let actionforgePromise;
let mixamoPreviewPromise;
async function clipsForBody(bodyId, bodyGltf, profile) { // bodyId incluye el nivel de detalle
  const key = `${profile.id}:${bodyId}`;
  if (!clipCache.has(key)) {
    clipCache.set(key, (async () => {
      if (isMixamoProfile(profile.id)) {
        mixamoPreviewPromise ??= loader.loadAsync(profile.url).catch(error => {
          mixamoPreviewPromise = null;
          throw new Error('No se pudo cargar el banco Mixamo + Blender de prueba.', { cause: error });
        });
        const clips = buildMixamoPreviewClips(bodyGltf, await mixamoPreviewPromise);
        if (profile.id === 'mixamo-game-preview' && (!clips.comer || !clips.cagar)) {
          let actionforge;
          try { actionforge = await load(ACTIONFORGE_URL); }
          catch (error) { throw new Error('Mixamo en juego: no se pudieron cargar los complementos para comer y agacharse.', { cause: error }); }
          Object.assign(clips, buildMixamoGameComplements(bodyGltf, actionforge, clips));
        }
        clips.walk.userData.locomotion = measureLocomotion(bodyGltf.scene, clips.walk, clips.run);
        return clips;
      }
      actionforgePromise ??= load(ACTIONFORGE_URL).catch(error => {
        console.warn('No se pudo cargar ActionForge; se usarán las animaciones anteriores.', error);
        return null;
      });
      const actionforge = await actionforgePromise;
      // El banco anterior (2 MB con mallas y texturas) solo se descarga si falta locomoción.
      const complete = actionforge && ['idle', 'walk', 'run']
        .every(key => actionforge.animations.some(clip => clip.name === ACTIONFORGE_CLIPS[key]));
      const clips = buildCharacterClips(bodyGltf, complete ? null : await loadAnimations(), actionforge);
      if (clips.walk) clips.walk.userData.locomotion = measureLocomotion(bodyGltf.scene, clips.walk, clips.run);
      return clips;
    })().catch(error => {
      clipCache.delete(key);
      throw error;
    }));
  }
  return clipCache.get(key);
}

// ---------- materiales ----------

const HAIR_LIKE = /hair|short0|afro|long0|ponytail|bob0/;
const SOFT_ALPHA = /beard|moustache|eyebrow|eyelash/;

function setupMaterial(mesh, kind) {
  const m = mesh.material = mesh.material.clone();
  const name = mesh.name.toLowerCase();
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.frustumCulled = false; // las mallas con skin se recortan mal al animar
  if (kind === 'pelo' || HAIR_LIKE.test(name)) {
    m.transparent = false;
    m.alphaTest = 0.08;
    m.side = THREE.DoubleSide;
  } else if (SOFT_ALPHA.test(name)) {
    m.transparent = true;
    m.depthWrite = false;
    m.alphaTest = 0.02;
    m.side = THREE.DoubleSide;
    mesh.renderOrder = 2;
  } else {
    m.transparent = false;
    m.alphaTest = 0;
    m.depthWrite = true;
    if (kind === 'ropa' || kind === 'calzado') {
      // la ropa gana a la piel cuando quedan muy pegadas
      m.polygonOffset = true;
      m.polygonOffsetFactor = -1;
      m.polygonOffsetUnits = -2;
    }
  }
  return m;
}

/** Copia una malla con skin de un archivo de pieza y la ata al esqueleto del cuerpo. */
function attachPart(srcMesh, bones, parent, kind) {
  const mesh = new THREE.SkinnedMesh(srcMesh.geometry, srcMesh.material);
  mesh.name = srcMesh.name;
  const skel = srcMesh.skeleton;
  mesh.bind(new THREE.Skeleton(skel.bones.map((b) => bones.get(b.name)), skel.boneInverses), srcMesh.bindMatrix);
  setupMaterial(mesh, kind);
  parent.add(mesh);
  return mesh;
}

/** Oculta los triángulos del cuerpo tapados por la ropa (vértices originales en `hidden`). */
function hideCovered(bodyMesh, baseIndex, hidden) {
  const src = bodyMesh.geometry;
  const geo = new THREE.BufferGeometry();
  // Esta geometría se libera por instancia: sus buffers no pueden pertenecer al caché.
  for (const [k, v] of Object.entries(src.attributes)) geo.setAttribute(k, v.clone());
  geo.morphAttributes = Object.fromEntries(Object.entries(src.morphAttributes).map(([key, values]) => [key, values.map(v => v.clone())]));
  geo.boundingSphere = src.boundingSphere;
  const vid = src.attributes._vid;
  if (!hidden.size || !vid) {
    geo.setIndex(baseIndex.clone());
  } else {
    const out = [];
    const idx = baseIndex.array;
    for (let i = 0; i < idx.length; i += 3) {
      const a = idx[i], b = idx[i + 1], c = idx[i + 2];
      if (hidden.has(Math.round(vid.getX(a))) || hidden.has(Math.round(vid.getX(b))) || hidden.has(Math.round(vid.getX(c)))) continue;
      out.push(a, b, c);
    }
    geo.setIndex(out);
  }
  bodyMesh.geometry = geo;
}

// ---------- instancia ----------

async function buildInstance(catalog, look, lod = false, profile = resolveAnimationProfile(), appearance = 'default') {
  const street = appearance === 'street-preview';
  const detailPromise = street && !lod ? loadStreetSkinDetail() : Promise.resolve(null);
  const real = normalizeReal(catalog, look.real);
  const body = catalog.cuerpos.find((c) => c.sexo === real.sexo && c.edad === real.edad) ?? catalog.cuerpos[0];
  const folder = `${BASE}${body.id}/`;
  // LOD: cuerpo proxy y piezas simplificadas (si el catálogo las trae)
  const useLod = lod && body.piezas[real.ropa]?.lod;
  const parts = PART_CATS
    .map((cat) => ({ cat, info: body.piezas[real[cat]] }))
    .filter((p) => p.info?.file);
  // Las prendas no dependen de descargar el cuerpo: iniciar todo en paralelo.
  const bodyPromise = load(folder + (useLod ? 'lod/cuerpo.gltf' : 'cuerpo.gltf'));
  const [bodyGltf, sourceClips, ...partGltfs] = await Promise.all([
    bodyPromise,
    bodyPromise.then(gltf => clipsForBody(body.id + (useLod ? ':lod' : ''), gltf, profile)),
    ...parts.map((p) => load(folder + (useLod && p.info.lod ? p.info.lod : p.info.file)))
  ]);
  const detailTexture = await detailPromise;

  const root = cloneSkinned(bodyGltf.scene);
  const bones = new Map();
  let bodyMesh = null;
  root.traverse((o) => {
    if (o.isBone) bones.set(o.name, o);
    if (o.isSkinnedMesh) {
      if (o.name.toLowerCase().includes('body')) bodyMesh = o;
      setupMaterial(o, 'cuerpo');
    }
  });

  const skinTone = new THREE.Color(PALETTES.piel[look.piel] ?? PALETTES.piel[2]).lerp(new THREE.Color(1, 1, 1), 0.25);
  const hairTone = new THREE.Color(PALETTES.pelo[look.peloColor] ?? PALETTES.pelo[0]).lerp(new THREE.Color(1, 1, 1), street ? .04 : .15);
  const wear = look.desgaste ?? 0;
  const seed = Math.random() * 100;
  const streetFrame = street ? createStreetFrame(root, bones, bodyMesh) : null;
  const streetOptions = street ? {
    frame: streetFrame, wear: look.desgaste ?? DEFAULT_LOOK.desgaste, seed: streetMaterialSeed(look), detailTexture
  } : null;
  if (bodyMesh) {
    bodyMesh.material.color.copy(skinTone);
    if (street) applyStreetMaterial(bodyMesh.material, bodyMesh, { ...streetOptions, kind: 'skin' });
    else addGrime(bodyMesh.material, wear, { skin: true, seed });
  }

  const hidden = new Set();
  const hair = [], hatPositions = [];
  const uniform = look.uniforme ? new THREE.Color(look.uniforme) : null;
  parts.forEach((p, i) => {
    if (!useLod) for (const v of p.info.oculta) hidden.add(v);
    partGltfs[i].scene.traverse((o) => {
      if (!o.isSkinnedMesh) return;
      const mesh = attachPart(o, bones, bodyMesh?.parent ?? root, p.cat);
      if (p.cat === 'pelo' || p.cat === 'barba') {
        mesh.material.color.copy(hairTone);
        addHairTone(mesh.material);
        if (p.cat === 'pelo') hair.push(mesh);
      } else if (uniform && p.cat !== 'barba') {
        // uniforme: la prenda entera de un color (la textura conserva costuras y pliegues)
        mesh.material.color.copy(uniform);
      } else if (!street) {
        addGrime(mesh.material, wear, { seed });
      }
      if (street) applyStreetMaterial(mesh.material, mesh, {
        ...streetOptions,
        kind: p.cat === 'pelo' ? 'hair' : p.cat === 'barba' ? 'beard' : p.cat === 'calzado' ? 'shoes' : 'fabric'
      });
      if (p.cat === 'cabeza') for (const v of mesh.geometry.attributes.position.array) hatPositions.push(v);
    });
  });
  // el pelo que quedaría por fuera del sombrero se recorta en su borde
  if (hatPositions.length) {
    const profile = hatEdgeProfile(hatPositions);
    for (const mesh of hair) addHatClip(mesh.material, profile);
  }
  // cejas del color del pelo
  root.traverse((o) => {
    if (!o.isSkinnedMesh || !/eyebrow/.test(o.name.toLowerCase())) return;
    o.material.color.copy(hairTone);
    addHairTone(o.material);
    if (street) applyStreetMaterial(o.material, o, { ...streetOptions, kind: 'hair' });
  });
  if (street) root.traverse(mesh => {
    if (mesh.isSkinnedMesh && /(?:low-poly|eyes?)(?:_|\.|$)/i.test(mesh.name) && !/eyebrow|eyelash/i.test(mesh.name)) {
      applyStreetMaterial(mesh.material, mesh, { ...streetOptions, kind: 'eyes' });
    }
  });
  const worn = (look.accesorios ?? []).filter((id) => !useLod || FAR_ACCESSORIES.has(id));
  const accessories = worn.length ? attachAccessories(root, bones, worn, wear) : null;
  if (bodyMesh) hideCovered(bodyMesh, bodyGltf.scene.getObjectByName(bodyMesh.name)?.geometry.index ?? bodyMesh.geometry.index, hidden);

  let clips = sourceClips;
  if (isMixamoProfile(profile.id)) {
    const key = `${profile.id}:${body.id}:${!!useLod}:${parts.map(part => part.info.file).join('|')}`;
    if (!groundedClipCache.has(key)) {
      const grounded = groundMixamoClips(root, sourceClips);
      grounded.walk.userData.locomotion = measureLocomotion(bodyGltf.scene, grounded.walk, grounded.run);
      groundedClipCache.set(key, grounded);
    }
    clips = groundedClipCache.get(key);
  }

  const mixer = new THREE.AnimationMixer(root);
  const actions = {};
  for (const [name, clip] of Object.entries(clips)) {
    actions[name] = mixer.clipAction(clip);
    if (['comer', 'beber', 'lanzar', 'saludo'].includes(name)) {
      actions[name].setLoop(THREE.LoopOnce, 1);
      actions[name].clampWhenFinished = true;
    }
    // Caminar y correr avanzan por la fase compartida de update(), no por el reloj del mezclador.
    if (clips.walk?.userData.locomotion && (name === 'walk' || name === 'run')) actions[name].timeScale = 0;
    actions[name].play();
    actions[name].setEffectiveWeight(name === 'idle' ? 1 : 0);
  }
  if (useLod) root.traverse((o) => { if (o.isMesh) o.castShadow = false; }); // lejos: sin sombra propia
  // Los NPC lejanos conservan su ruta liviana, incluso si el catálogo carece de proxy.
  const secondaryMotion = lod ? null : new SecondaryMotion(bones, seed);
  const actionPose = new ActionPose(bones, { lod, frame: root });
  const groundContact = isMixamoProfile(profile.id) ? new MixamoGroundContact(root) : null;
  return { root, bones, mixer, actions, real, appearanceProfile: appearance, accessories, secondaryMotion, actionPose, groundContact, playback: {}, phase: 0, runShare: 0, ownedGeometries: bodyMesh ? [bodyMesh.geometry] : [] };
}

/** Solo recursos de instancia; los modelos y texturas del banco siguen compartidos. */
export function disposeRealisticInstance(instance) {
  if (!instance || instance.disposed) return;
  instance.disposed = true;
  instance.groundContact?.restore();
  instance.actionPose?.restore();
  instance.secondaryMotion?.restore();
  instance.weapon?.dispose();
  instance.cigarette?.dispose();
  instance.basucoProps?.dispose();
  instance.mixer.stopAllAction();
  instance.mixer.uncacheRoot(instance.root);
  const materials = new Set(), skeletons = new Set();
  instance.root.traverse(mesh => {
    if (!mesh.isMesh) return;
    for (const material of [mesh.material].flat()) materials.add(material);
    if (mesh.skeleton) skeletons.add(mesh.skeleton);
  });
  for (const material of materials) material.dispose();
  for (const skeleton of skeletons) skeleton.dispose();
  for (const geometry of instance.ownedGeometries ?? []) geometry.dispose();
  instance.root.removeFromParent();
}

/**
 * Crea el personaje. `look` es la apariencia compartida con el procedural (nombre, piel, peloColor…)
 * más `look.real` con las piezas realistas.
 */
export async function createRealisticCharacter(look = {}, { lod = false, animaciones = 'default', apariencia = 'default' } = {}) {
  const profile = resolveAnimationProfile(animaciones, MODEL_BASE);
  let appearance = resolveAppearanceProfile(apariencia);
  const catalog = await loadCatalog();
  const group = new THREE.Group();
  group.scale.setScalar(REALISTIC_SCALE);
  let inst = null;
  let token = 0;
  let disposed = false;
  const weights = {};
  let weaponId = null; // arma en mano (cuchillo, botella_picada) o null
  let smoking = null;   // qué se fuma en la mano izquierda ('cigarrillo', 'hierba') o null
  let basuco = false;   // pipa en la izquierda y encendedor en la derecha

  function syncWeapon() {
    if (!inst || inst.weaponId === weaponId) return;
    inst.weapon?.dispose();
    inst.weapon = weaponId ? attachWeapon(inst.root, inst.bones, weaponId) : null;
    inst.weaponId = weaponId;
  }

  function syncCigarette() {
    if (!inst || (inst.cigarette?.kind ?? null) === smoking) return;
    inst.cigarette?.dispose();
    inst.cigarette = smoking ? attachCigaretteToHand(inst.root, inst.bones, smoking) : null;
    if (inst.cigarette) inst.cigarette.kind = smoking;
  }

  function syncBasuco() {
    if (!inst || !!inst.basucoProps === basuco) return;
    inst.basucoProps?.dispose();
    inst.basucoProps = basuco ? attachBasucoProps(inst.root, inst.bones) : null;
  }

  async function setLook(l) {
    if (disposed) return;
    const my = ++token;
    const next = await buildInstance(catalog, l, lod, profile, appearance);
    if (my !== token || disposed) { disposeRealisticInstance(next); return; }
    disposeRealisticInstance(inst);
    inst = next;
    group.add(inst.root);
    syncWeapon();
    syncCigarette();
    syncBasuco();
    for (const k of Object.keys(weights)) delete weights[k];
    for (const k of [...Object.keys(inst.actions), LOCOMOTION]) if (k !== 'walk' && k !== 'run') weights[k] = k === 'idle' ? 1 : 0;
  }

  await setLook(look);

  return {
    group,
    animationProfile: profile.id,
    get appearanceProfile() { return inst?.appearanceProfile ?? appearance; },
    async setAppearance(value) {
      const next = resolveAppearanceProfile(value);
      if (next === appearance && inst?.appearanceProfile === next) return;
      const previous = appearance;
      appearance = next;
      try { await setLook(look); }
      catch (error) { if (appearance === next) appearance = previous; throw error; }
    },
    get animationStatus() {
      const actions = Object.entries(inst?.actions ?? {});
      return {
        profile: profile.id, source: profile.url, clips: actions.map(([name]) => name),
        clipSources: Object.fromEntries(actions.map(([name, action]) => [name, action.getClip().userData.source ?? 'default'])),
        durations: Object.fromEntries(actions.map(([name, action]) => [name, action.getClip().duration])),
        loops: Object.fromEntries(actions.map(([name, action]) => [name, action.getClip().userData.loop]))
      };
    },
    get look() { return look; },
    setLook(l) { look = l; return setLook(l); },
    /** Arma visible en la mano derecha; null para ir con las manos vacías */
    setWeapon(id) { weaponId = id || null; syncWeapon(); },
    /** Cigarrillo (o porro, con kind = 'hierba') en la mano izquierda */
    setSmoking(on, kind = 'cigarrillo') { smoking = on ? kind : null; syncCigarette(); },
    /** Brasa del cigarrillo en el mundo, o null si no está fumando */
    cigaretteTip(target) { return inst?.cigarette ? inst.cigarette.tip.getWorldPosition(target) : null; },
    /** Pipa de basuco y encendedor en las manos */
    setBasuco(on) { basuco = !!on; syncBasuco(); },
    /** Cazoleta de la pipa en el mundo, o null si no la tiene */
    pipeBowl(target) { return inst?.basucoProps ? inst.basucoProps.pipe.top.getWorldPosition(target) : null; },
    /** Boca en el mundo, para el humo de la calada */
    mouth(target) { return inst?.actionPose.mouth(target) ?? null; },
    dispose() {
      if (disposed) return;
      disposed = true; token++;
      disposeRealisticInstance(inst); inst = null;
      group.removeFromParent();
    },
    update(dt, { speed = 0, running = false, action = null, load = 0, movement = {}, actionProgress, attack = null, smoke = null, basuco: pipeT = null, look: glance = 0, point = 0 } = {}) {
      if (!inst) return;
      const a = inst.actions;
      const sourceCadence = isMixamoProfile(profile.id) && movement.previewCadence === 'source';
      const detached = movement.swimming || movement.grounded === false;
      const previewClip = isMixamoProfile(profile.id) && !!a[action];
      const poseAction = action === 'saltar' || action === 'golpear' || action === 'recibirGolpe' || (action === 'saludo' && !previewClip);
      const gaitSpeed = detached ? 0 : speed;
      const handsBlocked = detached || movement.landing > 0 || action === 'recibirGolpe' || action === 'dormir';
      const pipeAllowed = !handsBlocked && !attack && action !== 'golpear' && speed < .15 && pipeT != null;
      const smokeAllowed = !handsBlocked && !attack && action !== 'golpear' && !pipeAllowed;
      if (inst.weapon) inst.weapon.object.visible = !detached && !pipeAllowed && action !== 'dormir';
      if (inst.cigarette) inst.cigarette.object.visible = smokeAllowed;
      if (inst.basucoProps) {
        inst.basucoProps.pipe.object.visible = pipeAllowed;
        inst.basucoProps.lighter.object.visible = pipeAllowed;
      }
      // destino: acción especial si existe el clip (o su sustituto); si no, reposo o locomoción
      let target = gaitSpeed < 0.15 ? 'idle' : a.walk ? LOCOMOTION : 'idle';
      let scale = 1;
      if (action && !poseAction && !detached && speed < 0.15) {
        const [clip, clipScale = 1] = a[action] ? [action] : profile.id === 'default' ? ACTION_FALLBACKS[action] ?? [] : [];
        if (a[clip]) { target = clip; scale = clipScale; }
      }
      if (inst?.root) {
        const targetY = action === 'cagar' && !a.cagar ? -0.3 : 0;
        inst.root.position.y += (targetY - inst.root.position.y) * animationDamping(dt, 10);
      }
      preparePlayback(a, inst.playback, { target, action, progress: actionProgress, scale,
        loop: isMixamoProfile(profile.id) ? a[target]?.getClip().userData.loop : undefined });
      blendAnimationWeights(weights, target, dt, inst.playback.rate);
      const k = animationDamping(dt, 8);
      // Caminar y correr comparten fase; su mezcla depende de la velocidad para que los pies no deslicen.
      const locomotion = a.walk?.getClip().userData.locomotion;
      if (locomotion) {
        const blend = sourceCadence ? { run: running && a.run ? 1 : 0 } : locomotionBlend(gaitSpeed, locomotion);
        inst.runShare += (blend.run - inst.runShare) * k;
        // La cadencia corresponde al reparto suavizado, no al reparto futuro: evita
        // que el pie patine mientras se acelera de caminar a correr (o al frenar).
        const rate = sourceCadence
          ? (gaitSpeed < .15 ? 0 : 1 / THREE.MathUtils.lerp(locomotion.walkDuration, locomotion.runDuration ?? locomotion.walkDuration, inst.runShare))
          : locomotionRate(gaitSpeed, locomotion, inst.runShare);
        inst.phase = (inst.phase + rate * dt) % 1;
        a.walk.time = inst.phase * locomotion.walkDuration;
        if (a.run) a.run.time = inst.phase * locomotion.runDuration;
      } else {
        inst.runShare += ((running && a.run ? 1 : 0) - inst.runShare) * k;
        if (a.walk) a.walk.timeScale = sourceCadence ? 1 : THREE.MathUtils.clamp(gaitSpeed / 1.4, 0.6, 1.6);
        if (a.run) a.run.timeScale = sourceCadence ? 1 : THREE.MathUtils.clamp(gaitSpeed / 3.5, 0.7, 1.4);
      }
      const share = { walk: 1 - inst.runShare, run: inst.runShare };
      for (const key of Object.keys(a)) {
        const weight = key in share ? weights[LOCOMOTION] * share[key] : weights[key];
        a[key].enabled = weight > 0 || key === target;
        a[key].setEffectiveWeight(weight);
      }
      // Las capas se retiran en orden inverso al de composición; ningún frame deja
      // offsets sobre la base que evaluará el mezclador o leerá un futuro ragdoll.
      inst.groundContact?.restore();
      inst.actionPose.restore();
      inst.secondaryMotion?.restore();
      inst.mixer.update(dt);
      inst.secondaryMotion?.apply(dt, {
        speed: gaitSpeed, load, phase: inst.phase, turnRate: movement.turnRate,
        action: handsBlocked || attack || smoke || pipeAllowed || point ? 'gesture' : action
      });
      // Un saludo o descanso horneado es dueño de la pose; no sumar encima el
      // gesto procedural. Las acciones sin clip conservan su capa identificable.
      const overlayAction = previewClip && target === action ? 'clip' : action;
      inst.actionPose.apply(dt, { speed, running, action: overlayAction, actionProgress, movement, attack, smoke: smokeAllowed ? smoke : null, basuco: pipeAllowed ? pipeT : null, look: glance, point });
      inst.groundContact?.apply(!detached);
      inst.cigarette?.setGlow(emberGlow(smokeAllowed ? smoke?.puff : null));
      if (pipeAllowed) inst.basucoProps?.update(pipeT);
      inst.accessories?.update();
    }
  };
}
