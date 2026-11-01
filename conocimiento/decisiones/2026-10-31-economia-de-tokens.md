---
tipo: decision
fecha: 2026-10-31
autor: seppuq
estado: vigente
fases: []
---
# Economía de tokens: la máquina hace el bucle y Claude lee veredictos

## Contexto
El usuario quiere seguir el proyecto gastando lo mínimo de Claude, porque el entrenamiento y los bancos corren en su máquina. El 2026-10-31, `/usage` marcó un 8 % semanal en un día. Lo del repo pesa poco (`CLAUDE.md` 3,9 KB, el resumen del vault 1,8 KB). Lo grande es el entorno de cada petición y el modo de trabajo:
- ≈ 170 skills de plugins sincronizados que aquí no se usan;
- superpowers, que empuja a brainstorming y a planes con subagentes;
- ≈ 300 nombres de herramientas MCP;
- el modelo por defecto en Opus;
- leer registros y ficheros enteros (`bot/io.js` ocupa 77 KB).

## Decisión
- **Modelo:** Sonnet por defecto en el proyecto y Haiku para los subagentes (`.claude/settings.json`). Opus o Fable solo para diseñar una fase.
- **Reglas de trabajo** en `CLAUDE.md`, sección «Economía de tokens»: una tarea por sesión, sin plan, brainstorming ni subagentes en lo acotado, leer por trozos y sin sesiones de Alma salvo petición.
- **`make report`** (`entrenamiento/parte.py`): un parte de ≤ 20 líneas en lugar de los registros.
- **`make nightly BENCHES="…"`** (`entrenamiento/nocturno.sh`): bancos en serie sin Claude, con la regla de RAM.
- **El usuario** desactiva en este proyecto los plugins y conectores que no usa, y lo mide con `/context`.

## Alternativas descartadas
- **Trabajadores Opus por fase**, como estimaba F8 (110-140 h). Es lo más caro del roadmap.
- **Recortar `CLAUDE.md` o el vault.** Ya pesan poco; no es ahí donde se va el gasto.

## Consecuencias
- F8 y F-asistente avanzan con sesiones cortas y bancos nocturnos.
- La medición de Alma (F6, T1-T3) es el único experimento que gasta Claude por diseño, y queda para el final.
- Se revisa si `/usage` no baja tras una semana con estas reglas.
