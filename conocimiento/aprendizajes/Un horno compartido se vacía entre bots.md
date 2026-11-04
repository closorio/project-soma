---
tipo: aprendizaje
fecha: "2026-11-04"
autor: seppuq
fuente: "servidor-supervivencia/logs/subir-horno-20261104-1301.json"
---
# Un horno compartido se vacía entre bots

`fundir` limpiaba el horno sacando lo que hubiera de otro tipo. Con dos bots en el mismo horno, cada uno se llevaba lo del otro. También le pasaría a un jugador con su horno. Cualquier contenedor compartido necesita saber qué es de quién.

## Evidencia
En el banco M, M2 perdió 18 de hierro y M4 acabó con 52 (lo habitual, ≈ 34). Reproducido: dos bots, un horno, 0/3; cada uno acaba con lo del otro. Con el arreglo, 3/3: [[2026-11-04-1313-banco-de-subir-sobre-agua-y-horno-compartido]].

## Qué hacer con ello
Solo se saca lo que el propio bot dejó (`hornoMio` en su memoria, `hornoLibre` en `bot/habilidades/fundir.js`); si el horno tiene algo más o está encendido, se pone otro. Queda sin cubrir: dos bots abriendo el mismo horno vacío a la vez.
