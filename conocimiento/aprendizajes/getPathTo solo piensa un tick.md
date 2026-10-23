---
tipo: aprendizaje
fecha: 2026-10-13
autor: seppuq
fuente: "[[F2 Habilidades de alto nivel]]"
---
# getPathTo solo piensa un tick

## Evidencia
`getPathTo` de mineflayer-pathfinder piensa 40 ms y devuelve «partial»: descarta caminos que existen. `huir` usa `hayCamino()`, que piensa 300 ms de verdad.

## Qué hacer con ello
El filtro de alcanzabilidad del cerebro sigue usando `getPathTo`; cambiarlo es una mejora candidata, medible con `medir.py`.
