---
tipo: experimento
fecha: "2026-10-25 14:01"
autor: seppuq
titulo: banco K Casual, medida 9
entorno: minecraft
politica: [capataz@casual]
N: 8
semilla: 20261024
metrica: pico de hierro y cama en ≤ 2 días
valor: 3/8
base: "medida 8: 1/8"
veredicto: mejora
fuente: servidor-supervivencia/logs/rol-casual-20261025-1401.json
---
# banco K Casual, medida 9

## Montaje
- Comando: `experimentos_roles.py --rol casual --dias 2 --rotaciones 2 --zona 50`.
- Mundo: servidor local 26.1.2, semilla 20261024.
- Personajes y puntos: 4 personajes K1-K4 con el capataz del Casual, × 2 rotaciones. Cada uno sale desde cero (inventario vacío, memoria borrada, `time set 0`, monstruos encendidos) en puntos de llano con ≥ 3 ovejas a ≤ 48 y ≥ 3 árboles cerca, en zonas sin estrenar (50 y 57).
- Criterio fijado antes de medir (`PLAN_F8_perfiles.md`, banco K):
  - pico de hierro y cama en ≤ 2 días en ≥ 6/8;
  - muertes ≤ 1 cada 3 días.

## Resultados
| rot. | bot | ovejas | pico de hierro | cama | muertes |
|---|---|---|---|---|---|
| 1 | K1 | 3 | 0,26 | 1,10 | 0 |
| 1 | K2 | 3 | 0,27 | — | 0 |
| 1 | K3 | 8 | 0,42 | — | 0 |
| 1 | K4 | 4 | 0,37 | 1,34 | 0 |
| 2 | K1 | 4 | — | — | 2 (creeper, ahogado) |
| 2 | K2 | 4 | 1,14 | — | 0 |
| 2 | K3 | 3 | 0,36 | 1,36 | 1 (esqueleto) |
| 2 | K4 | 4 | 1,18 | — | 0 |

- Pico de hierro: 7/8, mediana día 0,37.
- Cama: 3/8, mediana día 1,34.
- Pico y cama en ≤ 2 días: **3/8, no pasa**.
- Casa: 0/8.
- Muertes por 3 días: 3 en la rotación 2 y ninguna en la 1. Dos bots superan el criterio.
- Ninguna caída del proceso.

## Conclusión
Es la mejor medida del banco K (medida 7: 0/4 en la rotación 1; medida 8: 1/8). El pico de hierro está resuelto. La cama no, y la causa principal se ve en los registros: tras la etapa de hierro el bot está en la mina, y `cazar` sigue a la oveja de la superficie sin cavar. 19 de 28 cazas acabaron con «no la alcancé» y 5 con éxito; en las que se miraron, el bot estaba a y = 45-50.

Lo siguiente, sin tocar el diseño:
- subir a la superficie al empezar `cazar`;
- descartar los árboles inalcanzables en `ir_a_arbol`;
- un reflejo de ahogamiento;
- el tejado de `construir`.

El veredicto («mejora») es frente a la medida 8; el criterio del banco no se pasa. Detalle en `PLAN_F8_perfiles.md`, «Estado de F8.1».
