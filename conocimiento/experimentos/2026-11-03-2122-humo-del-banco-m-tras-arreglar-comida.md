---
tipo: experimento
fecha: "2026-11-03 21:22"
autor: seppuq
titulo: Humo del banco M tras arreglar comida
entorno: minecraft
politica: "capataz@minero"
N: 3
semilla: ""
metrica: pruebas que pasan
valor: 2/3
base: todas
veredicto: mejora
fuente: servidor-supervivencia/logs/rol-minero-20261103-2122.json
---
# Humo del banco M tras arreglar comida

Puerta bench-m-smoke: no pasa (2/3 pruebas).

| prueba | pasa | detalle |
|---|---|---|
| sigue tras morir (kill forzado a los 3 min) | sí | recoge sus cosas, vuelve a libre y sigue |
| llega al pico de hierro tras morir | sí | día 0,46, con la muerte en torno al día 0,15 |
| m_pozo | no | cavar_escalera 0: hueco; se acaba el medio día en esa etapa |

Fuente: `servidor-supervivencia/logs/rol-minero-20261103-2122.json`

## Conclusión

Tras una muerte forzada cerca de la superficie, el bot recupera sus cosas, vuelve a libre y llega al pico de hierro en medio día. No predice el criterio: 1 bot, 1 punto, y el medio día no alcanza `m_hierro`.

Sin comprobar en el server: `recoger_comida … guardar` (recuperó la comida y la etapa quedó hecha sin usarlo; solo seco) y el reintento de recuperar tras no llegar (esta vez llegó).

Encontrado: `m_pico_diamante` se marca hecha al fabricar el pico de hierro, porque `NIVEL` da 1 a hierro y a diamante (`progresion.js:13`). No afecta al criterio de hierro, pero el Minero nunca haría el pico de diamante. Sin arreglar.

Siguiente paso: `make bench-m` si el usuario lo pide.
