---
tipo: aprendizaje
fecha: 2026-10-31
autor: seppuq
fuente: "A0 del asistente: humo-26-3-20261031-2035/2048/2059 (fallidas) y 2110 (7/7)"
---
# Las puertas que ponen o pican no van en el terreno de verdad

La puerta A0 falló tres veces seguidas por el montaje de la prueba, no por lo que medía (el protocolo a través de ViaProxy):
- el rectángulo de obras y los cofres eran del mundo viejo;
- el punto de aparición era un desierto con cuevas debajo;
- de noche las habilidades se cortaban por «amenaza»;
- `depositar` se llevó al cofre la mesa y la cama que hacían falta después;
- `poner` necesita suelo firme justo al lado, y en una ladera, o donde otra prueba acaba de picar, no lo hay.

## Evidencia
Las tres pasadas fallidas dieron 1/7, 3/7 y 3/7 con «sin sitio», «nada que minar aquí», «amenaza» y «no tengo crafting_table». La cuarta, en una plataforma de hierba a y=200, en pacífico, con cada prueba en su trozo y el material dado justo antes, dio 7/7.

## Qué hacer con ello
- Las puertas que no miden el terreno van en `entrenamiento/arena.py` (`Sesion`, `plataforma`, `cantera`, `huerto`, `corral`), y se restaura todo al acabar.
- Las que sí miden el terreno, como caminar en A0 o la expedición de A3, van en terreno de verdad elegido a propósito: la llanura más cercana, o los puntos fijos del banco K.
- La lista completa de trampas está en `planes/asistente/TRAMPAS.md`.
