---
tipo: decision
fecha: "2026-11-03"
autor: "seppuq"
estado: vigente
fases: [F8]
---
# Recolector aceptado sin cumplir el criterio y criterio del banco M en el inventario

## Contexto
Tras cuatro rondas de `make bench-gather`, cada una con causas nuevas, el usuario tiene que elegir entre seguir midiendo el recolector o pasar al Minero. Además, el banco M de `PLAN_F8_perfiles.md` pide el hierro «en el cofre», pero el rol Minero se lo queda: sus etapas miden el inventario (`entregar: false` en `conseguir`).

## Decisión
**Recolector:** el usuario da el diamante por bueno, deja «desde cero» como pendiente conocido y no se hace la 5.ª ronda. Es una aceptación sin cumplir el criterio del banco (≥ 4/5 por material y 0 muertes):
- Diamante 4/5, con 1 muerte (ahogado, con el reflejo antiguo).
- Desde cero 2/5.
- Hierro, oro, redstone y lapis solo se midieron en la 1.ª ronda, con código antiguo.
- `e0afbc7` solo está probado en seco. Ver [[2026-11-03-1636-recolector-avanzado-diamante-y-desde-cero-4-a-ronda]].

**Banco M:** hierro crudo + lingotes en el inventario al acabar los 2 días, ≥ 24 en ≥ 6/8, y 0 muertes por lava. Fijado antes de medir.

## Alternativas descartadas
- 5.ª ronda del recolector (≈ 1,5 h): el usuario prefiere avanzar.
- Mantener «en el cofre»: obliga a rehacer los objetivos de las etapas para que el Minero no vuelva a buscar lo que ya guardó; más código y otra causa posible de fallo antes de medir.

## Consecuencias
- Un bot que muere pierde el hierro y no cuenta: el JSON anota también `hierro_max` para ver lo perdido.
- El banco M mide si el Minero junta el hierro, no si lo pone a disposición de otros. Si F8.9 (Casual + Minero) necesita el cofre, hay que revisarlo entonces.
- Si `conseguir` falla en el Minero o en el Casual por lo que quedó pendiente, se revisa la aceptación.
