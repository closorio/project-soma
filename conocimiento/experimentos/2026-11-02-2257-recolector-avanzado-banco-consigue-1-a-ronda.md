---
tipo: experimento
fecha: "2026-11-02 22:57"
autor: seppuq
titulo: "Recolector avanzado: banco consigue (1.ª ronda)"
entorno: minecraft
politica: conseguir.js
N: 7
semilla: ""
metrica: pruebas que pasan
valor: 4/7
base: todas
veredicto: dudoso
fuente: servidor-supervivencia/logs/conseguir-20261102-2257.json
---
# Recolector avanzado: banco consigue (1.ª ronda)

Puerta bench-gather: no pasa (4/7 pruebas).

| prueba | pasa | detalle |
|---|---|---|
| hierro | sí | 5/5 |
| lapis | sí | 4/5: no tengo el pico que hace falta (de piedra) |
| oro | sí | 5/5 |
| redstone | sí | 5/5 |
| diamante | no | 3/5: hecho (murió); no tengo el pico que hace falta (de hierro: faltan materiales: oak_log 1) |
| cero | no | 1/3: no tengo el pico que hace falta (de piedra); no tengo el pico que hace falta (de piedra) |
| muertes | no | 1 |

Fuente: `servidor-supervivencia/logs/conseguir-20261102-2257.json`

## Conclusión

Hierro, oro y redstone 5/5 y lapislázuli 4/5: con kit, por encima de y≈0, el recolector cumple. El fallo del lapislázuli
(el pico de piedra se gastó abajo y «ármate» no encontró árboles) se arregló en a328358. Diamante 3/5 y «cero» 1/3 son del código
anterior a 2637a48 (el banco se cortó por un golpe en «ármate»). La 1.ª muerte: grava encima al subir en pilar. Se repitieron
diamante y cero en la 2.ª ronda: [[2026-11-03-1233-recolector-avanzado-diamante-y-desde-cero-2-a-ronda]].
