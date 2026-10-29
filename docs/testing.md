# Pruebas

Las pruebas de navegador se adaptaron del PR [juanagogo/bazuko#4](https://github.com/juanagogo/bazuko/pull/4), commit `2df40da`, de Jonme-Mopri. La corrección asociada renderiza las recetas inmediatamente al abrir fabricación; esto es necesario porque el panel pausa la simulación.

## Pruebas unitarias y compilación

```sh
npm ci
npm test
npm run build
```

Las regresiones de jugabilidad comprueban el salto y el recorrido de ambas rampas del viaducto, la resistencia a enfermedades de Piel Dura, el peso final al fabricar con el costal lleno y la llegada del GPS a destinos marcados sobre edificios. En este último caso, ruta, marcador y guardado comparten el punto transitable cercano al edificio.

En C++, `bazuko_playerstate_test` comprueba que la carga conserve los objetos permitidos por el costal grande y los talentos, y que la regeneración no reviva al jugador durante una caída mortal. Se ejecuta con `ctest --test-dir cpp/build --output-on-failure` después de configurar y compilar los objetivos nativos. Estas pruebas de lógica no requieren abrir la ventana del juego.

## Integración continua

`.github/workflows/ci.yml` ejecuta `npm ci`, `npm test` y `npm run build` en cada pull request y en cada push a `main`. Solo descarga de Git LFS los WAV de `public/audio`; los respaldos del port C++ en `cpp/assets/audio` no se descargan. Las pruebas de navegador no forman parte de la CI.

## Preparar Chromium

```sh
npx playwright install chromium
```

## Pruebas de navegador

```sh
npm run test:e2e
npm run test:e2e:headed
npm run test:e2e:ui
npm run test:report
```

En equipos donde SwiftShader no termina la preparación gráfica, ejecutar con la GPU local y ventana visible:

```sh
PLAYWRIGHT_GPU=1 npm run test:e2e:headed
```

Playwright inicia su propio Vite en `127.0.0.1:5188`, con puerto estricto y sin reutilizar otro servidor, para verificar esta copia del proyecto. Ejecuta Chromium con un solo worker y WebGL por software para limitar el uso de GPU y memoria. Cada prueba limpia el almacenamiento local de su contexto aislado; no borra la partida de tu navegador habitual.

Los escenarios esperan a que termine la pantalla de carga antes de interactuar. Verifican creación del personaje, talentos, recetas de fabricación, edición de apariencia, ayuda plegable «!», inventario y pausa. Se cierra fabricación antes de editar el personaje para respetar la pausa actual. Se comprueba que Escape cierre un panel sin abrir simultáneamente otro.

El escenario de regresiones comprueba además que Espacio eleve al jugador en el bucle real, que el panel permita fabricar con 20 kg ocupados cuando los ingredientes liberan espacio y que marcar Colpatria complete la llegada en una acera accesible.

## Actualización visual

La dirección, paleta y límites de la actualización están en [direccion-visual.md](direccion-visual.md).

- `character-motion.test.js`: movimiento independiente de FPS, poses sin acumulación, aislamiento entre esqueletos y conservación de pies/raíz.
- `urban-atmosphere.test.js`: cielo y lluvia con color de salida correcto, cambios de día/noche y entorno PBR exterior.
- `photo-mode.test.js`: entrada/salida, cámara y audio restaurados, atajos, foco y captura PNG.
- El navegador comprueba F2, simulación y tráfico congelados, HUD oculto, descarga PNG con contenido real y restauración de cámara; también detecta errores JavaScript y de compilación de shaders durante ese flujo.
- El creador se recorre a 1280×800 y 375×812 con movimiento reducido. Se comprueba que sus acciones permanezcan visibles y que las cuatro pestañas de pausa no produzcan desbordamiento horizontal a 375 px.

Para guardar capturas de inspección del creador, menús, radar y modo foto:

```sh
mkdir -p work/visual-review
BROWSER=none PLAYWRIGHT_GPU=1 GPS_SHOTS=work/visual-review npm run test:e2e:headed
```

La captura del modo foto conserva la resolución del canvas (según calidad/DPR). La actualización reutiliza los modelos y clips existentes; no agrega un nuevo catálogo 3D. Las pruebas locales no establecen un rendimiento objetivo para todos los equipos ni validan el port C++ gráfico, y la compilación sigue advirtiendo sobre el tamaño del paquete principal.

## Animación, combate y lago

`character-action-integration.test.js` carga los GLTF y clips locales para comprobar articulación en el cuerpo vestido, continuidad de locomoción, salto en movimiento y natación. `action-pose.test.js` cubre restauración por instancia, fases de golpe y límites del esqueleto. `melee-combat.test.js` valida anticipación/impacto único, cooldown, selección frontal y obstáculos, incluida la OBB del bus.

`lake-depth.test.js` compara profundidad con raycasts del fondo y comprueba pilares hasta el lecho. `water-movement.test.js` valida flotación, entrada predictiva y salida gradual. `player-water-integration.test.js` recorre con el Player real la orilla hasta el nado y de regreso, cae desde altura y comprueba que el agua no capture al jugador sobre el viaducto. `water-effects.test.js` verifica los pools, pausa y liberación de recursos.

Los E2E `actions.spec.js` recorren caminar/correr, congelan un salto y un impacto real para capturarlos, se lanzan al lago, nadan con estela y salen andando. `upgrade.spec.js` comprueba HUD compacto, alertas sin abrir el detalle, objetivos de 44 px y agua congelada durante foto. Para conservar capturas de las acciones, añadir `UPGRADE_SHOTS=work/visual-review` a la ejecución de navegador. Estas capturas deben revisarse visualmente; la lógica sola no confirma la calidad de una animación.

Los informes y archivos de fallos se escriben en `playwright-report/` y `test-results/`, excluidos de Git. El informe HTML no se abre automáticamente al terminar. Para comprobar únicamente el descubrimiento de los escenarios, sin iniciar Chromium:

```sh
node node_modules/@playwright/test/cli.js test --list
```

La ejecución con renderizado por software sirve para verificar flujos; sus FPS no representan el rendimiento de una GPU real.
