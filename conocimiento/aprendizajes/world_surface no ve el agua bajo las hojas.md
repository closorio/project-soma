---
tipo: aprendizaje
fecha: 2026-10-14
autor: seppuq
fuente: "[[Varios personajes con un modelo compartido]]"
---
# world_surface no ve el agua bajo las hojas

## Evidencia
La comprobación de agua de `medir.py` y `medir_ejecutor.py` usa `world_surface`, que no ve el agua bajo hojas; `motion_blocking_no_leaves` sí (29 columnas frente a 14 en la zona alterada).

## Qué hacer con ello
Cambiar la comprobación antes de fiarse de puntos de salida en zonas con agua y copas; mientras, se excluye la zona x 305-317, z 10-21.
