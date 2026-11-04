---
tipo: experimento
fecha: "2026-11-03 20:41"
autor: seppuq
titulo: Humo del banco M con muerte forzada
entorno: minecraft
politica: "capataz@minero"
N: 5
semilla: ""
metrica: pruebas que pasan
valor: 3/5
base: todas
veredicto: mejora
fuente: servidor-supervivencia/logs/rol-minero-20261103-2041.json
---
# Humo del banco M con muerte forzada

Puerta bench-m-smoke: no pasa (3/5 pruebas).

| prueba | pasa | detalle |
|---|---|---|
| sigue tras morir (kill forzado a los 3 min) | sí | vuelve a libre y rehace madera, herramientas y piedra |
| reaparece junto a su punto | sí | (38840, 64, 39388) |
| m_carbon | sí | 32/32 en 118 s, sin muertes naturales en 3 min |
| recupera sus cosas | no | no llega a su muerte, y=52: tiempo agotado; el 2.º intento dice que no ha muerto |
| completa las etapas tras morir | no | ≈ 5 min atascado en comida: recoger_comida falla con sin hambre |

Fuente: `servidor-supervivencia/logs/rol-minero-20261103-2041.json`

## Conclusión

El arreglo principal funciona: tras morir vuelve a modo libre y el capataz sigue. Un solo bot, un solo punto y una muerte forzada. Quedan dos problemas, y el primero impide que un bot que muere llegue al hierro:

1. **Atasco en `comida`.** `olvidarSiMurio` rehace las etapas de inventario y `comida` pide 16, pero `recoger_comida` falla con «sin hambre» si el hambre es > 12. El capataz alterna eso con `explorar - 120 150` hasta que le entra hambre: ≈ 5 min perdidos, y seguía ahí al acabar. Durante uno de esos `explorar`, el server lo recolocó ≈ 740 veces en 55 s en el mismo punto (causa sin mirar).
2. **No recupera sus cosas.** Murió en y=52, en su mina; `viajeLargo` agota el tiempo y el reintento dice «No he muerto desde que entré» porque el primer intento ya vació `sitiosMuerte`.

Siguiente paso: decidir con el usuario si se arreglan antes del banco completo.
