---
tipo: decision
fecha: 2026-10-31
autor: seppuq
estado: vigente
fases: ["[[Asistente personal]]"]
---
# El asistente gasta como mucho el 5 % del cupo semanal de Claude

## Contexto
El usuario pidió (2026-10-31) un límite de uso semanal de Claude del 5 % para la línea F-asistente. Soma no usa Claude en ejecución, porque es todo guion, sin red, sin Alma y sin `mente.py`. El gasto está en el trabajo de desarrollo y medida. Claude Code no da el porcentaje semanal a los scripts.

## Decisión
- Todo el trabajo de Claude en F-asistente cabe en **≤ 5 % del cupo semanal**.
- **Medida:** al empezar y al acabar cada sesión, el usuario mira `/usage`. La diferencia se apunta en el diario: `uso F-asistente: +N % (acumulado semanal M %)`.
- **Corte:** al llegar al 5 %, se para en el siguiente punto estable (pruebas en verde y commit) y se sigue la semana siguiente. Sin el dato, no se abre una fase nueva en esa sesión.
- **Para gastar poco:**
  - sin subagentes ni workflows;
  - sin sesiones de Alma;
  - bancos y pruebas de humo en segundo plano, sin sondeos;
  - leer solo los fragmentos necesarios.

## Alternativas descartadas
- **Un limitador automático.** No hay forma fiable de leer el porcentaje desde el repo.
- **Trabajadores con Opus por fase**, como en F8. Gastan mucho más contexto.

## Consecuencias
El roadmap se reparte en semanas: A0 en una y, después, ≈ 1 fase por semana. Plan en `PLAN_asistente.md`, «Límite de uso».
