---
tipo: decision
fecha: 2026-10-31
autor: seppuq
estado: vigente
fases: ["[[Asistente personal]]"]
---
# El asistente es todo guion, sin red

## Contexto
El usuario pidió un alcance reducido que no cueste entrenar. En este proyecto la CPU no es lo caro: DAgger tarda 4-6 min. Lo caro son las horas de trabajador y las sesiones con servidor para escribir un simulador y medir la red. Además, en F2-F7 la red acabó empatando con el guion ([[La red empata con el guion y por qué]]).

## Decisión
- El asistente es un **rol v2 del capataz** (`perfiles/v2/asistente.json`), con habilidades compuestas deterministas: `minar_punto`, `expedicion`, `recuperar_objetos` y `rutina_granja`.
- **No hay red en v1.**
- La fase A6, opcional, clonaría la zona gris («cuándo volver», «cuándo bajar») por DAgger. Solo se abre si una medida de A2 o A3 muestra que el guion falla justo ahí.

## Alternativas descartadas
- **Red pequeña desde el principio.** Obliga a escribir el simulador de la zona gris, que es lo caro, y a medir una vez más, sin indicio de que mejore al guion.

## Consecuencias
- Coste estimado: ≈ 50-60 h de trabajador y 0 min de entrenamiento.
- Todas las puertas se miden con bancos por RCON en `servidor-local/`.

Plan en `PLAN_asistente.md`.
