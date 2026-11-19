import { parseArgs } from 'node:util';
import { VARIABLE_NAVEGADOR } from '../navegador-args.mjs';

export const TOPE_MS = 5 * 60 * 1000;
export const URL_PREDETERMINADA = 'http://127.0.0.1:5188/';
export const SALIDA_PREDETERMINADA = 'work/verificar';

const OPCIONES = {
  escena: { type: 'string' },
  salida: { type: 'string' },
  url: { type: 'string' },
  ventana: { type: 'boolean', default: false },
  listar: { type: 'boolean', default: false },
  ayuda: { type: 'boolean', default: false },
  help: { type: 'boolean', default: false }
};

export function parsearCli(argv) {
  const { values, positionals } = parseArgs({
    args: argv,
    options: OPCIONES,
    allowPositionals: true,
    strict: true
  });
  if (positionals.length) {
    throw new Error(`Argumento no reconocido: ${positionals[0]}. Las opciones de Chromium van en ${VARIABLE_NAVEGADOR}.`);
  }
  return {
    escena: values.escena,
    salida: values.salida ?? SALIDA_PREDETERMINADA,
    url: values.url ?? URL_PREDETERMINADA,
    ventana: values.ventana,
    listar: values.listar,
    ayuda: values.ayuda || values.help
  };
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
  --ayuda                    Esta ayuda

Los argumentos de Chromium se pasan solo con ${VARIABLE_NAVEGADOR}.
Se aplican encima de lo que decide PLAYWRIGHT_GPU. En un Mac con GPU:

  PLAYWRIGHT_GPU=1 ${VARIABLE_NAVEGADOR}='--use-angle=metal' npm run verify -- --escena parque
`;
