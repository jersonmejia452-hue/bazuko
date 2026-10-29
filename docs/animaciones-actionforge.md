# Animaciones del personaje

Las animaciones proceden de Quaternius, exportadas mediante [ActionForge](https://actionforge.app/), que identifica su biblioteca de animaciones como CC0. Se conserva el personaje modular existente: cuerpo, ropa, pelo, barba y zapatos no se sustituyen por la apariencia exportada.

El archivo original contiene 51 clips. El banco `public/models/animaciones-actionforge.glb` incluye solamente ocho clips usados por acciones existentes y un esqueleto de 52 huesos. Pesa aproximadamente 849 KiB, sin mallas ni texturas. Las demás animaciones se mantienen en el archivo original de trabajo; no se agregan automáticamente mecánicas de salto, combate, conducción o natación.

| Acción del juego | Clip exportado |
| --- | --- |
| Reposo | idle_loop_fit |
| Caminar | walk_loop_fit |
| Correr | sprint_loop_fit |
| Buscar | fixing_kneeling_fit |
| Pedir | idle_talking_loop_fit |
| Comer y beber | consume_fit |
| Agacharse para hacer popó | crouch_idle_loop_fit |
| Lanzar | overhandthrow_fit |

Cada cuerpo recibe clips adaptados y guardados en caché, también para su versión de detalle reducido. El cuerpo original no se modifica al preparar las animaciones. Se conserva la altura animada de la cadera, ajustada a cada cuerpo; el movimiento horizontal lo controla el juego. Comer, beber, lanzar y saludar se reinician al entrar en la acción y se reproducen una sola vez. Las transiciones mezclan los pesos de las animaciones.

Caminar y correr comparten una fase y se mezclan según la velocidad, para que el pie apoyado no deslice. `src/character/locomotion.js` mide, una vez por cuerpo, cuánto avanza el pie durante un ciclo con cinco proporciones de la mezcla; mezclar posturas no mezcla la zancada linealmente, por eso se mide en lugar de interpolar. La proporción se elige donde la mezcla, a su cadencia natural, avanza a la velocidad del personaje. Los NPC (0,8–1,3 m/s) caminan sin mezcla; el jugador trota al caminar (3 m/s) y corre con el sprint al 75 % (6 m/s). Medido en el navegador, el desplazamiento sistemático del pie apoyado bajó de 1,17 a 0,11 m/s al caminar y de 7,76 a 0,47 m/s al correr; en los NPC pasó de 0,25 a 0.

El salto, el aterrizaje, el golpe, la reacción al impacto y la natación usan poses articuladas de `src/character/ActionPose.js` después del mezclador, sin modificar los clips ni la raíz física. El golpe sincroniza la extensión del brazo con el impacto de `MeleeCombat`; en el agua se mezclan brazadas y patadas según la velocidad. Las poses se restauran antes de evaluar el siguiente fotograma y también se aplican al personaje liviano.

Otras acciones sin clip propio usan uno parecido: saludar en el creador usa el gesto de hablar y hacer popó sin clip usa el de buscar. Dormir no tiene animación. El banco anterior (`animaciones-prueba.glb`, con Idle, Walk, Run y TPose) solo se descarga si al banco nuevo le falta caminar, correr o reposo. El personaje liviano conserva su locomoción procedural y los atropellos mantienen el ragdoll.

Para regenerar el banco, guardar la descarga como `work/exportaciones/animaciones-actionforge.glb` y ejecutar `tools/personaje/preparar_actionforge.py` con Python. `exportar_actionforge.py` genera el personaje para subirlo al editor y requiere Pillow. Los archivos grandes de intercambio en `work/` no se publican.

Las pruebas comprueban carga, esqueleto, selección de clips, ausencia de recursos visuales duplicados, valores finitos, movimiento en el sitio y conservación del cuerpo original. La apariencia y las transiciones deben revisarse jugando en el navegador.
