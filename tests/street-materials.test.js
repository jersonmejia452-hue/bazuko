import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import { applyStreetMaterial, createStreetFrame, resolveAppearanceProfile, streetMaterialSeed } from '../src/character/streetMaterials.js';
import { addHairTone } from '../src/character/weathering.js';

function characterFixture() {
  const root = new THREE.Group();
  root.position.set(9, 2, -4); root.rotation.y = .5; root.scale.setScalar(1.2);
  const body = new THREE.Mesh(new THREE.BoxGeometry(1, 2, .3), new THREE.MeshStandardMaterial());
  body.position.y = 1; root.add(body);
  const eyes = new THREE.Mesh(new THREE.BoxGeometry(.12, .04, .03), new THREE.MeshStandardMaterial());
  eyes.name = 'personaje.eyes'; eyes.position.set(0, 1.8, .13); root.add(eyes);
  const bones = new Map();
  for (const [name, x, y] of [['LeftHand', .5, 1.2], ['RightHand', -.5, 1.2], ['LeftLeg', .15, .5], ['RightLeg', -.15, .5]]) {
    const bone = new THREE.Bone(); bone.name = `mixamorig${name}`; bone.position.set(x, y, 0); root.add(bone); bones.set(bone.name, bone);
  }
  root.updateMatrixWorld(true);
  return { root, body, eyes, bones, frame: createStreetFrame(root, bones, body) };
}

function compile(material) {
  const shader = { vertexShader: THREE.ShaderLib.standard.vertexShader, fragmentShader: THREE.ShaderLib.standard.fragmentShader, uniforms: {} };
  material.onBeforeCompile(shader, {});
  return shader;
}

test('el perfil y la semilla mantienen una apariencia reproducible al cambiar el orden del look', () => {
  assert.equal(resolveAppearanceProfile(), 'default');
  assert.equal(resolveAppearanceProfile('street-preview'), 'street-preview');
  assert.throws(() => resolveAppearanceProfile('../textura.png'), /Perfil de apariencia/);
  const first = { nombre: 'José', piel: 2, real: { ropa: 'chaqueta', barba: 'descuidada' } };
  const reordered = { real: { barba: 'descuidada', ropa: 'chaqueta' }, piel: 2, nombre: 'José' };
  assert.equal(streetMaterialSeed(first), streetMaterialSeed(reordered));
  assert.notEqual(streetMaterialSeed(first), streetMaterialSeed({ ...first, nombre: 'Ana' }));
});

test('el marco anatómico congela las marcas antes del skinning sin cambiar geometría ni UV', () => {
  const { root, body, bones, frame } = characterFixture();
  const positions = body.geometry.attributes.position.array.slice(), uv = body.geometry.attributes.uv.array.slice();
  applyStreetMaterial(body.material, body, { frame, kind: 'skin', wear: 2 });
  const shader = compile(body.material), matrix = shader.uniforms.uStreetRestMatrix.value;
  const top = new THREE.Vector3(0, 1, 0).applyMatrix4(matrix);
  assert.ok(Math.abs(top.y - 1) < 1e-6);
  const handBefore = frame.leftHand.toArray(), matrixBefore = matrix.toArray();
  bones.get('mixamorigLeftHand').rotation.z = .8;
  root.position.x += 3; root.updateMatrixWorld(true);
  assert.deepEqual(frame.leftHand.toArray(), handBefore);
  assert.deepEqual(matrix.toArray(), matrixBefore);
  assert.deepEqual(body.geometry.attributes.position.array, positions);
  assert.deepEqual(body.geometry.attributes.uv.array, uv);
  assert.ok(shader.vertexShader.indexOf('vStreetRest =') < shader.vertexShader.indexOf('#include <skinning_vertex>'));
});

test('los materiales conservan color elegido, transparencia y normales existentes por instancia', () => {
  const { body, frame } = characterFixture();
  const original = new THREE.MeshStandardMaterial({ color: '#41362a', map: new THREE.Texture(), normalMap: new THREE.Texture(), transparent: true, alphaTest: .08, depthWrite: false });
  const texture = new THREE.Texture();
  const own = original.clone();
  applyStreetMaterial(own, body, { frame, kind: 'skin', detailTexture: texture });
  assert.equal(own.map, original.map);
  assert.equal(own.normalMap, original.normalMap, 'normal preexistente preservada');
  assert.ok(own.color.equals(original.color));
  assert.equal(own.alphaTest, .08); assert.equal(own.transparent, true); assert.equal(own.depthWrite, false);
  assert.equal(original.roughness, 1, 'material fuente intacto');
  const skin = new THREE.MeshStandardMaterial();
  applyStreetMaterial(skin, body, { frame, kind: 'skin', detailTexture: texture });
  assert.equal(skin.normalMap, texture);
  assert.deepEqual(skin.normalScale.toArray(), [.24, .24]);
  const shoes = new THREE.MeshStandardMaterial();
  applyStreetMaterial(shoes, body, { frame, kind: 'shoes', detailTexture: texture });
  assert.equal(shoes.normalMap, null, 'microdetalle solo en piel');
});

test('el tono del cabello se evalúa antes del desgaste y los programas se comparten entre semillas', () => {
  const { body, frame } = characterFixture();
  const material = new THREE.MeshStandardMaterial({ map: new THREE.Texture(), alphaTest: .08 });
  addHairTone(material);
  applyStreetMaterial(material, body, { frame, kind: 'hair', seed: 4 });
  const shader = compile(material);
  assert.ok(shader.fragmentShader.indexOf('diffuseColor.rgb = diffuse * clamp') < shader.fragmentShader.indexOf('float streetRoughness'));
  assert.ok(shader.fragmentShader.includes('roughnessFactor *= streetRoughness'));
  const other = new THREE.MeshStandardMaterial({ map: material.map, alphaTest: .08 });
  addHairTone(other);
  applyStreetMaterial(other, body, { frame, kind: 'hair', seed: 99 });
  assert.equal(other.customProgramCacheKey(), material.customProgramCacheKey());
  assert.notEqual(compile(other).uniforms.uStreetSeed.value, shader.uniforms.uStreetSeed.value);
});

test('ojos y pestañas conservan su tratamiento independiente', () => {
  const { eyes, frame } = characterFixture();
  const lashes = new THREE.MeshStandardMaterial({ transparent: true, depthWrite: false, alphaTest: .02 });
  const lashesBefore = lashes.toJSON();
  applyStreetMaterial(eyes.material, eyes, { frame, kind: 'eyes' });
  assert.equal(eyes.material.roughness, .22);
  assert.equal(eyes.material.userData.streetSurface, 'eyes');
  assert.deepEqual(lashes.toJSON(), lashesBefore);
  assert.equal(eyes.material.onBeforeCompile, THREE.Material.prototype.onBeforeCompile);
});
