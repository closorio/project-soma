---
tipo: decision
fecha: 2026-10-15
autor: seppuq
estado: vigente
fases: ["[[F7 Supervivencia en un mundo normal]]"]
---
# Reaccion al dano

## Contexto
Había que decidir cuándo el bot huye y cuándo se defiende al recibir daño en supervivencia.

## Decisión
Huye solo si hay **más de 2 enemigos** (3 o más) o la salud es **< 8**; en cualquier otro caso se defiende con `atacar`. Creeper: apartarse siempre. El daño que no viene de monstruos no cuenta. Regla «acorralado» (aprobada tras F7.2): si huir falla y un monstruo sigue a ≤ 4 bloques, se defiende igualmente.

## Alternativas descartadas
Huir al recibir cualquier golpe (propuesta de F7.3); contar golpes en una ventana de 3 s; contar atacantes distintos en 3 s.

## Consecuencias
Sustituye a las dos anotaciones anteriores sobre golpes de PLAN_F7_supervivencia.md. Se aplica en el bot (F7.2) y en el simulador (F7.3).
