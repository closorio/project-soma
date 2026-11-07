---
tipo: experimento
fecha: 2026-11-07
autor: seppuq
titulo: "Banco M, humo de la rotación 2 tras el arreglo de la mesa"
entorno: minecraft
politica: "reglas del Minero, a9a4eca (huida sin camino, columna con agua y sin sitio para la mesa), terreno regenerado"
N: 4
semilla: ""
metrica: hierro ≥ 24 al acabar
valor: 3/4
base: "rotación 2 de banco-m-base-20261105: 2/4, 2/4, 1/4 y 2/4"
veredicto: provisional
fuente: servidor-supervivencia/logs/rol-minero-20261107-1612.json
---
# Banco M, humo de la rotación 2 tras el arreglo de la mesa

Igual que [[2026-11-07-1437-banco-m-humo-rotacion-2-tras-arreglos-de-m-pozo]] (`make bench-m ZONE=3 REGEN=1 FROM_ROT=1 ROTS=1`), con `a9a4eca`.

| Punto | Base (4 tiradas) | Humo 14:37 | Ahora | Muertes | Etapa final |
|---|---|---|---|---|---|
| (15036, 15068) | 37, 9, 1, 0 | 33 | **34** | 0 | m_deepslate |
| (14964, 15068) | 0, 32, 0, 32 | 32 | **35** | 0 | m_deepslate |
| (15132, 14956) | 4, 32, 32, 0 | 0 | 0 (máx. **32**) | 2 | madera |
| (14900, 14852) | 32, 35, 33, 32 | 35 | 29 | 1 | madera |

## Conclusión
- **Sin bucles:** ni `sin sitio para la mesa` ni `huir → sin camino`. El único repetido es `ir_a_arbol → bloqueado` (11 veces, M3, después de morir).
- **m_pozo superado:** dos personajes acaban en `m_deepslate`, ya con «mina». En la base, los cuatro de esta rotación acababan en `m_pozo`.
- **(15132, 14956) llega a 32 y lo pierde** al morir (araña de cueva y creeper). Lo que falla ahí ya no es el atasco, sino las muertes, que es la otra causa abierta del banco.
- Sigue siendo un humo de 4 personajes: sirve de señal, no da veredicto. Lo siguiente son las 4 tiradas completas contra `banco-m-base-20261105`.
