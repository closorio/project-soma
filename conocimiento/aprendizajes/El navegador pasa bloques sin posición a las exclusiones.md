---
tipo: aprendizaje
fecha: 2026-10-25
autor: seppuq
fuente: "servidor-supervivencia/logs/bots-rol-casual-1.log (banco K, medida 6); bot/zonas.js; commit 46d8208"
---
# El navegador pasa bloques sin posición a las exclusiones

mineflayer-pathfinder llama a veces a las funciones de `exclusionAreasStep`, `exclusionAreasBreak` y `exclusionAreasPlace` con un bloque **sin `position`** (o `undefined`), por ejemplo en el borde de un trozo sin cargar. Si la función lee `b.position.x`, el `TypeError` no lo atrapa nadie y **tumba el proceso entero**: con varios personajes en un mismo `node io.js`, caen todos a la vez.

Además, el servidor 26.1 se **pausa a los 60 s sin jugadores** (`pause-when-empty-seconds`), así que tras la caída el reloj se para y un banco que mida por días de juego espera para siempre.

## Evidencia
- Banco K, medida 6: `TypeError: Cannot read properties of undefined (reading 'x') at bot/zonas.js:54:59 at Movements.exclusionStep`; los cuatro bots fuera y el reloj quieto en 28290.
- Tras las guardas, las medidas 7 y 8 (más de 3 h de bots) sin una sola caída.

## Qué hacer con ello
- Toda función de exclusión empieza con `b && b.position && …` (devuelve 0 para pisar, o `Infinity` si es para romper o poner y hay que ser prudente). Así están `zonas.js`, `salir_del_refugio.js`, `recoger.js` y `construir.js`; la prueba está en `probar_explorar_seco.js`.
- `pause-when-empty-seconds=0` en el servidor de pruebas (`servidor-local/descargar.sh`).
- Un banco que lanza bots mira `proceso.poll()` y corta la rotación si muere (`experimentos_roles.py`, campo `caido`).
