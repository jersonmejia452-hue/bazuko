// src/steampunk/core.js
// Primitivas geométricas reutilizables para el vertical slice steampunk.
// Optimizado para low-poly (PS1 estilizado): pocos segmentos, flat shading.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * Caja con bisel en las esquinas (chamfered box).
 * Más interesante visualmente que un BoxGeometry plano.
 * @param {number} w - ancho
 * @param {number} h - alto
 * @param {number} d - profundidad
 * @param {number} bevel - tamaño del bisel (0 = caja normal)
 * @returns {THREE.BufferGeometry}
 */
export function beveledBox(w, h, d, bevel = 0.05) {
  const b = Math.min(bevel, w / 2, h / 2, d / 2);
  const shapes = [];

  // Centro
  shapes.push(new THREE.BoxGeometry(w - 2 * b, h - 2 * b, d - 2 * b));

  // Caras (6)
  shapes.push(new THREE.BoxGeometry(w - 2 * b, h - 2 * b, b).translate(0, 0, (d - b) / 2));
  shapes.push(new THREE.BoxGeometry(w - 2 * b, h - 2 * b, b).translate(0, 0, -(d - b) / 2));
  shapes.push(new THREE.BoxGeometry(b, h - 2 * b, d - 2 * b).translate((w - b) / 2, 0, 0));
  shapes.push(new THREE.BoxGeometry(b, h - 2 * b, d - 2 * b).translate(-(w - b) / 2, 0, 0));
  shapes.push(new THREE.BoxGeometry(w - 2 * b, b, d - 2 * b).translate(0, (h - b) / 2, 0));
  shapes.push(new THREE.BoxGeometry(w - 2 * b, b, d - 2 * b).translate(0, -(h - b) / 2, 0));

  // Aristas (12)
  const edgeX = new THREE.BoxGeometry(b, b, d - 2 * b);
  const edgeY = new THREE.BoxGeometry(w - 2 * b, b, b);
  const edgeZ = new THREE.BoxGeometry(b, h - 2 * b, b);

  shapes.push(edgeX.clone().translate((w - b) / 2, (h - b) / 2, 0));
  shapes.push(edgeX.clone().translate(-(w - b) / 2, (h - b) / 2, 0));
  shapes.push(edgeX.clone().translate((w - b) / 2, -(h - b) / 2, 0));
  shapes.push(edgeX.clone().translate(-(w - b) / 2, -(h - b) / 2, 0));

  shapes.push(edgeY.clone().translate((w - b) / 2, 0, (d - b) / 2));
  shapes.push(edgeY.clone().translate(-(w - b) / 2, 0, (d - b) / 2));
  shapes.push(edgeY.clone().translate((w - b) / 2, 0, -(d - b) / 2));
  shapes.push(edgeY.clone().translate(-(w - b) / 2, 0, -(d - b) / 2));

  shapes.push(edgeZ.clone().translate(0, (h - b) / 2, (d - b) / 2));
  shapes.push(edgeZ.clone().translate(0, -(h - b) / 2, (d - b) / 2));
  shapes.push(edgeZ.clone().translate(0, (h - b) / 2, -(d - b) / 2));
  shapes.push(edgeZ.clone().translate(0, -(h - b) / 2, -(d - b) / 2));

  // Esquinas (8)
  const corner = new THREE.BoxGeometry(b, b, b);
  const corners = [
    [1, 1, 1], [-1, 1, 1], [1, -1, 1], [-1, -1, 1],
    [1, 1, -1], [-1, 1, -1], [1, -1, -1], [-1, -1, -1]
  ];
  for (const [sx, sy, sz] of corners) {
    shapes.push(corner.clone().translate(
      sx * (w - b) / 2, sy * (h - b) / 2, sz * (d - b) / 2
    ));
  }

  return mergeGeometries(shapes);
}

/**
 * Cilindro de bajo poligonaje (estilo PS1).
 * @param {number} radiusTop
 * @param {number} radiusBottom
 * @param {number} height
 * @param {number} segments - lados (8 por defecto)
 */
export function lowPolyCylinder(radiusTop, radiusBottom, height, segments = 8) {
  return new THREE.CylinderGeometry(radiusTop, radiusBottom, height, segments);
}

/**
 * Tubo (cilindro hueco visual) - se construye con un cilindro exterior.
 * Para un look de tubería steampunk.
 */
export function pipe(radius, length, segments = 8) {
  const geo = lowPolyCylinder(radius, radius, length, segments);
  geo.rotateX(Math.PI / 2);
  return geo;
}

/**
 * Caldera / cilindro con tapas biseladas y anillos de refuerzo.
 * @param {number} radius
 * @param {number} height
 * @param {number} rings - número de anillos de refuerzo
 */
export function boiler(radius, height, rings = 3) {
  const shapes = [];
  shapes.push(lowPolyCylinder(radius, radius, height, 10));

  // Tapas ligeramente abultadas
  const capGeo = lowPolyCylinder(radius * 1.05, radius, 0.1, 10);
  shapes.push(capGeo.clone().translate(0, height / 2, 0));
  shapes.push(capGeo.clone().translate(0, -height / 2, 0));

  // Anillos de refuerzo
  const ringGeo = lowPolyCylinder(radius * 1.12, radius * 1.12, 0.08, 10);
  for (let i = 0; i < rings; i++) {
    const t = (i + 1) / (rings + 1);
    shapes.push(ringGeo.clone().translate(0, -height / 2 + height * t, 0));
  }

  return mergeGeometries(shapes);
}

/**
 * Ventana enrejada (marco + barrotes verticales + cristal).
 * @param {number} w
 * @param {number} h
 * @param {number} bars - número de barrotes
 * @returns {THREE.Group}
 */
export function barredWindow(w, h, bars = 3) {
  const group = new THREE.Group();

  // Marco
  const frameThick = 0.06;
  const frameMat = null; // se asigna externamente si se desea
  const frameTop = new THREE.Mesh(
    new THREE.BoxGeometry(w, frameThick, frameThick)
  );
  frameTop.position.y = h / 2;
  group.add(frameTop);

  const frameBottom = frameTop.clone();
  frameBottom.position.y = -h / 2;
  group.add(frameBottom);

  const frameSide = new THREE.Mesh(
    new THREE.BoxGeometry(frameThick, h, frameThick)
  );
  const frameLeft = frameSide.clone();
  frameLeft.position.x = -w / 2;
  group.add(frameLeft);

  const frameRight = frameSide.clone();
  frameRight.position.x = w / 2;
  group.add(frameRight);

  // Barrotes
  const barGeo = new THREE.BoxGeometry(0.03, h * 0.92, 0.02);
  for (let i = 1; i <= bars; i++) {
    const bar = new THREE.Mesh(barGeo);
    bar.position.x = -w / 2 + (w / (bars + 1)) * i;
    group.add(bar);
  }

  // Cristal
  const glass = new THREE.Mesh(
    new THREE.PlaneGeometry(w * 0.92, h * 0.92)
  );
  glass.position.z = 0.01;
  group.add(glass);

  return group;
}

/**
 * Rueda industrial de bajo poligonaje.
 * Prisma hexagonal u octogonal con llantas y tacos.
 * @param {number} radius
 * @param {number} width
 * @param {number} sides - 6 u 8
 * @param {boolean} tread - añadir tacos de rodadura
 * @returns {THREE.BufferGeometry}
 */
export function industrialWheel(radius, width, sides = 8, tread = true) {
  const shapes = [];

  // Cuerpo principal (prisma)
  const body = new THREE.CylinderGeometry(radius, radius, width, sides);
  body.rotateZ(Math.PI / 2);
  shapes.push(body);

  if (tread) {
    // Tacos de rodadura alrededor del perímetro
    const treadGeo = new THREE.BoxGeometry(0.08, width * 1.05, radius * 0.25);
    for (let i = 0; i < sides; i++) {
      const angle = (i / sides) * Math.PI * 2;
      const t = treadGeo.clone();
      t.translate(
        Math.cos(angle) * radius * 0.95,
        Math.sin(angle) * radius * 0.95,
        0
      );
      t.rotateZ(angle + Math.PI / 2);
      shapes.push(t);
    }
  }

  // Cubo central (eje)
  const hub = new THREE.CylinderGeometry(radius * 0.3, radius * 0.3, width * 1.1, 6);
  hub.rotateZ(Math.PI / 2);
  shapes.push(hub);

  return mergeGeometries(shapes);
}

/**
 * Chimenea industrial con salida de vapor geométrica.
 * @param {number} height
 * @param {number} radius
 * @returns {THREE.Group}
 */
export function chimney(height, radius = 0.25) {
  const group = new THREE.Group();

  // Cuerpo de la chimenea (ligeramente cónico)
  const body = new THREE.Mesh(
    lowPolyCylinder(radius, radius * 1.2, height, 8)
  );
  body.position.y = height / 2;
  group.add(body);

  // Boca superior ensanchada
  const mouth = new THREE.Mesh(
    lowPolyCylinder(radius * 1.4, radius, 0.15, 8)
  );
  mouth.position.y = height;
  group.add(mouth);

  // Base reforzada
  const base = new THREE.Mesh(
    lowPolyCylinder(radius * 1.5, radius * 1.3, 0.2, 8)
  );
  base.position.y = 0.1;
  group.add(base);

  return group;
}

/**
 * Techo a dos aguas (gable roof).
 * @param {number} w - ancho
 * @param {number} d - profundidad
 * @param {number} height - altura del techo
 * @returns {THREE.BufferGeometry}
 */
export function gableRoof(w, d, height) {
  const shapes = [];

  // Dos planos inclinados
  const halfW = w / 2;
  const slopeLen = Math.sqrt(halfW * halfW + height * height);
  const slopeAngle = Math.atan2(height, halfW);

  const slopeGeo = new THREE.BoxGeometry(slopeLen, 0.08, d);

  const leftSlope = slopeGeo.clone();
  leftSlope.rotateZ(-slopeAngle);
  leftSlope.position.set(-halfW / 2, height / 2, 0);
  shapes.push(leftSlope);

  const rightSlope = slopeGeo.clone();
  rightSlope.rotateZ(slopeAngle);
  rightSlope.position.set(halfW / 2, height / 2, 0);
  shapes.push(rightSlope);

  // Frontón triangular (dos extremos)
  const gableGeo = new THREE.BufferGeometry();
  const vertices = new Float32Array([
    -halfW, 0, 0,   halfW, 0, 0,   0, height, 0
  ]);
  gableGeo.setAttribute('position', new THREE.BufferAttribute(vertices, 3));
  gableGeo.computeVertexNormals();

  const frontGable = gableGeo.clone();
  frontGable.translate(0, 0, d / 2);
  shapes.push(frontGable);

  const backGable = gableGeo.clone();
  backGable.translate(0, 0, -d / 2);
  shapes.push(backGable);

  return mergeGeometries(shapes);
}

/**
 * Crea un grupo con varios meshes aplicando un material a todos.
 * Helper para construir compuestos rápidamente.
 */
export function applyMaterialToGroup(group, material) {
  group.traverse((o) => {
    if (o.isMesh) o.material = material;
  });
  return group;
}

/**
 * Fusiona un array de meshes en una sola geometría.
 * Útil para unir partes que comparten material (optimización).
 */
export function mergeMeshes(meshes) {
  const geos = meshes.map((m) => {
    m.updateMatrix();
    return m.geometry.clone().applyMatrix4(m.matrix);
  });
  return mergeGeometries(geos);
}
