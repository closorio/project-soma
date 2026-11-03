---
tipo: decision
fecha: "2026-11-02"
autor: "seppuq"
estado: vigente
fases: [F8]
---
# Recolector avanzado: la orden «consigue»

## Contexto
El Minero de F8.2 (M1-M6) estaba diseñado sin código, y el usuario quiere pedir por el chat un mineral concreto («Oqva, consigue
5 diamantes») y que el bot resuelva todo lo que se interponga: el pico del nivel, las antorchas, la comida, bajar, la lava, volver.

## Decisión
Una orden `consigue N MATERIAL` (`bot/conseguir.js`) con un guion determinista sin tokens: lo urgente (vida, hambre, inventario
lleno) → el pico (ármate; hierro → fundir → pico de hierro, por el mismo bucle) → antorchas bajo y=30 → `ir_a_mena` → bajar a la
cota del mineral (`cavar_escalera`, otro rumbo si hay lava) → `cavar_tunel` (nuevo: tapa la lava y el agua en vez de pararse) → subir,
fundir y entregar a quien lo pidió (`dar`) o al cofre (`depositar`). Alcance: Overworld (carbón, cobre, hierro, lapislázuli, oro,
redstone, diamante; esmeralda solo si se ve). La netherite responde que hace falta el Nether (F8.7).
«mina N de oro/diamante/redstone/lapis» también va a `consigue`; «mina N de carbón/hierro/cobre» sigue siendo minar.

## Alternativas descartadas
- Solo etapas del capataz (rol Minero sin pedidos sueltos): el usuario quiere pedirlo por el chat. El rol `minero.json` puede usar
  `consigue` en sus etapas después.
- Incluir el Nether ya: depende de F8.4/F8.7, sin hacer.
- Un `minar_veta` aparte: `ir_a_mena` ya pica la veta por adyacencia.

## Consecuencias
Banco nuevo `make bench-gather` (`servidor-supervivencia/probar_conseguir.py`): lo pedido en ≥ 4/5 por material y 0 muertes. Aún sin
medir. Pendiente: el rol `perfiles/v2/minero.json` y el banco M del plan.
