// Abre una escena del juego, espera a que el propio juego diga que está lista,
// guarda una captura y escribe los errores de la consola.
import { execSync, spawn } from 'node:child_process';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from '@playwright/test';
import { argsNavegador } from './navegador-args.mjs';
import {
  AYUDA, TOPE_MS, URL_PREDETERMINADA, asegurarTope, parsearCli
} from './verificar/args.mjs';
import { listarEscenas, nombresEscenas, resolverEscena } from './verificar/escenas.mjs';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export { catalogoEscenas, listarEscenas, nombresEscenas, resolverEscena } from './verificar/escenas.mjs';
export { AYUDA, TOPE_MS, parsearCli } from './verificar/args.mjs';
export { argsNavegador, VARIABLE_NAVEGADOR } from './navegador-args.mjs';

async function responde(url) {
  try {
    const res = await fetch(url, { redirect: 'manual' });
    return res.ok || (res.status >= 300 && res.status < 500);
  } catch {
    return false;
  }
}

async function esperarUrl(url, inicio, que = 'El servidor') {
  while (!(await responde(url))) {
    asegurarTope(inicio, que);
    await new Promise((r) => setTimeout(r, 20));
  }
}

function matarArbol(pid) {
  let hijos = [];
  try {
    hijos = execSync(`pgrep -P ${Number(pid)}`, { encoding: 'utf8' }).trim().split(/\s+/).filter(Boolean);
  } catch { /* sin hijos */ }
  for (const hijo of hijos) matarArbol(Number(hijo));
  try { process.kill(pid, 'SIGTERM'); } catch { /* ya no está */ }
}

async function asegurarServidor(url, inicio) {
  if (await responde(url)) return { propio: false };
  if (new URL(url).href !== new URL(URL_PREDETERMINADA).href) {
    await esperarUrl(url, inicio, 'El servidor indicado en --url');
    return { propio: false };
  }
  const hijo = spawn('npm', ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '5188', '--strictPort'], {
    cwd: REPO,
    stdio: ['ignore', 'pipe', 'pipe']
  });
  let salida = '';
  let listo = false;
  hijo.stdout.on('data', (d) => { salida += d; });
  hijo.stderr.on('data', (d) => { salida += d; });
  const muerto = new Promise((_, reject) => {
    hijo.once('error', (error) => { if (!listo) reject(error); });
    hijo.once('exit', (code) => {
      if (!listo && code) reject(new Error(`Vite salió con código ${code}.\n${salida.trim()}`));
    });
  });
  try {
    await Promise.race([esperarUrl(url, inicio, 'Vite'), muerto]);
    listo = true;
  } catch (error) {
    matarArbol(hijo.pid);
    throw error;
  }
  return { propio: true, hijo };
}

function registrarErrores(page, registros) {
  page.on('console', (msg) => {
    if (msg.type() === 'error' || msg.type() === 'warning') {
      registros.push({ tipo: msg.type(), origen: 'consola', texto: msg.text() });
    }
  });
  page.on('pageerror', (error) => {
    registros.push({ tipo: 'error', origen: 'pagina', texto: String(error) });
  });
  page.on('response', (response) => {
    if (response.status() >= 400) {
      registros.push({ tipo: 'error', origen: 'recurso', texto: `${response.status()} ${response.url()}` });
    }
  });
}

function textoRegistro(registros) {
  if (!registros.length) return '';
  return registros.map((r) => `[${r.origen}] ${r.tipo}: ${r.texto}`).join('\n') + '\n';
}

async function esperar(page, predicado, inicio, que, arg) {
  const timeout = asegurarTope(inicio, que);
  try {
    await page.waitForFunction(predicado, arg, { timeout });
  } catch (error) {
    asegurarTope(inicio, que);
    throw error;
  }
}

async function abrirHasta(page, escena, inicio) {
  await page.addInitScript(() => {
    try { localStorage.clear(); } catch { /* sin almacenamiento */ }
  });
  await page.goto('/', { waitUntil: 'commit', timeout: asegurarTope(inicio, 'La página') });
  await page.locator('#creator-modal').waitFor({ state: 'visible', timeout: asegurarTope(inicio, 'El creador') });
  await page.locator('#creator-wait').waitFor({ state: 'hidden', timeout: asegurarTope(inicio, 'El personaje del creador') });
  if (escena.id === 'creador') return;

  await page.locator('#cr-name').fill('Parcero QA');
  await page.locator('#creator-done').click();
  await page.locator('#loading-screen').waitFor({ state: 'hidden', timeout: asegurarTope(inicio, 'La carga') });
  const continuar = page.getByRole('button', { name: 'Continuar jugando', exact: true });
  await continuar.waitFor({ state: 'visible', timeout: asegurarTope(inicio, 'La nota del desarrollador') });
  if (escena.id === 'nota') return;

  await continuar.click();
  await esperar(page, () => {
    const game = window.__game;
    return !!(game && game._running && !game._loading && !game.paused);
  }, inicio, 'La partida');
  await page.locator('#game-canvas').waitFor({ state: 'visible', timeout: asegurarTope(inicio, 'La partida') });
  if (escena.tipo !== 'zona') return;

  const llegada = await page.evaluate(async (zona) => {
    const { puntoEnZona, zonaDe } = await import('/tools/verificar/escenas.mjs');
    const game = window.__game;
    const district = game.world.active;
    const aqui = zonaDe(district, game.player.position.x, game.player.position.z);
    const frames = game.performanceHUD?.metrics?.frames ?? 0;
    if (aqui === zona) return { yaEstaba: true, frames };
    const punto = puntoEnZona(district, zona);
    if (!punto) throw new Error(`No hay un punto transitable en la zona «${zona}».`);
    const y = district.getGroundHeight?.(punto.x, punto.z) ?? 0;
    game.player.position.set(punto.x, y, punto.z);
    game.player.root.position.copy(game.player.position);
    game.cameraRig.follow(game.player.position, 0, game.collisions);
    return { yaEstaba: false, frames, x: punto.x, z: punto.z };
  }, escena.id);

  await esperar(page, async (zona) => {
    const { zonaDe } = await import('/tools/verificar/escenas.mjs');
    const game = window.__game;
    if (!game?._running || game._loading || game.paused) return false;
    return zonaDe(game.world.active, game.player.position.x, game.player.position.z) === zona;
  }, inicio, `La zona ${escena.titulo}`);

  if (!llegada.yaEstaba) {
    await esperar(page, (frames) => (window.__game?.performanceHUD?.metrics?.frames ?? 0) > frames, inicio, `La zona ${escena.titulo}`, llegada.frames);
  }
}

export async function verificarEscena({ escena, salida, url, ventana, argsNavegador, tope = TOPE_MS }) {
  const inicio = Date.now();
  const destino = resolve(salida);
  await mkdir(destino, { recursive: true });
  const captura = join(destino, `${escena.id}.png`);
  const registro = join(destino, `${escena.id}.errores.log`);
  const registros = [];
  let servidor;
  let browser;
  try {
    servidor = await asegurarServidor(url, inicio);
    browser = await chromium.launch({ headless: !ventana, args: argsNavegador });
    const context = await browser.newContext({
      baseURL: url,
      viewport: { width: 1280, height: 800 }
    });
    const page = await context.newPage();
    registrarErrores(page, registros);
    await abrirHasta(page, escena, inicio);
    await page.screenshot({ path: captura, fullPage: true });
    await writeFile(registro, textoRegistro(registros), 'utf8');
    return { captura, registro, errores: registros };
  } catch (error) {
    await writeFile(registro, `${textoRegistro(registros)}${registros.length ? '' : ''}[cli] error: ${error.message}\n`, 'utf8').catch(() => {});
    throw error;
  } finally {
    await browser?.close().catch(() => {});
    if (servidor?.propio && servidor.hijo?.pid) matarArbol(servidor.hijo.pid);
  }
}

export async function main(argv = process.argv.slice(2), env = process.env) {
  const cli = parsearCli(argv);
  if (cli.ayuda) {
    console.log(AYUDA.trim());
    console.log('\nEscenas:', listarEscenas());
    return { ayuda: true };
  }
  if (cli.listar) {
    console.log(listarEscenas());
    return { listar: true, escenas: nombresEscenas() };
  }
  const escena = resolverEscena(cli.escena);
  const resultado = await verificarEscena({
    escena,
    salida: cli.salida,
    url: cli.url,
    ventana: cli.ventana,
    argsNavegador: argsNavegador(env)
  });
  console.log(`Captura: ${resultado.captura}`);
  console.log(`Errores: ${resultado.registro}`);
  return resultado;
}

const esPrincipal = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;
if (esPrincipal) {
  main().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
