---
tipo: experimento
fecha: "2026-11-04 16:05"
autor: seppuq
titulo: Banco de recuperar tras un golpe
entorno: minecraft
politica: "recuperar mis cosas en bot/io.js, sin red, sin monstruos salvo un zombi quieto, modo órdenes"
N: 1
semilla: ""
metrica: pruebas que pasan
valor: 1/1
base: todas
veredicto: mejora
fuente: servidor-supervivencia/logs/recuperar-20261104-1605.json
---
# Banco de recuperar tras un golpe

Puerta banco de recuperar, 3/3: los 32 de hierro de vuelta en ≤ 90 s tras morir y recibir un golpe de camino, sin otra muerte y sin abandonar la agenda: pasa (1/1 pruebas).

| prueba | pasa | detalle |
|---|---|---|
| recuperar con un golpe por el camino | sí | 6/6, en 17-20 s; sin arreglar 0/3, abandonada las 3 veces |

Fuente: `servidor-supervivencia/logs/recuperar-20261104-1605.json`

## Conclusión

Arregla lo que más pesó en [[2026-11-04-1445-banco-m-tras-los-arreglos-de-subir-y-horno]]. Medida sin arreglo: `recuperar-20261104-1545.json`. Eran cuatro defectos encadenados, que solo se vieron al ir quitando uno tras otro (1/3, 1/3, 4/6, 6/6):

1. Un golpe cancelaba la tarea sin motivo y la agenda borraba «recuperar mis cosas»: ver [[Cortar una tarea sin motivo la borra de la agenda]].
2. Cortada mientras recogía, olvidaba el sitio de la muerte y al retomarla no sabía adónde ir.
3. `conMovimientos` borra el destino al acabar: un reflejo que terminaba después dejaba a la tarea siguiente quieta, sin aviso, hasta agotar el tiempo. `moverHasta` lo repone ahora, y lo usan casi todas las habilidades: `make test` pasa, pero el efecto en un banco largo no está medido.
4. `GoalNear` cuenta bloques enteros y `viajeLargo` la distancia exacta: parado a 2,1 de un destino con margen 2, acababa en «sin camino» a dos pasos de sus cosas.

El montaje del banco se ensanchó de 9 a 25 bloques durante el arreglo, por si los bordes influían; no era la causa, y el criterio no cambió.

No medido: monstruos de verdad, varios a la vez, muertes en agua (M4 murió ahogado y el sitio sigue inundado), ni la vuelta al modo libre con este arreglo. Sin morir no aporta nada, y no arregla por qué murieron.

Siguiente: el usuario decide si repite el banco M en estas zonas (≈ 80 min) para compararlo con el 3/8.
