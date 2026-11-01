---
tipo: roadmap
fase: F-asistente
estado: en-curso
responsable: seppuq
actualizado: 2026-10-31
siguiente: "A1 rol asistente, órdenes y memoria; antes, decidir si se archivan zonas.json, cofres.json y obras.json del mundo 1.21.11 borrado"
---
# Asistente personal

## Objetivo
Un personaje que ayuda al usuario en su propio mundo, en Minecraft Java 26.3, con órdenes sencillas por chat o voz:
- mina en un punto fijo;
- baja a las cuevas profundas y trae minerales;
- cuida una granja mínima de trigo, vacas, ovejas y gallinas;
- si muere, vuelve a recoger sus cosas.

Todo es guion, sin red que entrenar.

## Estado
**A0 hecha (2026-10-31): puerta 7/7.** El mundo del usuario es vanilla 26.3 en `servidor/` y Soma entra por ViaProxy 3.4.14 (25568), con `bot/tick_end.js`. Camina, pica, pone, usa el cofre, fabrica en la mesa y duerme, con 10 min sin cortes. Ver [[2026-10-31-2110-a0-humo-26-3-por-viaproxy]], [[26.3 expulsa al bot sin tick_end]] y [[26.3 trae la lista blanca activada]]. Límite: ≤ 5 % del cupo semanal de Claude ([[2026-10-31-asistente-limite-semanal-5]]).

**Plan (2026-10-31).** Es un rol v2 del capataz (`asistente`) con seis órdenes nuevas y cuatro habilidades compuestas, montadas sobre las que ya existen. Se llega a 26.3 con un puente ViaProxy; ver [[2026-10-31-tick-end-por-envoltorio]], que sustituye a [[2026-10-31-asistente-en-26-3-por-viaproxy]]. No hay red en v1; ver [[2026-10-31-asistente-todo-guion-sin-red]].

Fases: A0 puente 26.3 → A1 rol, órdenes y memoria → A2 minar en un punto → A4 muerte y recuperación → A3 expedición profunda ∥ A5 granja → A6 red (opcional). Coste: ≈ 50-60 h de trabajador y 10-12 sesiones con servidor.

## Siguiente paso
Ver campo «siguiente». El asistente es Soma, en un mundo 26.3 nuevo. Antes de A1, el usuario decide qué hacer con los datos del mundo 1.21.11 borrado.

## Enlaces
- Decisiones: [[2026-10-31-tick-end-por-envoltorio]], [[2026-10-31-asistente-todo-guion-sin-red]], [[2026-10-31-asistente-limite-semanal-5]]
- Experimentos: [[2026-10-31-2110-a0-humo-26-3-por-viaproxy]]
- Relacionado: [[F8 Perfiles reales de juego]] (Minero M2-M5 y Granjero G1-G4 comparten habilidades)
- Detalle: `PLAN_asistente.md` (fuera del vault).
