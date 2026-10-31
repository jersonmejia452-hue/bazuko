# Animaciones del personaje

Las animaciones proceden de Quaternius, exportadas mediante [ActionForge](https://actionforge.app/), que identifica su biblioteca de animaciones como CC0. Se conserva el personaje modular existente: cuerpo, ropa, pelo, barba y zapatos no se sustituyen por la apariencia exportada.

El archivo original contiene 51 clips. El banco `public/models/animaciones-actionforge.glb` incluye solamente ocho clips usados por acciones existentes y un esqueleto de 52 huesos. Pesa aproximadamente 849 KiB, sin mallas ni texturas. Las demás animaciones se mantienen en el archivo original de trabajo. El banco no contiene clips específicos de salto, combate o natación; esas acciones se articulan con las capas descritas abajo.

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

El salto, el aterrizaje, la reacción al impacto y la natación usan poses articuladas de `src/character/ActionPose.js` después del mezclador, sin modificar los clips ni la raíz física. En el agua se mezclan brazadas y patadas según la velocidad; la entrada y salida se suavizan y la cabeza permanece sobre la superficie, también con estatura corta. Las poses se restauran antes de evaluar el siguiente fotograma y se aplican al personaje liviano. Cuando llega un ataque con arma y fase, la animación de combate toma prioridad sobre el puñetazo de respaldo de `ActionPose`, para no sumar dos golpes sobre el mismo brazo.

Saludar usa un gesto articulado de antebrazo y muñeca. Dormir usa `SleepPose.js`: prepara una postura boca arriba para el cuerpo y sus prendas, calcula el apoyo sobre su geometría y mezcla la entrada y salida sin desplazar la raíz física. Dormir congela la simulación, así que `Game._loop` avanza esa pose con `Player.updateSleepPose`: el personaje se acuesta mientras duerme, sin arma ni cigarrillo, y se levanta al despertar. Si hace falta, hacer popó usa el clip de buscar como respaldo. El banco anterior (`animaciones-prueba.glb`, con Idle, Walk, Run y TPose) solo se descarga si al banco nuevo le falta caminar, correr o reposo. Los atropellos mantienen el ragdoll.

`AnimationPlayback.js` sincroniza comer, beber y lanzar con el progreso de la acción del juego, permite repetir gestos consecutivos y normaliza la mezcla de clips. Las transiciones de agacharse son más lentas que los gestos cortos. El modelo liviano también distingue comer y beber, busca alternando las manos y ejecuta el lanzamiento una sola vez según su progreso; sus tobillos compensan la flexión de las rodillas para conservar el apoyo.

El modelo realista acompaña los giros al moverse con una torsión limitada del torso y una compensación de la cabeza, que se desvanece al enderezarse. En el modelo liviano la fase de los pasos sigue la distancia recorrida, con piernas, brazos y torso coordinados; la altura al agacharse y levantarse se mezcla gradualmente. Estos ajustes son visuales y no desplazan la raíz física.

## Combate cuerpo a cuerpo

El banco no trae clips de pelea, así que los golpes del personaje realista son procedurales: `src/character/melee.js` suma, después de que el mezclador anima el cuerpo, un giro por hueso (columna, hombros y antebrazos) según la fase del golpe. Funciona también caminando y se desvanece al terminar, sin tocar los clips compartidos. Las armas (`src/data/weapons.js`) fijan daño, alcance, arco, tiempos de preparación, impacto y recuperación, y largo del combo. `MeleeCombat` es el único controlador de contacto: aplica daño una vez al llegar el impacto y vuelve a comprobar distancia, orientación, diferencia de altura y obstáculos, incluidos los vehículos rotados. Animación y daño comparten el estado de ataque (`weapon`, `step`, `phase`, `progress`, `timing`); no usan un instante fijo para todas las armas. El cuchillo, la botella picada y el arma casera se dibujan con primitivas atadas a la mano derecha (`src/character/props.js`) y solo se ven equipados; el arma casera reutiliza el tajo horizontal del cuchillo y el tajo desde arriba de la botella. El modelo procedural liviano ata el arma al antebrazo; la tabla del arma casera va inclinada hacia adelante para no atravesar el piso.

Los peatones tienen 100 de salud. Cada golpe los sacude y los hace huir; a 0 caen de espaldas, quedan tendidos de 6 a 8 segundos sin caminar ni recibir más daño, y se levantan con la salud completa huyendo. Nunca desaparecen. La pose tendida se conserva al cambiar entre el modelo liviano y el completo.

La preparación enlaza con el contacto mediante una curva continua. Después del contacto, torso y codo terminan el gesto; las manos regresan a guardia antes de que el torso vuelva al reposo. La cabeza compensa el giro para conservar la mirada y los combos parten de la postura anterior. Esto no altera daño, alcance ni tiempos del controlador.

## Revisión en la sala

`sala.html?prueba=personaje` permite recorrer las acciones en el sitio con ambos modelos, a velocidad normal o reducida, pausar y avanzar un fotograma. «Movimiento libre» devuelve el control a WASD, Shift, Espacio y G. «Saltar» usa el salto físico del jugador sobre el piso plano; el visor de natación muestra la pose sin simular el agua. La partida y sus pruebas de navegador comprueban por separado la entrada al lago, el nado y la salida.

Las pruebas (`tests/melee.test.js`) cubren fases, combos, daño, KO y la dirección de los huesos sobre un esqueleto de prueba. Cómo se ve cada golpe, el agarre del arma en la mano y la caída hay que revisarlos jugando.

Para regenerar el banco, guardar la descarga como `work/exportaciones/animaciones-actionforge.glb` y ejecutar `tools/personaje/preparar_actionforge.py` con Python. `exportar_actionforge.py` genera el personaje para subirlo al editor y requiere Pillow. Los archivos grandes de intercambio en `work/` no se publican.

Las pruebas comprueban carga, esqueleto, selección de clips, ausencia de recursos visuales duplicados, valores finitos, movimiento en el sitio y conservación del cuerpo original. La apariencia y las transiciones deben revisarse jugando en el navegador.
