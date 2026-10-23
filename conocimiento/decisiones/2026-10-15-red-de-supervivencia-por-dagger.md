---
tipo: decision
fecha: 2026-10-15
autor: seppuq
estado: vigente
fases: ["[[F7 Supervivencia en un mundo normal]]"]
---
# Red de supervivencia por dagger

## Contexto
DQfD con la recompensa de supervivencia no daba una red fiel al guion.

## Decisión
La red de supervivencia se entrena por **clonación del guion con DAgger** (fidelidad objetivo ≥ 95 %, muertes similares al guion). Se usa la **semilla 0** (`politica_supervivencia_dagger.json`): pasa todos los criterios, 74 muertes frente a 61 del guion.

## Alternativas descartadas
DQfD con la recompensa actual. La semilla 1, que elegía la regla previa, falla «muertes similares en total».

## Consecuencias
**Selección a posteriori**, anotada: se eligió la semilla después de ver los resultados. Mejorar con refuerzo después, si procede.
