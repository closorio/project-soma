---
tipo: aprendizaje
fecha: 2026-10-15
autor: seppuq
fuente: mente/alma/propuestas.md
---
# El balance de troncos de la mente se rompe al reconectar

## Evidencia
`mente.py` cuenta los troncos de la sesión con `cofre.guardados`, que vuelve a 0 al reconectar el bot (22 → 0 tras la desconexión de las 03:44): el balance salió +2 en vez de +24.

## Qué hacer con ello
Contar desde el contenido real de los cofres o persistir `guardados`.
