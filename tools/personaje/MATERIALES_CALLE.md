# Microdetalle de piel para la sala

`public/models/preview/skin/skin-micro-normal.png` es un mapa normal procedural de **512 × 512**, generado y horneado en Blender 5.2.1. Añade poros suaves y pequeñas variaciones de superficie sobre la textura de color existente. No modifica la malla, las coordenadas UV ni los colores originales del cuerpo.

## Reconstruir el recurso

Desde la raíz de `bazuko`:

```sh
/Applications/Blender.app/Contents/MacOS/Blender -b --factory-startup \
  --python tools/personaje/preparar_materiales_calle.py -- \
  public/models/preview/skin/skin-micro-normal.png work/skin/materiales.blend
```

El proceso se ejecuta en una sesión independiente de Blender. `work/skin/materiales.blend` conserva el material fuente editable, el material que utiliza la imagen horneada, la imagen empaquetada y una esfera de muestra. El color de la esfera es solo una muestra de material, no reemplaza la textura del personaje. `work/skin/materiales.json` registra parámetros y tamaño del recurso.

La fuente utiliza Voronoi F1 para depresiones redondeadas, una transición suave hasta la superficie y un aporte de Noise de amplitud reducida. Ambos se evalúan en las coordenadas periódicas `(cos(2πu), sin(2πu), cos(2πv), sin(2πv))`. Así el patrón se repite en ambos ejes sin introducir una unión visible. Un nodo Bump convierte la altura en normales; Cycles hornea la salida a espacio tangente.

## Parámetros de integración

| Propiedad | Valor inicial |
|---|---|
| Convención | Tangente OpenGL, **+Y en verde** |
| Espacio de color | Datos lineales / `NoColorSpace` en Three.js |
| Repetición | `18 × 18` por cuadro UV |
| Intensidad de normal | `0.24` en ambos ejes; rango de ajuste `0.15–0.25` |
| Filtrado | Lineal con mipmaps y repetición en ambos ejes |
| Textura base del cuerpo | Se conserva, con sus UV originales |

La repetición se expresa en coordenadas UV, no en metros: la densidad física depende de las islas del modelo. El recurso debe aplicarse solo a la piel. La intensidad final se revisa de cerca y a distancia de juego para evitar que el detalle domine la forma del rostro.

El PNG RGB ocupa **292.661 bytes**. Su asignación estimada como RGBA8 con la cadena completa de mipmaps es **1.398.100 bytes** (1,33 MiB). El coste final se mide en la sala tras la integración.

La imagen horneada mantiene longitudes de normal entre 0,995 y 1,005 tras cuantizar a 8 bits. Con intensidad 0,18, la desviación angular mediana es 0,24° y el percentil 99 es 2,66°. El salto medio de píxeles al repetir los bordes es comparable al de píxeles vecinos interiores. Estas comprobaciones confirman un recurso de detalle sutil y repetible; la iluminación y el tono de piel requieren además revisión visual en la sala.

## Comparación en la sala y en el juego

Abrir `sala.html?prueba=personaje&animaciones=mixamo-preview&aspecto=realista`. El selector **Apariencia del personaje** alterna entre **Actual** y **Realista · desgaste localizado** sin recargar. Los botones **Ver rostro** y **Cuerpo completo** sirven para inspeccionar ambos encuadres. En una ventana estrecha, esos botones ocultan el panel para dejar visible al personaje; **Mostrar controles** lo recupera. La selección no reemplaza el aspecto guardado ni las prendas; conserva el banco de animaciones elegido.

Para una prueba de la ciudad, usar `/?animaciones=mixamo-preview&aspecto=realista`. El perfil es opcional: no modifica la entrada habitual ni los materiales de los peatones.

`src/character/streetMaterials.js` define materiales diferenciados para piel, ojos, pelo, barba, tela y zapatos. Los mapas de color, UV, transparencia del cabello y normales de las prendas se conservan. El desgaste se calcula en coordenadas de reposo y sigue la deformación del esqueleto, con zonas localizadas en manos, puños, codos, rodillas y bajos. La semilla estable evita que las marcas cambien al alternar perfiles. Los poros utilizan una sola textura compartida; no se añaden polígonos ni objetos de renderizado.

Cuando no hay una apariencia guardada, el perfil nuevo usa desgaste 2; un valor explícito de desgaste 0 sigue respetándose. El pelo y la barba conservan el color elegido, con menos aclarado artificial y variaciones entre raíces y mechones. El perfil anterior conserva sus parámetros originales para que la comparación sea reversible.

La verificación funcional está en `tests/street-materials.test.js`, `tests/mixamo-preview.test.js` y `tests/e2e/street-appearance.spec.js`: comprueba materiales, conservación de identidad y animaciones, cambio reversible y compilación de shaders en la sala. Las capturas de rostro y cuerpo permiten revisar el resultado visual. Las mediciones locales de rendimiento y sus límites se guardan en `work/skin-performance/`.
