---
tipo: aprendizaje
fecha: 2026-10-13
autor: seppuq
fuente: "[[F2 Habilidades de alto nivel]]"
---
# Brecha simulador-mundo en troncos por árbol

## Evidencia
En Minecraft salen ~60 troncos por 5 min y el simulador de habilidades da ~17. Los robles oscuros (tronco 2×2) y los robles grandes dejan muchos troncos al alcance sin moverse; el simulador da 3-5 por árbol.

## Qué hacer con ello
Recalibrar `entorno_habilidades.py` (troncos por árbol, `recoger`) con `ejecuciones/*.jsonl` antes de esperar que la red aprenda algo que el guion no sepa. Regla general del proyecto: cada fallo en Minecraft se traslada al simulador.
