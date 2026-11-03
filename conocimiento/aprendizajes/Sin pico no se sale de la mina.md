---
tipo: aprendizaje
fecha: 2026-11-03
autor: seppuq
fuente: servidor-supervivencia/logs/conseguir-20261103-1233.json
---
# Sin pico no se sale de la mina

## Evidencia
Banco del recolector, 2026-11-03: el pico de hierro del kit se rompió a y≈-58. «ármate» empieza talando y abajo no hay árboles,
y `subir_a_superficie` sube en pilar picando lo de encima, así que falló con «pilar: sin herramienta». Le pasó a 2 de 5 diamantes.

## Qué hacer con ello
Antes de bajar, llevar madera para rehacer el pico abajo (5 troncos: ármate 3 y el pico de hierro 1,5). Sin madera, subir
cuando al pico le queden pocos usos, no cuando ya se ha roto (bot/conseguir.js, RESERVA y USOS_MIN).
