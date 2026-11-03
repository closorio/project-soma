---
tipo: aprendizaje
fecha: 2026-11-03
autor: seppuq
fuente: servidor-local/logs/latest.log («Prueba1 drowned», 12:36 y 13:39)
---
# Los reflejos no ven el ahogamiento dentro de una habilidad

## Evidencia
Los reflejos (bot/reflejos.js) se miran entre habilidades y cada 2 s en reposo. Solo un golpe interrumpe antes. ir_a_mena estuvo
50 s y 270 s cavando hacia la mena con el agua entrando en el túnel, y el bot murió ahogado las dos veces.

## Qué hacer con ello
Vigilar el aire en el evento `breath`, como los golpes. Si el aire está por debajo de 10/20 y tiene la cabeza en el agua, cortar
la tarea y salir a respirar (io.js, alAhogarse). Un «consigue» la reanuda luego.
