import * as THREE from 'three';

const PROFILES = new Set(['default', 'street-preview']);
const KINDS = new Set(['skin', 'fabric', 'shoes', 'hair', 'beard', 'eyes']);

export function resolveAppearanceProfile(value = 'default') {
  if (!PROFILES.has(value)) throw new Error(`Perfil de apariencia desconocido: ${value}`);
  return value;
}

/** La misma apariencia conserva sus zonas de desgaste al vestirse o volver a cargar. */
export function streetMaterialSeed(look = {}) {
  const identity = [look.nombre ?? '', look.piel ?? 2, look.peloColor ?? 0,
    ...Object.entries(look.real ?? {}).sort(([a], [b]) => a.localeCompare(b)).flat()].join('|');
  let hash = 2166136261;
  for (const char of identity) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619);
  return (hash >>> 0) % 10000 / 137;
}

/** Marco común congelado ANTES de animar. Las marcas se deforman con la superficie. */
export function createStreetFrame(root, bones, bodyMesh) {
  root.updateMatrixWorld(true);
  const rootInverse = root.matrixWorld.clone().invert();
  const bounds = new THREE.Box3();
  if (bodyMesh?.geometry?.attributes.position) {
    const localBounds = new THREE.Box3().setFromBufferAttribute(bodyMesh.geometry.attributes.position);
    bounds.copy(localBounds).applyMatrix4(rootInverse.clone().multiply(bodyMesh.matrixWorld));
  } else bounds.set(new THREE.Vector3(-.5, 0, -.1), new THREE.Vector3(.5, 1.7, .3));
  const height = Math.max(.5, bounds.max.y - bounds.min.y);
  const centerX = (bounds.max.x + bounds.min.x) * .5;
  const worldToNormalized = new THREE.Matrix4().makeScale(1 / height, 1 / height, 1 / height)
    .multiply(new THREE.Matrix4().makeTranslation(-centerX, -bounds.min.y, 0)).multiply(rootInverse);
  const landmark = (suffix, fallback) => {
    const bone = [...bones.values()].find(item => item.name.endsWith(suffix));
    return bone ? bone.getWorldPosition(new THREE.Vector3()).applyMatrix4(worldToNormalized) : new THREE.Vector3(...fallback);
  };
  const eyes = new THREE.Box3();
  root.traverse(mesh => {
    if (!mesh.isMesh || !/(?:low-poly|eyes?)(?:_|\.|$)/i.test(mesh.name) || /eyebrow|eyelash/i.test(mesh.name)) return;
    if (!mesh.geometry?.attributes.position) return;
    const localBounds = new THREE.Box3().setFromBufferAttribute(mesh.geometry.attributes.position);
    eyes.union(localBounds.applyMatrix4(worldToNormalized.clone().multiply(mesh.matrixWorld)));
  });
  const eyeCenter = eyes.isEmpty() ? new THREE.Vector3(0, .933, .075) : eyes.getCenter(new THREE.Vector3());
  const eyeWidth = eyes.isEmpty() ? .052 : eyes.max.x - eyes.min.x;
  return {
    worldToNormalized, height,
    eyes: new THREE.Vector4(eyeCenter.x, eyeCenter.y, eyeCenter.z, eyeWidth * .26),
    leftHand: landmark('LeftHand', [.28, .6, .02]), rightHand: landmark('RightHand', [-.28, .6, .02]),
    leftElbow: landmark('LeftForeArm', [.22, .73, 0]), rightElbow: landmark('RightForeArm', [-.22, .73, 0]),
    leftKnee: landmark('LeftLeg', [.06, .27, .015]), rightKnee: landmark('RightLeg', [-.06, .27, .015])
  };
}

const COMMON = /* glsl */ `
uniform float uStreetWear;
uniform float uStreetSeed;
uniform vec4 uStreetEyes;
uniform vec3 uStreetLeftHand;
uniform vec3 uStreetRightHand;
uniform vec3 uStreetLeftElbow;
uniform vec3 uStreetRightElbow;
uniform vec3 uStreetLeftKnee;
uniform vec3 uStreetRightKnee;
varying vec3 vStreetRest;
float streetHash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float streetNoise(vec2 p) {
  vec2 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(streetHash(i), streetHash(i + vec2(1.0, 0.0)), f.x),
    mix(streetHash(i + vec2(0.0, 1.0)), streetHash(i + vec2(1.0)), f.x), f.y);
}
float streetPatch(vec3 p) {
  vec2 q = vec2(p.x * 31.0 + p.z * 17.0, p.y * 37.0) + uStreetSeed;
  return (streetNoise(q) * 2.0 + streetNoise(q * 2.03 + 7.0)) / 3.0;
}
float streetSpot(vec3 p, vec3 center, vec3 radius) {
  vec3 d = (p - center) / radius;
  return 1.0 - smoothstep(0.25, 1.0, dot(d, d));
}
float streetPair(vec3 p, vec3 a, vec3 b, float radius) {
  return max(streetSpot(p, a, vec3(radius)), streetSpot(p, b, vec3(radius)));
}
`;

const SURFACES = {
  skin: /* glsl */ `
    float hands = streetPair(p, uStreetLeftHand, uStreetRightHand, .085);
    float faceFront = smoothstep(uStreetEyes.z - .018, uStreetEyes.z + .004, p.z);
    vec3 eyeOffset = vec3(uStreetEyes.w, -.012, .012);
    float underEyes = max(streetSpot(p, uStreetEyes.xyz + eyeOffset, vec3(.014, .007, .05)),
      streetSpot(p, uStreetEyes.xyz + vec3(-eyeOffset.x, eyeOffset.yz), vec3(.014, .007, .05))) * faceFront;
    float cheek = streetSpot(p, uStreetEyes.xyz + vec3(0.0, -.026, .012), vec3(.038, .026, .065)) * faceFront;
    float skinLum = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(skinLum), .12 + surfaceNoise * .055);
    diffuseColor.rgb *= vec3(.965, .995, 1.025);
    // El tono más frío se concentra bajo los ojos; el albedo conserva su detalle.
    diffuseColor.rgb *= mix(vec3(1.0), vec3(.62, .68, .76), underEyes * (.16 + .10 * uStreetWear));
    diffuseColor.rgb *= mix(vec3(1.0), vec3(1.035, .995, .98), cheek * .4);
    diffuseColor.rgb *= mix(vec3(1.0), vec3(.78, .73, .67), hands * uStreetWear * (.12 + .20 * surfaceNoise));
    streetRoughness = clamp(.72 + (surfaceNoise - .5) * .07 + hands * .055 - cheek * .045, .64, .84);
  `,
  fabric: /* glsl */ `
    float cuffs = streetPair(p, uStreetLeftHand, uStreetRightHand, .075);
    float elbows = streetPair(p, uStreetLeftElbow, uStreetRightElbow, .08);
    float knees = streetPair(p, uStreetLeftKnee, uStreetRightKnee, .085);
    float hem = (1.0 - smoothstep(.065, .16, p.y));
    float coatHem = (1.0 - smoothstep(.02, .065, abs(p.y - .48))) * (1.0 - smoothstep(.11, .19, abs(p.x)));
    float abrasion = clamp(knees * .8 + elbows * .6 + cuffs * .55 + coatHem * .25, 0.0, 1.0);
    float faded = abrasion * uStreetWear * (.45 + surfaceNoise * .35);
    float lum = dot(diffuseColor.rgb, vec3(.2126, .7152, .0722));
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum), .12 * uStreetWear);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(lum) * 1.38 + .012, faded * .48);
    diffuseColor.rgb *= 1.0 + faded * .20;
    float dust = (hem * .7 + cuffs * .22 + coatHem * .22) * uStreetWear * smoothstep(.3, .78, surfaceNoise);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.16, .135, .105), dust * .40);
    streetRoughness = clamp(.88 + abrasion * .07 + dust * .06 + (surfaceNoise - .5) * .035, .84, .99);
  `,
  shoes: /* glsl */ `
    float sole = 1.0 - smoothstep(.025, .065, p.y);
    float toe = smoothstep(.055, .115, p.z);
    float use = clamp(sole * .8 + toe * .55, 0.0, 1.0) * uStreetWear;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.19, .16, .12), use * (.19 + surfaceNoise * .14));
    diffuseColor.rgb *= 1.0 + toe * .05;
    streetRoughness = clamp(.82 + use * .12 + surfaceNoise * .035, .80, .98);
  `,
  hair: /* glsl */ `
    // La textura original aporta el detalle de mechones; el moteado solo varía su tono.
    diffuseColor.rgb *= .86 + surfaceNoise * .17;
    float silver = smoothstep(.65, .86, surfaceNoise) * (.02 + uStreetWear * .035);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.38, .40, .41), silver);
    streetRoughness = .67 + surfaceNoise * .10;
  `,
  beard: /* glsl */ `
    float roots = smoothstep(uStreetEyes.y - .09, uStreetEyes.y - .035, p.y);
    diffuseColor.rgb *= (.58 + surfaceNoise * .36) * mix(1.0, .82, roots);
    float silver = smoothstep(.61, .85, surfaceNoise) * (.02 + uStreetWear * .025);
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.35, .37, .38), silver);
    streetRoughness = .74 + surfaceNoise * .12;
  `
};

/** Aplica sobre un material de instancia. Mapas/UV/alpha/geometría permanecen compartidos. */
export function applyStreetMaterial(material, mesh, { kind, frame, wear = 2, seed = 0, detailTexture = null } = {}) {
  if (!KINDS.has(kind)) throw new Error(`Superficie de personaje desconocida: ${kind}`);
  material.metalness = 0;
  material.userData.appearanceProfile = 'street-preview';
  material.userData.streetSurface = kind;
  if (kind === 'eyes') {
    material.roughness = .22;
    return;
  }
  if (!frame?.worldToNormalized) throw new Error('El material necesita el marco de reposo del personaje.');
  material.roughness = kind === 'skin' ? .72 : kind === 'hair' ? .72 : kind === 'beard' ? .80 : .9;
  if (kind === 'skin' && detailTexture && !material.normalMap) {
    material.normalMap = detailTexture;
    material.normalScale.set(.24, .24);
  }
  mesh.updateWorldMatrix(true, false);
  const restMatrix = frame.worldToNormalized.clone().multiply(mesh.matrixWorld);
  const previous = material.onBeforeCompile;
  const previousKey = material.customProgramCacheKey?.() ?? '';
  material.onBeforeCompile = (shader, renderer) => {
    previous?.call(material, shader, renderer);
    Object.assign(shader.uniforms, {
      uStreetRestMatrix: { value: restMatrix },
      uStreetWear: { value: THREE.MathUtils.clamp(wear / 2, 0, 1) },
      uStreetSeed: { value: seed },
      uStreetEyes: { value: frame.eyes },
      ...Object.fromEntries(['leftHand', 'rightHand', 'leftElbow', 'rightElbow', 'leftKnee', 'rightKnee']
        .map(name => [`uStreet${name[0].toUpperCase()}${name.slice(1)}`, { value: frame[name] }]))
    });
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nuniform mat4 uStreetRestMatrix;\nvarying vec3 vStreetRest;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvStreetRest = (uStreetRestMatrix * vec4(position, 1.0)).xyz;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\n${COMMON}`)
      .replace('#include <color_fragment>', `#include <color_fragment>\nfloat streetRoughness = roughness;\n{
        vec3 p = vStreetRest; float surfaceNoise = streetPatch(p);\n${SURFACES[kind]}\n}`)
      .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\nroughnessFactor *= streetRoughness / max(roughness, .001);');
  };
  material.customProgramCacheKey = () => `${previousKey}|street:v1:${kind}`;
  material.needsUpdate = true;
}
