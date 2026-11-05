---
tipo: experimento
fecha: 2026-11-05
autor: seppuq
titulo: Banco M tras los arreglos de la prueba a mano
entorno: minecraft
politica: "reglas del Minero con los arreglos de 13d682e, terreno regenerado y sin monstruos al colocar"
N: 3
semilla: ""
metrica: pruebas que pasan
valor: 1/3
base: todas
veredicto: dudoso
fuente: servidor-supervivencia/logs/rol-minero-20261105-1152.json
---
# Banco M tras los arreglos de la prueba a mano

Puerta Banco M: hierro ≥ 24 al acabar en ≥ 6/8 y 0 muertes por lava: no pasa (1/3 pruebas).

| prueba | pasa | detalle |
|---|---|---|
| hierro ≥ 24 al acabar | no | 4/8, mediana 31 (finales 0, 0, 0, 4, 31, 32, 32, 37); máximos ≥ 24 en 6/8 |
| 0 muertes por lava | sí | 0; 26 muertes por monstruos en 3 de los 8 personajes |
| puntos fijos en las tres tiradas | no | 3/5, frente a 2/5 y 1/5; movidos 1/3 en las tres |

Fuente: `servidor-supervivencia/logs/rol-minero-20261105-1152.json`

## Conclusión

4/8: no pasa, aunque 6/8 llegaron a 24 de hierro o más. M3 (rot. 0) y M2 (rot. 1) lo tuvieron y lo perdieron al morir. Es una sola tirada y el montaje cambió (sin monstruos al colocar), así que la subida desde 2/8 y 3/8 no se debe solo a los arreglos; un mismo punto salta de 32 a 0 entre tiradas.

| Punto | 3/8 | 2/8 | Esta |
|---|---|---|---|
| rot0 M1 (4276, 4824) | 32 | 0 | 0 |
| rot0 M2 (4344, 4820) | 0 | 3 | 31 |
| rot0 M4 (4240, 4724) | 0 | 2 | 32 |
| rot1 M1 (15036, 15068) | 4 | 6 | 37 |
| rot1 M2 (14964, 15068) | 33 | 32 | 0 |
| **Fijos ≥ 24** | **2/5** | **1/5** | **3/5** |
| rot0 M3 (movido) | 32 | 0 | 0 |
| rot1 M3 (movido) | 0 | 5 | 4 |
| rot1 M4 (movido) | 0 | 32 | 32 |
| **Movidos ≥ 24** | **1/3** | **1/3** | **1/3** |

Los puntos movidos no son el mismo sitio en cada tirada, salvo rot1 M3 en las dos últimas.

Causa de cada fallo:
- **rot0 M3 (0, máximo 32):** 13 muertes por Drowned en menos de 4 min. Reaparece a unos 30 bloques y vuelve sin equipo a por sus cosas. Ver [[Las muertes en cadena no paran al recuperar]].
- **rot0 M1 (0, máximo 13):** 9 muertes en 6 min. Empieza en una mina a y=31 con esqueleto y creeper a la vez; recupera 69/240 y vuelve a caer en la misma zona.
- **rot1 M2 (0, máximo 24):** 116 `huir creeper → sin camino` y un creeper lo mata con 205 objetos. A los 16 s se desconectan los cuatro por tiempo agotado y, al volver, se anota otra muerte con 0 objetos que cancela la recuperación. Ver [[Una muerte tras reconectar borra el sitio de las cosas]].
- **rot1 M3 (4, sin muertes):** el pico se gasta; `cavar_escalera → pico gastado` se repite 20 veces y no pasa de `m_pozo`.

Los `¿bucle?` fueron 122 `equipar arma` y 116 `huir creeper`. Sin comprobar: por qué se agotó el tiempo de los cuatro a la vez y por qué M3 no se hizo otro pico.

No se arregla ni se relanza nada hasta que el usuario lo pida.
