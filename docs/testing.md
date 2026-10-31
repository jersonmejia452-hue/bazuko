# Pruebas

Las pruebas de navegador se adaptaron del PR [juanagogo/bazuko#4](https://github.com/juanagogo/bazuko/pull/4), commit `2df40da`, de Jonme-Mopri. La corrección asociada renderiza las recetas inmediatamente al abrir fabricación; esto es necesario porque el panel pausa la simulación.

## Pruebas unitarias y compilación

```sh
npm ci
npm test
npm run build
```

Las regresiones de jugabilidad comprueban el salto y el recorrido de ambas rampas del viaducto, la resistencia a enfermedades de Piel Dura, el peso final al fabricar con el costal lleno y la llegada del GPS a destinos marcados sobre edificios. En este último caso, ruta, marcador y guardado comparten el punto transitable cercano al edificio.

`map-services.test.js` y `map-view.test.js` comprueban precios, espacio en el costal, prioridad de necesidades, sugerencias y filas del mapa.

`cures.test.js` comprueba que cada remedio cure una enfermedad que existe y no se gaste sin ella, que la aguapanela cure la gripe y se tome aunque no la haya, que solo la basura con metal traiga tétanos y dormir sucio traiga sarna, y que las partidas viejas conserven la intoxicación. `dealer.test.js` verifica que comprarle al dealer para revenderle nunca deje ganancia, ni con Contactos; que `E` abra su tienda sin vender; que se venda solo la sustancia elegida, y que la requisa se lleve la mercancía sin pagar.

`inventory-actions.test.js` verifica que vaciar el inventario notifique a sus suscriptores, desequipe el arma y cancele su ataque pendiente. También comprueba que intentar fumar nadando, en el aire o aturdido conserve objeto, necesidades, audio y efectos, y que un consumo permitido gaste una sola unidad.

En C++, `bazuko_playerstate_test` comprueba que la carga conserve los objetos permitidos por el costal grande y los talentos, y que la regeneración no reviva al jugador durante una caída mortal. Se ejecuta con `ctest --test-dir cpp/build --output-on-failure` después de configurar y compilar los objetivos nativos. Estas pruebas de lógica no requieren abrir la ventana del juego.

## Sala de pruebas

`sala.html` (solo en `npm run dev`) prueba piezas sueltas sin cargar la ciudad: el jugador sobre un piso plano con la misma cámara, controles y render del juego. Las pruebas viven en `src/sala/pruebas.js`; cada una es `{ id, nombre, descripcion, montar(sala) }` y `montar` devuelve sus botones (`acciones`) y, si quiere, un texto de `estado` que se refresca en el panel. Se abre una en concreto con `sala.html?prueba=<id>`. `sala.timeScale` acelera la simulación para lo que tarda (un cigarrillo dura 10 minutos) y `sala.updaters`, `beforeRender` y `afterRender` permiten colgar sistemas como los efectos de consumo. No reemplaza las pruebas de navegador ni comprueba la ciudad, el tráfico o el guardado.

El perfil `sala.html?prueba=personaje&animaciones=mixamo-preview` permite comparar el banco Mixamo preparado en Blender. `tests/e2e/mixamo-room.spec.js` recorre sus nueve clips, verifica poses finitas, apoyos de geometría sobre el piso, raíz fija, pausa, avance por fotograma y errores de carga. También comprueba que la selección de la sala conserve la preferencia de modelo del juego. Las capturas sirven para revisar la calidad visual además de las aserciones numéricas.

Para ejecutar únicamente las pruebas de animaciones en la sala (con el puerto 5188 libre):

```sh
PLAYWRIGHT_GPU=1 npx playwright test tests/e2e/mixamo-room.spec.js tests/e2e/animation-room.spec.js
```

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

`character-action-integration.test.js` carga los GLTF y clips locales para comprobar articulación en el cuerpo vestido, continuidad de locomoción, salto en movimiento y natación. `action-pose.test.js` cubre restauración por instancia, fases de golpe de respaldo y límites del esqueleto. `melee-combat.test.js` y `melee.test.js` verifican resolución del ataque, combos y fases por arma, selección frontal, daño y KO; la integración conserva la comprobación de altura y obstáculos, incluida la OBB del bus.

- `combat-geometry.test.js` y `enemy-reach.test.js`: alcance en calle, puente y agua; paredes y buses girados; barrido de persecuciones y nueva comprobación del contacto al impactar.
- `police-chase-integration.test.js`: captura única, obstáculos, ribera, altura, abandono y retorno gradual al patrullaje.
- `npc-combat-integration.test.js`: contactos únicos por ataque, KO y recuperación sin renovar botín, empujes seguros y cancelación de contraataques.
- `tests-player-combat-integration.test.js`: combos, energía, orientación actual, múltiples objetivos y cancelación al cambiar arma, caer, recibir daño o entrar al agua.
- `gamepad-context.test.js`: navegación de paneles y modo foto, acciones según contexto y liberación de entradas al perder foco, ocultar la pestaña o desconectar el mando. Usa un mando simulado; no valida un dispositivo físico.

`lake-depth.test.js` compara profundidad con raycasts del fondo y comprueba pilares hasta el lecho. `water-movement.test.js` valida flotación, entrada predictiva y salida gradual. `player-water-integration.test.js` recorre con el Player real la orilla hasta el nado y de regreso, cae desde altura y comprueba que el agua no capture al jugador sobre el viaducto. `water-effects.test.js` verifica los pools, pausa y liberación de recursos.

Los E2E `actions.spec.js` recorren caminar/correr, congelan un salto y un impacto real para capturarlos, se lanzan al lago, nadan con estela y salen andando. `upgrade.spec.js` comprueba HUD compacto, alertas sin abrir el detalle, objetivos de 44 px y agua congelada durante foto. Para conservar capturas de las acciones, añadir `UPGRADE_SHOTS=work/visual-review` a la ejecución de navegador. Estas capturas deben revisarse visualmente; la lógica sola no confirma la calidad de una animación.

`integration.spec.js` reúne diez escenarios en el bucle real de la ciudad:

- Combo con cuchillo, KO con botella y recuperación del NPC sin renovar la recompensa.
- Entrada al agua que cancela el contacto pendiente, el cigarrillo y la pipa.
- Modo foto que congela patrulla, agresores, sustancias y radio, y reanuda la simulación al salir.
- Arresto desde el agua y recuperación sin movimiento, amenazas ni efectos pendientes.
- Mando simulado para usar el inventario sin descartar objetos y operar el modo foto.
- Arma casera equipada desde el inventario: barrido, remate con más daño, esqueleto con matrices finitas y «Vender todo» sin tocar el arma de la mano.
- La misma arma y dormir con el perfil `mixamo-game-preview`, que comparte esas poses con el banco Mixamo: acostado mientras duerme y sin arma visible, de pie al despertar.
- Sin plata de noche: radar y mapa llevan al Dealer, `E` abre la tienda sin vender nada, solo se vende lo elegido, la fila de venta cabe a 375 y 1280 px, el aviso de requisa queda encima de la tienda, `Q` y `E` cierran sin reabrir y de día no compra.
- Tienda con mando simulado: vender deja el foco en la fila que queda; sin ventas, o al quedarse sin plata, el foco espera en el aviso o en la fila, A no compra ni vende otra cosa y la cruceta sigue desde ahí.
- Dormir en plena carrera con el modelo realista: sin teclas no resbala al despertar y se levanta de a poco, también si ya va andando.
- Dormir sucio en la pose nueva: se acuesta mientras duerme y se levanta al despertar, la sarna llega con su aviso y queda guardada; la pomada no se gasta sin la enfermedad, con el aviso encima del inventario, y después la cura.

## Materiales, barrios y sombras de contacto

`texture-materials.test.js` verifica separación entre albedo y datos físicos, espacios de color y límites de tamaño. `neighborhood-identity.test.js` conserva el plan urbano y su geometría; `architecture-determinism.test.js` comprueba que crear más materiales no cambie las casas ni las colisiones. `contact-shadows.test.js` cubre suelo, viaducto, salto, agua, rampas, capacidad y liberación. `lake-shore-materials.test.js` verifica la mezcla de ribera sin alterar el terreno.

`street-materials.test.js` comprueba las marcas en reposo, aislamiento de materiales, normales y transparencia conservadas y semilla estable. La integración en `mixamo-preview.test.js` alterna las apariencias sin cambiar el look ni los clips y verifica que el desgaste explícito 0 siga respetándose. `PLAYWRIGHT_GPU=1 npx playwright test tests/e2e/street-appearance.spec.js` recorre el selector **Apariencia del personaje**, detecta errores de shaders y guarda capturas comparables de rostro y cuerpo. Se revisan visualmente por separado; esta prueba no es una medición de FPS.

`tools/review-bogota-route.mjs` toma las mismas vistas de día y noche y registra renderer, resolución y tiempos de cuadro. Las capturas se inspeccionan visualmente; las cifras solo describen ese equipo y recorrido. El detalle y los límites están en [recorrido-bogota.md](recorrido-bogota.md).

`building-details.test.js` comprueba límites de geometría, agrupación por pared, alineación de ventanas y brillo nocturno en las dos vistas. `urban-trees.test.js`, `urban-planting.test.js` y `park-vegetation.test.js` verifican semillas, materiales compartidos, viento, reservas, agua y presupuestos. `vegetation-lifecycle.test.js` construye y libera el arbolado integrado para detectar recursos huérfanos o liberaciones duplicadas, incluyendo los materiales de profundidad.

## Mezcla de audio

`audio-mix-integration.test.js` recorre el grafo de Web Audio del golpe seco: fuente, filtro, ganancia local, canal Efectos y maestro. Comprueba Efectos en cero, silencio maestro, pausa de una reproducción ya iniciada y cambio de mezcla durante pausa. El golpe usa `_fx()` igual que las salpicaduras y otros efectos; la prueba comparte el contexto simulado de audio y no confirma la calidad audible en parlantes. Las suites de audio existentes conservan sus comprobaciones de tráfico, voces, consumo y efectos de sustancias.

Los informes y archivos de fallos se escriben en `playwright-report/` y `test-results/`, excluidos de Git. El informe HTML no se abre automáticamente al terminar. Para comprobar únicamente el descubrimiento de los escenarios, sin iniciar Chromium:

```sh
node node_modules/@playwright/test/cli.js test --list
```

La ejecución con renderizado por software sirve para verificar flujos; sus FPS no representan el rendimiento de una GPU real.

## Identidad de la interfaz

`PLAYWRIGHT_GPU=1 npm run test:e2e:headed -- tests/e2e/identity.spec.js tests/e2e/game.spec.js tests/e2e/upgrade.spec.js` verifica la interfaz BAZUKO con la GPU local: distribución de controles y dinero, inventario con objetos, accesos rápidos, creador, pestañas, mapa/GPS y modo foto. La prueba de identidad incluye escritorio, móvil estrecho y orientación horizontal; los controles deben caber y poder pulsarse sin solaparse. Ver `docs/identidad-visual.md` para paleta y responsabilidades de cada hoja de estilos.
