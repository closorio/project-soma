---
tipo: experimento
fecha: "2026-11-03 12:33"
autor: seppuq
titulo: "Recolector avanzado: diamante y desde cero (2.ª ronda)"
entorno: minecraft
politica: conseguir.js
N: 3
semilla: ""
metrica: pruebas que pasan
valor: 0/3
base: todas
veredicto: peor
fuente: servidor-supervivencia/logs/conseguir-20261103-1233.json
---
# Recolector avanzado: diamante y desde cero (2.ª ronda)

Puerta bench-gather: no pasa (0/3 pruebas).

| prueba | pasa | detalle |
|---|---|---|
| diamante | no | 1/5: cancelado (murió); no tengo el pico que hace falta (de piedra); no tengo el pico que hace falta (de piedra); poca vida (murió) |
| cero | no | 1/5: demasiados pasos; no tengo el pico que hace falta (de hierro: faltan materiales: oak_log 1); demasiados pasos; no tengo madera para los palos del pico de hierro |
| muertes | no | 2 |

Fuente: `servidor-supervivencia/logs/conseguir-20261103-1233.json`

## Conclusión

Con 2637a48, peor: diamante 1/5, cero 1/5, 2 muertes. Causas, en el registro del bot:
- las 2 muertes, ahogado (`Prueba1 drowned` en el server) mientras ir_a_mena cavaba hacia la mena: el agua entra en el túnel y
  los reflejos solo se miran entre habilidades;
- el pico se rompe abajo y sin pico no sube en pilar («sin herramienta»), y abajo no hay árboles para rehacerlo: el kit de
  hierro no lleva madera;
- «fundir» sin piedra para el horno falla al instante y se repetía hasta 120 pasos (2 de los «cero»);
- el pico de hierro sin madera para palos y mesa.

Arreglado en 6079626: 5 troncos de reserva antes de bajar (ármate abajo, palos y mesa), subir antes de que el pico se rompa si
no hay madera, picar piedra si fundir falla (luego se rinde), las órdenes cuentan como pasos, y un reflejo de respirar en
io.js (sin aire con la cabeza en el agua: corta la tarea, nada hacia arriba o a la última casilla seca, y conseguir sigue).
Siguiente: repetir `make bench-gather ONLY=diamante,cero` (≈ 1,5 h).
