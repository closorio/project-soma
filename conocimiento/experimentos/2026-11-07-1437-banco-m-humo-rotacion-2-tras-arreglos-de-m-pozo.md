---
tipo: experimento
fecha: 2026-11-07
autor: seppuq
titulo: "Banco M, humo de la rotación 2 tras los arreglos de m_pozo"
entorno: minecraft
politica: "reglas del Minero, 77ff430 (huida sin camino y columna con agua), terreno regenerado"
N: 4
semilla: ""
metrica: hierro ≥ 24 al acabar
valor: 3/4
base: "rotación 2 de banco-m-base-20261105: 2/4, 2/4, 1/4 y 2/4"
veredicto: provisional
fuente: servidor-supervivencia/logs/rol-minero-20261107-1437.json
---
# Banco M, humo de la rotación 2 tras los arreglos de m_pozo

Solo la segunda rotación (`make bench-m ZONE=3 REGEN=1 FROM_ROT=1 ROTS=1`): los mismos 4 puntos que en la base y 2 días. No es un veredicto: [[2026-11-05-tiradas-del-banco-m]] pide 4 tiradas completas.

| Punto | Base (4 tiradas) | Ahora | Muertes |
|---|---|---|---|
| (15036, 15068) | 37, 9, 1, 0 | **33** | 0 |
| (14964, 15068) | 0, 32, 0, 32 | 32 | 0 |
| (15132, 14956) | 4, 32, 32, 0 | **0** | 0 |
| (14900, 14852) | 32, 35, 33, 32 | 35 | 0 |

## Conclusión
- **Huida sin camino:** 0 veces en bucle (había 263 seguidas en la tirada de las 16:54). M1 en (15036, 15068) termina con 33 de hierro.
- **(15132, 14956) sigue en 0, por otra causa:** 46 veces seguidas `fabricar pico_piedra → fallo: sin sitio para la mesa`, porque la regla «pico gastado» de `bot/capataz.js` no tiene salida si la mesa no cabe. Es otro paso que falla siempre sin alternativa.
- Con un humo de 4 personajes, 3/4 sale por azar a menudo (la base dio 2/4 tres veces). Solo sirve como señal; el veredicto queda para las 4 tiradas.
