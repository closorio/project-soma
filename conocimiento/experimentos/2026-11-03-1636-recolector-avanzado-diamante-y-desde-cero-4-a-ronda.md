---
tipo: experimento
fecha: "2026-11-03 16:36"
autor: seppuq
titulo: "Recolector avanzado: diamante y desde cero (4.ª ronda)"
entorno: minecraft
politica: conseguir.js
N: 3
semilla: ""
metrica: pruebas que pasan
valor: 1/3
base: todas
veredicto: dudoso
fuente: servidor-supervivencia/logs/conseguir-20261103-1636.json
---
# Recolector avanzado: diamante y desde cero (4.ª ronda)

Puerta bench-gather: no pasa (1/3 pruebas).

| prueba | pasa | detalle |
|---|---|---|
| diamante | sí | 4/5: poca vida (murió) |
| cero | no | 2/5: cancelado; no pude fundir el hierro del pico (no se pudo: destination full); no tengo madera para los palos del pico de hierro |
| muertes | no | 1 |

Fuente: `servidor-supervivencia/logs/conseguir-20261103-1636.json`

## Conclusión

Diamante 4/5 (pasa por material), cero 2/5, 1 muerte: no pasa. Mezcla dos versiones: diamante con 98125df; cero, reanudado tras un
corte de RCON, con 1c8775d (respirar nuevo). El resultado de cero es peor que en la 3.ª ronda (3/5), pero con N=5 y causas
concretas no se puede decir que sea una regresión general; una de las causas sí la introdujo el reflejo nuevo.
- La muerte (diamante, 5.º): ahogado junto a un lago. El reflejo antiguo combinaba el salto con un objetivo del navegador y pasó
  15 s sin subir. Con el nuevo no hubo muertes en cero, y en una salida picó 2 de techo.
- Cero 1: bucle de explorar en el agua: 1 s a flote con el aire a 9 y otra vez abajo, 8 cortes hasta «cancelado». Lo introdujo 1c8775d.
- Cero 3: fundir. Corrige el diagnóstico de [[2026-11-03-1424-recolector-avanzado-diamante-y-desde-cero-3-a-ronda]]: «Can't find
  oak_planks» no era la mesa comiéndose los troncos, sino sumar especies; y el combustible que quedaba daba «destination full».
- Cero 4: subió en pilar al aire libre (en una ladera, bajo y0−4), acabó en mal sitio y la tala falló en 4 árboles.

Arreglado en e0afbc7: combustible por especie, sacar del horno lo que sobra, a flote hasta recuperar el aire, salir del agua cortado
cuenta como intento, tala de otro sitio una vez, y al aire libre no cuenta como bajo tierra. Solo en seco (75/75): sin medir en el server.
Siguiente: 5.ª ronda `make bench-gather ONLY=diamante,cero`, con todo el mismo código.
