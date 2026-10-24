---
tipo: aprendizaje
fecha: 2026-10-24
autor: seppuq
fuente: "bot/node_modules/minecraft-data (3.117, datos de 26.1); bot/habilidades/planificador.js y fundir.js"
---
# minecraft-data no trae recetas de horno

minecraft-data 26.1 trae 887 recetas de mesa, pero **ninguna de horno**. Además, cada receta viene desplegada por variante (un cofre por tipo de tablón, una cama por madera) y no admite mezclar variantes.

## Evidencia
- `recipes.json` de 26.1: `bucket`, `chest` (12 variantes), `white_bed` (13), `furnace` (3, una por piedra), `iron_pickaxe`, `torch`… y ninguna cuyo resultado sea `iron_ingot` desde `raw_iron`.
- `iron_ingot` sí tiene receta, pero desde pepitas o un bloque de hierro: un planificador ingenuo intentaría fabricarlo así.

## Qué hacer con ello
- Para fundir hace falta una tabla propia: `FUNDIR` en `bot/habilidades/fundir.js`.
- Al planificar recetas:
  - tratar lingotes, menas, lana y troncos como hojas, que se consiguen con otras habilidades;
  - probar cada variante sobre una copia del inventario y quedarse con la que deja menos faltas;
  - lo hace `bot/habilidades/planificador.js`.
