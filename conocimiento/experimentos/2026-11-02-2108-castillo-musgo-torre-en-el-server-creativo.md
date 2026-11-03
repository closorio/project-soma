---
tipo: experimento
fecha: "2026-11-02 21:08"
autor: seppuq
titulo: castillo_musgo_torre en el server creativo
entorno: "minecraft 26.1.2 creativo (servidor-creativo/, plano)"
politica: "construir del catálogo (guion), abasto creativo"
N: 7
semilla: ""
metrica: pruebas que pasan
valor: 5/7
base: todas
veredicto: mejora
fuente: entrenamiento/ejecuciones/obra-castillo_musgo_torre-2026-11-02.json
---
# castillo_musgo_torre en el server creativo

Puerta obra grande (catálogo): no pasa (5/7 pruebas).

| prueba | pasa | detalle |
|---|---|---|
| server creativo propio arranca y prepara el mundo | sí | make creative-server-start: listo en 127.0.0.1:25573 |
| abasto creativo por tandas | sí | bot.creative.setInventorySlot, sin cofres ni talar |
| recorte del castillo (CROP=) | sí | torre 15×30×15, 3210 bloques |
| bloques bien orientados | sí | 1086 puestos, 0 con otra orientación (RCON execute if block) |
| capas 0-8 completas (con suelo de madera) | sí | 927/927; capa 9 97/99 |
| torre terminada | no | 1086/3210: el centro sobre el suelo de la capa 8 no tiene sitio de andamio (desde el suelo base, el suelo lo corta; desde fuera, a 7) |
| sin intervención | no | andamio: no pude subir … cada ~20 min en sitios distintos; un bucle repitió la orden; ~17 bloques/min |

Fuente: `entrenamiento/ejecuciones/obra-castillo_musgo_torre-2026-11-02.json`

## Conclusión

Primera obra grande en el juego (una torre recortada de `castillo_musgo`, en el server creativo propio, con los bloques del
inventario creativo para medir solo colocar, orientar y andamio). Orientación sin un fallo en 1086 bloques. Salieron cuatro
fallos de obra grande, arreglados en `bot/habilidades/construir.js` (solo con la obra más ancha que dos alcances; las casitas,
igual): el navegador no daba un paso dentro de la huella (coste > 100 = prohibido), el andamio desde la 4.ª capa, la columna
también dentro y la columna libre hasta arriba. Ver [[2026-11-02-server-creativo-para-obras]] y
[[El coste de exclusión mayor que 100 prohíbe el paso]].

Siguiente: andamio (o el bot) sobre los suelos ya puestos, no solo sobre el suelo base, y mirar el «no pude subir» que corta
cada ~20 min. Luego terminar la torre y el castillo entero de noche.
