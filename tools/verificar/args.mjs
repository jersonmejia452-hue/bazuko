import { parseArgs } from 'node:util';

export const TOPE_MS = 5 * 60 * 1000;
export const URL_PREDETERMINADA = 'http://127.0.0.1:5188/';
export const SALIDA_PREDETERMINADA = 'work/verificar';
export const VARIABLE_NAVEGADOR = 'BAZUKO_NAVEGADOR_ARGS';
export const ARGS_NAVEGADOR_PREDETERMINADOS = Object.freeze([
  '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader'
]);

const OPCIONES = {
  escena: { type: 'string' },
  salida: { type: 'string' },
  url: { type: 'string' },
  ventana: { type: 'boolean', default: false },
  'navegador-args': { type: 'string', multiple: true },
  listar: { type: 'boolean', default: false },
  ayuda: { type: 'boolean', default: false },
  help: { type: 'boolean', default: false }
};

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

export function resolverArgsNavegador({ cli = [], envTexto = undefined } = {}) {
  const delEntorno = envTexto === undefined ? [] : partirArgsNavegador(envTexto);
  if (envTexto === undefined && cli.length === 0) return [...ARGS_NAVEGADOR_PREDETERMINADOS];
  return fusionarArgsNavegador(delEntorno, cli);
}

export function agruparArgv(argv) {
  const out = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--navegador-args' && argv[i + 1] != null && String(argv[i + 1]).startsWith('-')) {
      out.push(`--navegador-args=${argv[i + 1]}`);
      i++;
    } else out.push(argv[i]);
  }
  return out;
}

export function parsearCli(argv) {
  const { values, positionals } = parseArgs({
    args: agruparArgv(argv),
    options: OPCIONES,
    allowPositionals: true,
    strict: true
  });
  return {
    escena: values.escena,
    salida: values.salida ?? SALIDA_PREDETERMINADA,
    url: values.url ?? URL_PREDETERMINADA,
    ventana: values.ventana,
    listar: values.listar,
    ayuda: values.ayuda || values.help,
    navegadorArgs: values['navegador-args'] ?? [],
    extraNavegador: positionals
  };
}

export function argsNavegadorDeCli(cli, env = process.env) {
  return resolverArgsNavegador({
    cli: [...cli.navegadorArgs, ...cli.extraNavegador],
    envTexto: Object.hasOwn(env, VARIABLE_NAVEGADOR) ? env[VARIABLE_NAVEGADOR] : undefined
  });
}

export function tiempoRestante(inicio, tope = TOPE_MS) {
  return Math.max(0, tope - (Date.now() - inicio));
}

export function asegurarTope(inicio, que, tope = TOPE_MS) {
  const ms = tiempoRestante(inicio, tope);
  if (ms <= 0) throw new Error(`${que} no quedó lista en ${tope / 60_000} minutos.`);
  return ms;
}

export const AYUDA = `Uso: npm run verify -- --escena <nombre> [opciones]

Abre el juego, espera a que la escena esté lista, guarda una captura
y escribe los errores de la consola. Sin esperas fijas: el tope es de
5 minutos por escena.

Opciones:
  --escena <nombre>          Zona del juego o pantalla de entrada
  --listar                   Muestra las escenas disponibles
  --salida <carpeta>         Destino de la captura y el registro (por defecto ${SALIDA_PREDETERMINADA})
  --url <url>                Si se indica, no arranca Vite y usa ese servidor
  --ventana                  Abre Chromium con ventana
  --navegador-args=<args>    Argumentos de Chromium (se puede repetir)
  --ayuda                    Esta ayuda

Los argumentos del navegador también se pasan con ${VARIABLE_NAVEGADOR}
o después de un -- suelto. Si se indica alguno, sustituye los de
SwiftShader. En un Mac con GPU:

  npm run verify -- --escena parque --navegador-args=--use-angle=metal
  npm run verify -- --escena parque -- --use-angle=metal
`;
