---
tipo: experimento
fecha: "2026-10-15 02:45"
autor: seppuq
titulo: Perfiles en Minecraft (F5)
entorno: minecraft
politica: politica_habilidades.json
N: 72
semilla: 42
metrica: "troncos/4 min (recolector, pacífico)"
valor: 51.8
base: otros perfiles
veredicto: mejora
fuente: entrenamiento/ejecuciones/experimentos-20261014.json
---
# Perfiles en Minecraft (F5)

¿Producen los perfiles comportamientos distintos y medibles con la misma red? Io solo, `politica_habilidades.json`, 4 puntos
(semilla 42, `--excluir 305,10,317,21`), aldeano de prueba como «jugador», 240 s por ejecución, 72 ejecuciones válidas.
Criterio fijado antes de medir: |diferencia media por punto| > 2 σ_rep y el mismo signo en los 4 puntos.

| perfil | troncos pac. | junto % pac. | troncos amen. | junto % amen. | huir con el oso a la vista % |
|---|---|---|---|---|---|
| recolector (3 pasadas) | 50,5 / 51,0 / 53,8 | 0 | 20,5 / 23,5 / 25,5 | 10 / 2 / 0 | 44 / 54 / 54 |
| constructor | 53,0 | 0 | 25,2 | 9 | 49 |
| cooperativo | 1,0 | 73 | 2,2 | 46 | 52 |
| supervivencia | 52,8 | 0 | 2,0 | 45 | 92 |
| explorador | 44,0 | 20 | 21,5 | 8 | 39 |

Fuente: `entrenamiento/ejecuciones/experimentos-20261014.json` (no viaja por git) y PLAN.md § F5.

## Conclusión

- **Se distinguen**: el cooperativo en pacífico (−50 troncos y +73 puntos de «junto», unas 20 veces la dispersión entre
  réplicas; pasa el criterio en troncos) y el supervivencia con amenazas en la elección de huir (73-100 % frente a 32-71 %;
  métrica añadida después de ver los datos, hay que repetirla fijada de antemano).
- **No se distinguen**: constructor y supervivencia en pacífico (mismo guion de día), el explorador, y con amenazas ningún
  perfil en las métricas fijadas: la persecución lleva a Io al agua y al charco, y la dispersión se come la diferencia.
- Siguiente: medir las amenazas en un mundo aparte (lo recoge [[F7 Supervivencia en un mundo normal]]) y dar habilidades
  propias a constructor y explorador.
