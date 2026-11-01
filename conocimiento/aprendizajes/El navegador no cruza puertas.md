---
tipo: aprendizaje
fecha: "2026-11-01"
autor: "seppuq"
fuente: "bot/node_modules/mineflayer-pathfinder/lib/movements.js"
---
# El navegador no cruza puertas

mineflayer-pathfinder planea las puertas como pared, estén abiertas o cerradas, y las rodea o, con los movimientos que pican,
las rompe. Esto pasa porque en minecraft-data una puerta es un bloque entero (`boundingBox: block`). Su `canOpenDoors` viene
apagado y, además, solo sirve para puertas de valla: la mitad de arriba de una puerta le corta el paso igualmente.

## Evidencia
- `movements.js`: `openable` solo recoge nombres con «gate», y `getBlock` marca como `safe` solo `boundingBox === 'empty'`.
- Banco del rodeo con un muro de lado a lado y una puerta de roble cerrada: con `bot/puertas.js`, 4/4 en el 26.3 vanilla.

## Qué hacer con ello
- `bot/puertas.js`. `aplicar(mov)`, llamado desde `zonas.aplicar`, hace que las puertas de madera cuenten como paso; las de
  hierro no. `vigilar(bot)` abre la puerta cerrada que el bot tiene delante y la cierra cuando ya está a 2 bloques.
- Si algún día se sube mineflayer-pathfinder, comprobar si ya trae puertas antes de quitar esto.
