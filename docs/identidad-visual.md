# Identidad visual de BAZUKO

La interfaz toma como referencia la claridad de los juegos urbanos de mundo abierto y la señalética de Bogotá. El amarillo taxi marca la acción y la selección; el asfalto enmarca la información; el blanco hueso mantiene la lectura sobre la ciudad. BAZUKO conserva su nombre, sus ilustraciones y el lenguaje del rebusque.

## Sistema visual

| Uso | Valor |
| --- | --- |
| Fondo asfalto | `#101411` |
| Panel | `#191e1a` |
| Texto principal | `#f1f0e7` |
| Texto secundario | `#adb5ac` |
| Acción y selección | `#efca52` |
| Salud | `#97c887` |
| Energía | `#8fc3cf` |

Barlow Condensed 700/800 identifica la marca, los títulos y las cifras principales. Overpass lleva instrucciones, controles y texto de lectura. Ambas fuentes se incluyen localmente mediante Fontsource; la partida no depende de un servidor externo de tipografías.

## Composición

El HUD distribuye la marca y controles a la izquierda, dinero/progreso a la derecha, radar y necesidades abajo a la izquierda, y costal/fabricación/accesos rápidos abajo a la derecha. La columna del radar conserva los tres tamaños y las indicaciones del GPS. Salud y energía usan los mismos colores en la partida y en la pausa.

Los menús oscurecen la ciudad y apartan los controles de la partida. Inventario y fabricación comparten selección amarilla, iconos de objetos y una zona de detalle. La pausa mantiene Mapa, Estado, Ajustes y Controles. La carga aprovecha las ilustraciones existentes; el creador mantiene visible al personaje junto al editor.

## Implementación y accesibilidad

Las hojas `urban-hud.css`, `urban-panels.css` y `urban-entry.css` se cargan después de las hojas existentes, en ese orden. `urban-hud.css` define los tokens compartidos y la distribución durante la partida. Los módulos visuales no cambian el guardado ni las reglas de supervivencia.

Conservar los IDs, los controles de teclado, el foco visible, los atributos `hidden` y los estados de selección. Los controles táctiles tienen al menos 44 px; los paneles largos permiten desplazamiento interno. El movimiento reducido elimina transiciones decorativas. El color acompaña a nombres, iconos y valores, nunca los sustituye.

## Comprobación

`tests/e2e/identity.spec.js` comprueba la separación de controles con saldo largo y acceso rápido visible, la navegación de paneles y la ausencia de desbordamiento horizontal a 1440, 375, 320 y 844 px. Las pruebas existentes de `game.spec.js` y `upgrade.spec.js` cubren creador, mapa/GPS, necesidades, fabricación, pausa y foto.

Revisar además el aspecto del inventario vacío y lleno, carga, creador, partida de día/noche y mapa en escritorio y móvil. Las comprobaciones visuales locales no garantizan rendimiento ni legibilidad en todos los dispositivos.
