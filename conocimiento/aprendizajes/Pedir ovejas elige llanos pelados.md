---
tipo: aprendizaje
fecha: 2026-10-25
autor: seppuq
fuente: "entrenamiento/experimentos_roles.py (terreno, elegir_puntos); servidor-supervivencia/logs/rol-casual-{4,7,8}.out"
---
# Pedir ovejas elige llanos pelados

En la semilla 20261024 del mundo local hay **muy pocas ovejas**: 9 a 128 bloques de un llano y 0 a 160 de los puntos de la medida 4 del banco K. Elegir puntos de salida con ≥ 3 ovejas cerca lo arregla (decisión del usuario, 2026-10-24), pero así se eligen sobre todo **llanos sin árboles**, y la etapa de madera se alarga un día.

## Evidencia
- Medida 8, rotación 1: los 4 puntos tenían 3-4 ovejas y casi ningún árbol. K4 pasó casi un día explorando antes del primer tronco y K2 hizo 51 vueltas de `ir_a_arbol` y `apartarse (caída)` con el único árbol al borde de un desnivel. Pico de hierro en 2/4, frente a 4/4 en la medida 7.
- Contar troncos por RCON en una rejilla de 21×21 columnas (paso 3, ≤ 30 bloques) con `execute positioned X 0 Z positioned over motion_blocking_no_leaves if block ~ ~-1 ~ #minecraft:logs` cuesta 0,5 s por punto y separa los biomas: bosque 10, llano 4, desierto 2.

## Qué hacer con ello
- Un punto de salida tiene que cumplir **todo** lo que pide el rol en sus primeras etapas, no solo lo que falló la vez anterior: `terreno()` devuelve ovejas y árboles, y `elegir_puntos` exige los dos.
- Los puntos de bancos anteriores ya están talados y cazados: cada medida va a una `--zona` nueva.
- Para los bancos G (Granjero) y E (Explorador), que dependen aún más de los animales y las aldeas, valorar otra semilla antes de empezar.
