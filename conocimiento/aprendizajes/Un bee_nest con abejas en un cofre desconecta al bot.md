---
tipo: aprendizaje
fecha: 2026-11-02
autor: seppuq
fuente: "servidor-supervivencia/logs/bot-Teo.log, bot/habilidades/revisar_cofres.js"
---
# Un bee_nest con abejas en un cofre desconecta al bot

Abrir un cofre que guarda un `bee_nest` (o colmena) con abejas dentro rompe la lectura del paquete: `Read error … array size is abnormally large, not reading: 168296465` en `SlotComponent`, y 30 s después `client timed out`. El bot (protocolo 26.1 por ViaProxy contra Paper 26.3) no sabe leer el componente `minecraft:bees` (sus `entity_data` traen arrays de enteros, p. ej. `Paper.OriginWorld`).

## Evidencia
«haz una granja de piedra» desconectaba a Teo siempre al revisar los cofres de HOGAR. Probado abriendo a mano: el cofre de 723, 74, -933 con el panal caía siempre con ese mismo número; sin el panal se abre y el barrido de los 36 cofres termina sin caídas. Los `beehive` sin abejas no dan problema.

## Qué hacer con ello
No guardar paneles con abejas en cofres de la zona de trabajo. El arreglo de fondo sería parchear la lectura de `minecraft:bees` en el protocolo del bot (pendiente).

Aparte: una zona sin `y1`/`y2` abarca todo el eje y; `revisar_cofres` ahora descarta los cofres a más de 10 bloques de altura del bot en esos casos.
