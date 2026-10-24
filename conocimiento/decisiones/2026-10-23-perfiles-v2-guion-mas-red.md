---
tipo: decision
fecha: 2026-10-23
autor: seppuq
estado: vigente
fases: ["[[F8 Perfiles reales de juego]]"]
---
# Perfiles v2: guion por rol más red

## Contexto
El usuario pidió perfiles reales de juego (Redstoner, Speedrunner, Casual, Builder; de apoyo Granjero, Minero y Explorador) y que los perfiles actuales quedaran como skills. Había que decidir hasta dónde llega el roadmap, quién planifica la progresión y dónde se mide.

## Decisión
- El roadmap llega **hasta el dragón**, por etapas medibles, y se para donde se llegue.
- La progresión la lleva un **guion determinista por rol en JS** (el capataz, sin tokens); la **red** decide solo la zona gris (cuándo seguir, volver, abastecerse, bajar o pelear) y se clona del guion por DAgger. Alma queda fuera del bucle: evalúa y propone.
- La evaluación repetible se hace en un **servidor local propio 26.1.2 con RCON**; el server del compañero es solo para jugar.
- Los perfiles v1 (`perfiles/*.json`) no se mueven: pasan a ser estilos de rutinas. Los roles van en `perfiles/v2/`.

## Alternativas descartadas
- Que Alma planifique y la red ejecute: gasta tokens y rompe la regla «el modelo propio decide sin tokens».
- Todo con la red, sin guion: lo más lento e incierto.
- Medir en el server del compañero con RCON: alteraría su mundo.

## Consecuencias
Primero hay que montar la infraestructura (F8.0a) y el cuerpo base (F8.0b) antes de entrenar ningún rol. Plan completo en `PLAN_F8_perfiles.md`.
