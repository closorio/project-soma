---
tipo: experimento
fecha: "2026-11-03 14:24"
autor: seppuq
titulo: "Recolector avanzado: diamante y desde cero (3.ª ronda)"
entorno: minecraft
politica: conseguir.js
N: 3
semilla: ""
metrica: pruebas que pasan
valor: 0/3
base: todas
veredicto: mejora
fuente: servidor-supervivencia/logs/conseguir-20261103-1424.json
---
# Recolector avanzado: diamante y desde cero (3.ª ronda)

Puerta bench-gather: no pasa (0/3 pruebas).

| prueba | pasa | detalle |
|---|---|---|
| diamante | no | 3/5: no pude fundir el hierro del pico (no pude poner el horno: sin sitio); no tengo el pico que hace falta (de piedra) |
| cero | no | 3/5: no pude fundir el hierro del pico (no llego al horno: tiempo agotado); cancelado (murió) |
| muertes | no | 1 |

Fuente: `servidor-supervivencia/logs/conseguir-20261103-1424.json`

## Conclusión

Con 6079626, mejor que la 2.ª ronda ([[2026-11-03-1233-recolector-avanzado-diamante-y-desde-cero-2-a-ronda]]):
diamante 3/5 (antes 1/5), cero 3/5 (antes 1/5), 1 muerte (antes 2). No pasa (≥ 4/5 y 0 muertes).
- Ningún ahogado: el reflejo de respirar saltó 2 veces y salió las 2.
- La muerte: asfixia (`suffocated in a wall`) bajando una escalera entre grava.
- Los fallos son del horno y de la mesa en el túnel:
  - «minar piedra» no existe (la familia es `stone`);
  - el horno no tenía sitio en la roca;
  - un horno viejo a la vista, pero sin camino;
  - el combustible (troncos) se elegía antes de hacer el horno y la mesa se lo comía;
  - la mesa del pico de piedra, sin sitio.

Arreglado en f332ff1:
- `minar stone`;
- colocarAlLado abre un hueco en la roca;
- otro horno si no llega al viejo;
- el combustible, tras el horno;
- un reflejo que pica la grava de la cabeza al perder vida.

Siguiente: 4.ª ronda `make bench-gather ONLY=diamante,cero`.
