---
tipo: decision
fecha: "2026-11-02"
autor: "seppuq"
estado: vigente
fases: ["F-estructuras"]
---
# Server creativo propio para probar obras del catálogo

## Contexto
Las obras grandes del catálogo (`castillo_musgo`, 132 mil bloques) no se pueden probar en el mundo compartido ni en el local de F8
sin conseguir antes los materiales, y lo que interesa medir es colocar, orientar y andamio.

## Decisión
Un server propio en creativo, `servidor-creativo/` (Minecraft 26.1.2, plano, pacífico, siempre de día; 127.0.0.1:25573, RCON
25583; bots con `WORLD=creativo`; `make creative-server-*` y `make creative-rcon`). Si el bot está en creativo, cada tanda de una
obra del catálogo se la pone del inventario creativo (`abastecer.pilas` + `bot.creative.setInventorySlot`), sin cofres ni talar.
Las obras enormes se prueban primero recortadas: `make import-structure … CROP="x0 y0 z0 x1 y1 z1"`.

## Alternativas descartadas
- `/give` por RCON en cada tanda: obliga a un guion aparte que sepa las tandas.
- Probar en supervivencia: mide también el abasto, que ya está medido con las casitas.

## Consecuencias
El tope de tandas de una obra pasa a `max(40, bloques/300 + 10)`. No arrancar a la vez que `servidor-local/` con menos de 3 GB
libres. El mundo y la clave RCON quedan fuera de git; los scripts, dentro.
