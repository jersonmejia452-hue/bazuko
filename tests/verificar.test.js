import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ZONA_NOMBRES, zonaDe } from '../src/ui/ZonaAviso.js';
import { LAKE_PARK } from '../src/world/bogota/LakePark.js';
import {
  ARGS_NAVEGADOR_PREDETERMINADOS, TOPE_MS, VARIABLE_NAVEGADOR, argsNavegadorDeCli,
  fusionarArgsNavegador, parsearCli, partirArgsNavegador, resolverArgsNavegador
} from '../tools/verificar/args.mjs';
import {
  catalogoEscenas, listarEscenas, nombresEscenas, normalizarNombre, puntoEnZona, resolverEscena
} from '../tools/verificar/escenas.mjs';

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

function textoAzar(rnd, largo) {
  const abc = 'abcdefghijklmnopqrstuvwxyz0123456789-áéíóú ';
  let s = '';
  for (let i = 0; i < largo; i++) s += abc[entero(rnd, 0, abc.length - 1)];
  return s;
}

test('el catálogo incluye las zonas del juego y las pantallas de entrada, sin otra lista', () => {
  const catalogo = catalogoEscenas();
  assert.equal(catalogo.creador.tipo, 'entrada');
  assert.equal(catalogo.nota.tipo, 'entrada');
  for (const [id, titulo] of Object.entries(ZONA_NOMBRES)) {
    assert.equal(catalogo[id].tipo, 'zona');
    assert.equal(catalogo[id].titulo, titulo);
  }
  assert.equal(nombresEscenas().length, 2 + Object.keys(ZONA_NOMBRES).length);
  const lista = listarEscenas();
  for (const id of nombresEscenas()) assert.match(lista, new RegExp(`\\b${id}\\b`));
});

test('los nombres de escena, con mayúsculas o tildes, se resuelven al identificador, semilla 20261118', () => {
  const rnd = azar(20261118);
  const catalogo = catalogoEscenas();
  for (let i = 0; i < 200; i++) {
    const id = nombresEscenas()[entero(rnd, 0, nombresEscenas().length - 1)];
    const escena = catalogo[id];
    const crudo = rnd() < .5 ? id : escena.titulo;
    const mezclado = [...crudo].map((c) => (rnd() < .5 ? c.toUpperCase() : c.toLowerCase())).join('');
    const resuelto = resolverEscena(mezclado, catalogo);
    assert.equal(resuelto.id, id, mezclado);
    assert.equal(resuelto.tipo, escena.tipo);
    assert.equal(resuelto.titulo, escena.titulo);
  }
});

test('cualquier nombre que no esté en el catálogo se rechaza, semilla 20261118, 300 casos', () => {
  const rnd = azar(20261118);
  const catalogo = catalogoEscenas();
  const validos = new Set();
  for (const [id, escena] of Object.entries(catalogo)) {
    validos.add(normalizarNombre(id));
    validos.add(normalizarNombre(escena.titulo));
  }
  let rechazados = 0;
  for (let i = 0; i < 400 && rechazados < 300; i++) {
    const nombre = textoAzar(rnd, entero(rnd, 1, 24));
    if (validos.has(normalizarNombre(nombre))) continue;
    assert.throws(() => resolverEscena(nombre, catalogo), /Escena desconocida/);
    rechazados++;
  }
  assert.equal(rechazados, 300);
  assert.throws(() => resolverEscena('', catalogo), /Falta --escena/);
  assert.throws(() => resolverEscena('   ', catalogo), /Falta --escena/);
});

test('partir, fusionar y resolver los argumentos del navegador se sostienen con entradas generadas, semilla 20261118', () => {
  const rnd = azar(20261118);
  const banderas = ['--use-angle', '--enable-unsafe-swiftshader', '--no-sandbox', '--disable-dev-shm-usage', '--window-size', '--foo'];
  const valores = ['metal', 'swiftshader', 'gl', '1', '1280,800', 'bar', 'vulkan'];

  assert.deepEqual(resolverArgsNavegador({}), [...ARGS_NAVEGADOR_PREDETERMINADOS]);
  assert.deepEqual(resolverArgsNavegador({ cli: [], envTexto: undefined }), [...ARGS_NAVEGADOR_PREDETERMINADOS]);
  assert.deepEqual(resolverArgsNavegador({ cli: [], envTexto: '' }), []);
  assert.deepEqual(resolverArgsNavegador({ cli: ['--use-angle=metal'] }), ['--use-angle=metal']);
  assert.deepEqual(
    resolverArgsNavegador({ envTexto: '--use-angle=swiftshader --no-sandbox', cli: ['--use-angle=metal'] }),
    ['--use-angle=metal', '--no-sandbox']
  );
  assert.deepEqual(partirArgsNavegador('--use-angle=metal --no-sandbox'), ['--use-angle=metal', '--no-sandbox']);
  assert.deepEqual(partirArgsNavegador(" --foo='a b' --bar=\"c d\" "), ['--foo=a b', '--bar=c d']);

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

    const envLista = armar(entero(rnd, 0, 4));
    const cliLista = armar(entero(rnd, 0, 4));
    const resuelto = resolverArgsNavegador({ envTexto: envLista.join(' '), cli: cliLista });
    assert.deepEqual(resuelto, fusionarArgsNavegador(envLista, cliLista));
  }
});

test('parsearCli lee --escena, --navegador-args, la variable y lo que va después de --, semilla 20261118', () => {
  const rnd = azar(20261118);
  const ids = nombresEscenas();
  for (let i = 0; i < 200; i++) {
    const id = ids[entero(rnd, 0, ids.length - 1)];
    const salida = `work/out-${i}`;
    const url = `http://127.0.0.1:${entero(rnd, 1024, 9999)}/`;
    const ventana = rnd() < .5;
    const extra = [];
    const nExtra = entero(rnd, 0, 3);
    for (let k = 0; k < nExtra; k++) extra.push(`--opt-${k}=${entero(rnd, 1, 9)}`);
    const nav = [`--use-angle=${rnd() < .5 ? 'metal' : 'swiftshader'}`];
    const argv = ['--escena', id, '--salida', salida, '--url', url, '--navegador-args', nav[0]];
    if (ventana) argv.push('--ventana');
    if (extra.length) argv.push('--', ...extra);
    const cli = parsearCli(argv);
    assert.equal(cli.escena, id);
    assert.equal(cli.salida, salida);
    assert.equal(cli.url, url);
    assert.equal(cli.ventana, ventana);
    assert.deepEqual(cli.navegadorArgs, nav);
    assert.deepEqual(cli.extraNavegador, extra);
    const env = rnd() < .5 ? { [VARIABLE_NAVEGADOR]: '--no-sandbox' } : {};
    const args = argsNavegadorDeCli(cli, env);
    const esperados = Object.hasOwn(env, VARIABLE_NAVEGADOR) || nav.length || extra.length
      ? fusionarArgsNavegador(partirArgsNavegador(env[VARIABLE_NAVEGADOR] ?? ''), [...nav, ...extra])
      : [...ARGS_NAVEGADOR_PREDETERMINADOS];
    assert.deepEqual(args, esperados);
  }
  const vacio = parsearCli([]);
  assert.equal(vacio.escena, undefined);
  assert.equal(vacio.listar, false);
  assert.equal(vacio.ayuda, false);
  assert.deepEqual(argsNavegadorDeCli(vacio, {}), [...ARGS_NAVEGADOR_PREDETERMINADOS]);
  assert.deepEqual(argsNavegadorDeCli(vacio, { [VARIABLE_NAVEGADOR]: '' }), []);
  assert.deepEqual(parsearCli(['--navegador-args', '--use-angle=metal']).navegadorArgs, ['--use-angle=metal']);
  assert.deepEqual(parsearCli(['--navegador-args=--use-angle=metal']).navegadorArgs, ['--use-angle=metal']);
  assert.throws(() => parsearCli(['--desconocido']), /desconocido|Unknown|parse/i);
});

test('puntoEnZona usa zonaDe y encuentra un sitio de cada zona del catálogo, semilla 20261118', () => {
  const rnd = azar(20261118);
  const zonas = Object.keys(ZONA_NOMBRES);
  for (let t = 0; t < 80; t++) {
    const celdas = new Map();
    const district = {
      width: 200,
      height: 200,
      isWalkableAt(x, z) { return Math.round(x + z) % 2 === 0; },
      getGroundHeight() { return 0; },
      _zoneAt(x, z) {
        const clave = `${Math.round(x / 4) * 4},${Math.round(z / 4) * 4}`;
        return celdas.get(clave) ?? 'andenes';
      }
    };
    const asignadas = new Map();
    for (const zona of zonas) {
      let x, z, clave;
      do {
        x = entero(rnd, 0, 49) * 4;
        z = entero(rnd, 0, 49) * 4;
        clave = `${x},${z}`;
      } while (asignadas.has(clave) || (z >= LAKE_PARK.z0 && z <= LAKE_PARK.z1 && x < 256));
      if (zona === 'lago') {
        x = entero(rnd, 0, 20) * 4;
        z = LAKE_PARK.z0 + entero(rnd, 0, 10) * 4;
        if (z > LAKE_PARK.z1) z = LAKE_PARK.z0;
        clave = `${x},${z}`;
      } else {
        celdas.set(clave, zona);
      }
      asignadas.set(clave, zona);
    }
    for (const zona of zonas) {
      const punto = puntoEnZona(district, zona, { paso: 4 });
      assert.ok(punto, `falta un punto para ${zona} en el caso ${t}`);
      assert.equal(zonaDe(district, punto.x, punto.z), zona, `${zona} en (${punto.x},${punto.z})`);
    }
  }
});

test('el tope de una escena es de cinco minutos y no una espera fija', () => {
  assert.equal(TOPE_MS, 5 * 60 * 1000);
});
