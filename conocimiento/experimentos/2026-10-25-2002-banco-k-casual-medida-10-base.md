---
tipo: experimento
fecha: "2026-10-25 20:02"
autor: seppuq
titulo: banco K Casual, medida 10 (base en puntos fijos)
entorno: minecraft
politica: [capataz@casual]
N: 8
semilla: 20261024
metrica: pico de hierro y cama en ≤ 2 días
valor: 2/8
base: ""
veredicto: pendiente
fuente: servidor-supervivencia/logs/rol-casual-20261025-2002.json
---
# banco K Casual, medida 10 (base en puntos fijos)

## Montaje
- Comando: `experimentos_roles.py --puntos entrenamiento/puntos_k.json --dias 2`.
- Puntos: los 8 puntos fijos de `entrenamiento/puntos_k.json`, desde la zona 70: 3-8 ovejas y 3-14 árboles en cada uno, en terreno que ninguna medida había pisado.
- Restauración: antes de medir se restaura la foto de sus regiones (`servidor-local/banco_k/`, 15 regiones). En las dos restauraciones hechas (humo y medida) las ovejas y los árboles coincidieron con la foto.
- Personajes: los 8 juegan a la vez, en una sola rotación de 2 días. Tardó 42 min reales, frente a 107 de la medida 9.
- Código: el de `aafecd7`, que añade el corte de rutinas «sin avance».
- Criterio, el de siempre:
  - pico de hierro y cama en ≤ 2 días en ≥ 6/8;
  - muertes ≤ 1 cada 3 días.

**Es la base emparejada**: la siguiente ronda de F8.1 se mide en los mismos puntos con `--comparar` contra este JSON.

## Resultados
| bot | punto | ovejas | pico de hierro | cama | muertes reales |
|---|---|---|---|---|---|
| K1 | 105180, 105148 | 8 | 1,05 | — | 0 |
| K2 | 106308, 106364 | 4 | 1,12 | **1,27** | 0 |
| K3 | 106404, 106004 | 3 | — | — | 0 |
| K4 | 107960, 107904 | 4 | 0,51 | — | 1 (ahogado) |
| K5 | 108400, 107968 | 6 | — | — | 2 (ahogado; un ahogado zombi) |
| K6 | 109441, 109057 | 4 | 0,43 | **1,44** | 0 |
| K7 | 110840, 111240 | 4 | 1,38 | — | 0 |
| K8 | 112475, 112859 | 4 | 1,42 | — | 1 (zombi) |

- Pico de hierro: 6/8, mediana día 1,12.
- Cama: 2/8.
- Pico y cama en ≤ 2 días: **2/8, no pasa**.
- Casa: 0/8.
- Muertes reales: 4 en 16 días·bot (0,75 cada 3 días en conjunto). El JSON cuenta 8: las otras 4 son asfixias del propio banco en los 10 primeros segundos. Se desconectaron en sus túneles del humo y la foto los volvió a llenar de piedra. Arreglado: al restaurar se borran sus datos de jugador.
- Cazas: 6 con éxito, 9 «no la alcancé», 3 «amenaza» y 2 «no hay ovejas».
- Rutinas de madera: 12 «hecho», 4 «atasco» y 2 «sin avance». El corte nuevo actuó dos veces.

## Conclusión
El terreno fijo y los 8 a la vez funcionan:
- la restauración es reproducible;
- la medida cuesta la mitad de tiempo;
- el bucle de `ir_a_arbol` ya no se come una partida.

Este terreno es más duro que el de la medida 9 (pico 6/8 con mediana 1,12, frente a 7/8 con 0,37), con agua cerca de K4 y K5. Por eso esta medida no se compara con las anteriores, solo con las siguientes en los mismos puntos. Los cuellos de botella siguen siendo la cama (cazar desde la mina) y el agua.
