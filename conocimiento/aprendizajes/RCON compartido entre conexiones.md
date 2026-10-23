---
tipo: aprendizaje
fecha: 2026-10-15
autor: seppuq
fuente: "[[F5 Experimentos de perfiles]]"
---
# RCON compartido entre conexiones

## Evidencia
La salida de RCON se comparte entre conexiones simultáneas: dos procesos leyendo a la vez se mezclan las respuestas.

## Qué hacer con ello
Un solo lector por servidor: el vigía y las órdenes del banco por el mismo hilo o con un cerrojo.
