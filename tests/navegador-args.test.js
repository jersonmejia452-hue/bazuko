import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  ARGS_SWIFTSHADER, VARIABLE_NAVEGADOR, argsNavegador, argsPlaywrightGpu,
  fusionarArgsNavegador, partirArgsNavegador
} from '../tools/navegador-args.mjs';

// Capturado de playwright.config.js antes de unificar, línea:
// launchOptions: { args: process.env.PLAYWRIGHT_GPU === '1' ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] }
function argsPlaywrightAntes(env) {
  return env.PLAYWRIGHT_GPU === '1' ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'];
}

function azar(semilla) {
  let a = semilla >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function entero(rnd, min, max) {
  return min + Math.floor(rnd() * (max - min + 1));
}

test('sin BAZUKO_NAVEGADOR_ARGS, PLAYWRIGHT_GPU da lo mismo que el config de hoy', () => {
  const casos = {
    unset: {},
    '0': { PLAYWRIGHT_GPU: '0' },
    '1': { PLAYWRIGHT_GPU: '1' }
  };
  const esperados = {
    unset: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    '0': ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'],
    '1': []
  };
  for (const [nombre, env] of Object.entries(casos)) {
    assert.deepEqual(argsPlaywrightAntes(env), esperados[nombre], `captura ${nombre}`);
    assert.deepEqual(argsPlaywrightGpu(env), argsPlaywrightAntes(env), `gpu ${nombre}`);
    assert.deepEqual(argsNavegador(env), argsPlaywrightAntes(env), `lanzamiento ${nombre}`);
  }
  assert.deepEqual(ARGS_SWIFTSHADER, esperados.unset);
});

test('cualquier PLAYWRIGHT_GPU distinto de 1 sigue igual que hoy si la variable no está, semilla 20261118', () => {
  const rnd = azar(20261118);
  const valores = ['', '0', '2', 'true', 'yes', 'GPU', 'metal', 'unset-like'];
  for (let i = 0; i < 200; i++) {
    const valor = rnd() < .2 ? valores[entero(rnd, 0, valores.length - 1)] : textoCorto(rnd);
    const env = { PLAYWRIGHT_GPU: valor };
    if (valor === '1') env.PLAYWRIGHT_GPU = '01';
    assert.notEqual(env.PLAYWRIGHT_GPU, '1');
    assert.deepEqual(argsNavegador(env), argsPlaywrightAntes(env));
    assert.deepEqual(argsNavegador(env), [...ARGS_SWIFTSHADER]);
  }
  assert.deepEqual(argsNavegador({ PLAYWRIGHT_GPU: '1' }), []);
});

function textoCorto(rnd) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789';
  let s = '';
  const n = entero(rnd, 1, 8);
  for (let i = 0; i < n; i++) s += abc[entero(rnd, 0, abc.length - 1)];
  return s;
}

test('BAZUKO_NAVEGADOR_ARGS se aplica encima de PLAYWRIGHT_GPU y --use-angle=metal llega a Chromium', () => {
  assert.deepEqual(
    argsNavegador({ PLAYWRIGHT_GPU: '1', [VARIABLE_NAVEGADOR]: '--use-angle=metal' }),
    ['--use-angle=metal']
  );
  assert.deepEqual(
    argsNavegador({ [VARIABLE_NAVEGADOR]: '--use-angle=metal' }),
    ['--use-angle=metal']
  );
  assert.deepEqual(
    argsNavegador({ PLAYWRIGHT_GPU: '1', [VARIABLE_NAVEGADOR]: '' }),
    []
  );
  assert.deepEqual(
    argsNavegador({ [VARIABLE_NAVEGADOR]: '' }),
    [...ARGS_SWIFTSHADER]
  );
  assert.deepEqual(
    argsNavegador({ [VARIABLE_NAVEGADOR]: '--no-sandbox' }),
    ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox']
  );
  assert.deepEqual(
    argsNavegador({ PLAYWRIGHT_GPU: '1', [VARIABLE_NAVEGADOR]: '--no-sandbox --use-angle=metal' }),
    ['--no-sandbox', '--use-angle=metal']
  );
  assert.deepEqual(
    argsNavegador({ [VARIABLE_NAVEGADOR]: '--use-angle=metal --enable-unsafe-swiftshader' }),
    ['--use-angle=metal', '--enable-unsafe-swiftshader']
  );
});

test('partir y fusionar argumentos del navegador se sostienen con entradas generadas, semilla 20261118', () => {
  const rnd = azar(20261118);
  const banderas = ['--use-angle', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--window-size', '--foo'];
  const valores = ['metal', 'swiftshader', 'gl', '1', '1280,800', 'bar', 'vulkan'];

  assert.deepEqual(partirArgsNavegador('--use-angle=metal --no-sandbox'), ['--use-angle=metal', '--no-sandbox']);
  assert.deepEqual(partirArgsNavegador(" --foo='a b' --bar=\"c d\" "), ['--foo=a b', '--bar=c d']);
  assert.deepEqual(partirArgsNavegador(''), []);
  assert.deepEqual(partirArgsNavegador(null), []);

  for (let i = 0; i < 200; i++) {
    const armar = (n) => {
      const lista = [];
      for (let k = 0; k < n; k++) {
        const flag = banderas[entero(rnd, 0, banderas.length - 1)];
        lista.push(flag === '--enable-unsafe-swiftshader' || flag === '--no-sandbox' || rnd() < .3
          ? flag
          : `${flag}=${valores[entero(rnd, 0, valores.length - 1)]}`);
      }
      return lista;
    };
    const base = armar(entero(rnd, 0, 6));
    const extra = armar(entero(rnd, 0, 6));
    const fusion = fusionarArgsNavegador(base, extra);
    const ultimo = new Map();
    for (const arg of [...base, ...extra]) {
      const clave = arg.startsWith('--') && arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
      ultimo.set(clave, arg);
    }
    assert.deepEqual(new Set(fusion), new Set(ultimo.values()));
    for (const arg of fusion) {
      const clave = arg.startsWith('--') && arg.includes('=') ? arg.slice(0, arg.indexOf('=')) : arg;
      assert.equal(arg, ultimo.get(clave), `la última mención de ${clave} debe quedar`);
    }
    assert.equal(fusion.length, ultimo.size);

    const gpu = rnd() < .3 ? '1' : (rnd() < .5 ? '0' : undefined);
    const envLista = armar(entero(rnd, 0, 4));
    const env = gpu === undefined ? { [VARIABLE_NAVEGADOR]: envLista.join(' ') } : { PLAYWRIGHT_GPU: gpu, [VARIABLE_NAVEGADOR]: envLista.join(' ') };
    const resuelto = argsNavegador(env);
    const baseGpu = argsPlaywrightGpu(env);
    let esperado = fusionarArgsNavegador(baseGpu, envLista);
    const angulo = [...esperado].reverse().find((arg) => arg.startsWith('--use-angle'));
    if (angulo && !/swiftshader/i.test(angulo) && !envLista.includes('--enable-unsafe-swiftshader')) {
      esperado = esperado.filter((arg) => arg !== '--enable-unsafe-swiftshader');
    }
    assert.deepEqual(resuelto, esperado);
  }
});
