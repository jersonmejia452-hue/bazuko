// Un solo sitio decide los argumentos de Chromium para las pruebas de navegador y la CLI.
export const VARIABLE_NAVEGADOR = 'BAZUKO_NAVEGADOR_ARGS';

// Lo que hacía playwright.config.js antes de unificar:
// process.env.PLAYWRIGHT_GPU === '1' ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']
export const ARGS_SWIFTSHADER = Object.freeze([
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader'
]);

export function argsPlaywrightGpu(env = process.env) {
  return env.PLAYWRIGHT_GPU === '1' ? [] : [...ARGS_SWIFTSHADER];
}

export function partirArgsNavegador(texto) {
  if (texto == null) return [];
  const fuente = String(texto).trim();
  if (!fuente) return [];
  const partes = [];
  let actual = '';
  let comilla = null;
  for (const ch of fuente) {
    if (comilla) {
      if (ch === comilla) comilla = null;
      else actual += ch;
    } else if (ch === '"' || ch === "'") {
      comilla = ch;
    } else if (/\s/.test(ch)) {
      if (actual) { partes.push(actual); actual = ''; }
    } else actual += ch;
  }
  if (actual) partes.push(actual);
  return partes;
}

export function claveArgNavegador(arg) {
  const texto = String(arg);
  if (texto.startsWith('--')) {
    const igual = texto.indexOf('=');
    return igual === -1 ? texto : texto.slice(0, igual);
  }
  return texto;
}

export function fusionarArgsNavegador(base = [], extra = []) {
  const resultado = [];
  const indice = new Map();
  for (const arg of [...base, ...extra]) {
    const clave = claveArgNavegador(arg);
    if (indice.has(clave)) resultado[indice.get(clave)] = arg;
    else {
      indice.set(clave, resultado.length);
      resultado.push(arg);
    }
  }
  return resultado;
}

function anguloFinal(args) {
  return args.findLast?.((arg) => claveArgNavegador(arg) === '--use-angle')
    ?? [...args].reverse().find((arg) => claveArgNavegador(arg) === '--use-angle');
}

export function argsNavegador(env = process.env) {
  const base = argsPlaywrightGpu(env);
  if (!Object.hasOwn(env, VARIABLE_NAVEGADOR)) return base;
  const extra = partirArgsNavegador(env[VARIABLE_NAVEGADOR]);
  const fusion = fusionarArgsNavegador(base, extra);
  const angulo = anguloFinal(fusion);
  if (angulo && !/swiftshader/i.test(angulo) && !extra.includes('--enable-unsafe-swiftshader')) {
    return fusion.filter((arg) => arg !== '--enable-unsafe-swiftshader');
  }
  return fusion;
}
