---
tipo: decision
fecha: 2026-10-23
autor: seppuq
estado: vigente
fases: ["[[Trabajo a dos]]"]
---
# Push con canal propio

## Contexto
Con el hub, lo del compañero solo entra cuando alguien escribe un prompt.

## Decisión
Un **channel MCP propio** (`compartido/canal.py`, stdlib) que espera en un long-poll del hub y empuja los mensajes a la sesión. Se activa solo con el lanzador `compartido/claude-canal`.

## Alternativas descartadas
Websockets: necesitan librería y no aportan sobre el long-poll. Solo `/loop`: gasta turnos.

## Consecuencias
Es research preview (flag `--dangerously-load-development-channels`). Despierta una sesión ociosa pero no interrumpe una herramienta en curso.
