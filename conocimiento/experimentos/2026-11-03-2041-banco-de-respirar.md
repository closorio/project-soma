---
tipo: experimento
fecha: "2026-11-03 20:41"
autor: seppuq
titulo: Banco de respirar
entorno: minecraft
politica: respirar.js
N: 2
semilla: ""
metrica: pruebas que pasan
valor: 2/2
base: todas
veredicto: mejora
fuente: servidor-supervivencia/logs/respirar-20261103-2041.json
---
# Banco de respirar

Puerta bench-breath: pasa (2/2 pruebas).

| prueba | pasa | detalle |
|---|---|---|
| aire a 6 bloques por el agua | sí | 3/3, 0 picados, 7-9 s |
| sellado con techo de 1 | sí | 3/3, 1 picado, 7-9 s |

Fuente: `servidor-supervivencia/logs/respirar-20261103-2041.json`

## Conclusión

En un recinto hecho a medida, con pico de piedra, respirar pasa 3/3 en los dos casos. El bot nada hasta el aire en 3-4 s sin picar. Es coherente con la hipótesis del ahogamiento del humo (salida a pocos bloques), pero el sitio real no se ha reproducido y no se puede decir que ya no se ahogue. Las dos primeras tandas no cuentan: una la tumbó un corte de RCON (ahora se repite en `servidor/rcon.py`; causa del corte sin conocer) y la otra medía mal la cabeza fuera (`anchored eyes` daba agua aunque respirara); ahora se mira si se recupera `Air`.
