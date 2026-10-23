---
tipo: decision
fecha: 2026-10-23
autor: seppuq
estado: vigente
fases: ["[[Conocimiento compartido en Obsidian]]"]
---
# Vault de obsidian en el repo

## Contexto
El conocimiento del proyecto estaba disperso en PLAN.md, diarios largos y JSON de medida que no viajan por git.

## Decisión
Un **vault de Obsidian en `conocimiento/`**, dentro del repo, sincronizado por git, con **solo plugins del núcleo** (Bases, Plantillas, Notas diarias). Hub = lo inmediato; vault = lo durable; memoria automática de Claude = lo personal.

## Alternativas descartadas
Todo el repo como vault (mezcla código, node_modules y .venv). Vault aparte con Obsidian Sync (más piezas). Plugins de la comunidad como Dataview (hay que confiar en ellos e instalarlos en los dos PCs).

## Consecuencias
PLAN.md no se toca de momento: lo leen la mente y las skills de Ío. Las notas del roadmap resumen y enlazan.
