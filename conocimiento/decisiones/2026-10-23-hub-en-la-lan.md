---
tipo: decision
fecha: 2026-10-23
autor: seppuq
estado: vigente
fases: ["[[Trabajo a dos]]"]
---
# Hub en la lan

## Contexto
Dos personas con cuentas de Claude distintas quieren que sus agentes compartan contexto en tiempo real.

## Decisión
Un **hub HTTP propio en la LAN** (`compartido/hub.py`, en el PC del compañero, 192.168.1.46:3100) con estado, archivos tocados, presencia y mensajes; los hooks de `.claude/settings.json` inyectan lo nuevo en cada turno.

## Alternativas descartadas
La mensajería nativa de Claude Code (SendMessage, Remote Control, agent teams): solo llega a sesiones de la misma cuenta. Git como bus: latencia de minutos y conflictos.

## Consecuencias
Si el hub está caído, los hooks callan y no frenan nada. La configuración por máquina va en `.claude/settings.local.json`.
