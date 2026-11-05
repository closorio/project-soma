---
tipo: decision
fecha: "2026-11-05"
autor: seppuq
estado: vigente
fases: [F8]
---
# Un veredicto del banco M pide 4 tiradas por versión

## Contexto
El Minero dio 4/8 y luego 6/8, 3/8 y 3/8 **con el mismo código** (`01e6ebe`, etiqueta local `banco-m-base-20261105`) y terreno regenerado. La misma versión pasa y no pasa, así que una sola tirada no decide. La regla para fijar el número se escribió antes de ver estos datos: distinguir una mejora de 2/8, con n ≥ 2σ² tiradas por versión.

| Tirada | Hierro ≥ 24 | Mediana | Muertes | Personajes con muertes | Por lava |
|---|---|---|---|---|---|
| 11:52 | 4/8 | 31 | 27 | 3 | 0 |
| 14:08 | 6/8 | 32 | 2 | 1 | 0 |
| 15:31 | 3/8 | 1 | 22 | 4 | 1 |
| 16:54 | 3/8 | 0 | 17 | 4 | 0 |

Media 4,0/8, rango 3, **σ = 1,41**, y por tanto n ≥ 2σ² = **4**. Con 4 muestras σ es muy imprecisa (intervalo del 95 %: 0,8 a 5,3, o n de 2 a 56). Si los personajes fueran independientes, 1,41 sería el máximo posible con 8; que no lo sean no está comprobado.

## Decisión
- **Cuatro tiradas por versión**, con `REGEN=1`. Son unas 5,5 horas: se lanzan con `make nightly`.
- **Los umbrales no cambian, pero se aplican al conjunto:** el Minero pasa con ≥ 24/32 personajes (media 6/8) y 0 muertes por lava en las cuatro tiradas.
- **La base es 16/32 y 1 muerte por lava.** Esta versión no pasa, aunque la tirada de las 14:08 sí pasara sola.
- **Una tirada suelta no aprueba ni descarta nada.** Con esta base, ≥ 6/8 sale por azar en torno al 10-15 % de las veces.

## Alternativas descartadas
- **Seguir con una tirada:** la versión actual habría quedado aprobada o suspendida según cuál tocara.
- **Ocho tiradas para afinar σ:** 11 horas por versión antes de saber si la precisión extra cambia algo. Se revisa con los datos, abajo.

## Consecuencias
**Resultado por punto.** Los 8 puntos fueron los mismos en las 4 tiradas, así que aquí no hay puntos movidos. Dos pasan siempre y los otros seis solo 8 de 24 veces; este patrón se vio después de medir y son pocas muestras.

| Punto | ≥ 24 | Finales |
|---|---|---|
| (4240, 4724) | 4/4 | 32, 33, 32, 32 |
| (14900, 14852) | 4/4 | 32, 35, 33, 32 |
| (14964, 15068) | 2/4 | 0, 32, 0, 32 |
| (15132, 14956) | 2/4 | 4, 32, 32, 0 |
| (4276, 4824) | 1/4 | 0, 32, 0, 0 |
| (4344, 4820) | 1/4 | 31, 1, 0, 0 |
| (4228, 4720) | 1/4 | 0, 35, 0, 0 |
| (15036, 15068) | 1/4 | 37, 9, 1, 0 |

**Dónde se pierden los 16 fallos de 32:**
- **6 sin morir y sin llegar a 24:** 5 acaban en `m_pozo` con «mina» pendiente, y 3 de los 6 son del punto (15036, 15068). Es una causa nueva, sin diagnosticar.
- **5 llegaron a 24 y lo perdieron al morir.**
- **5 murieron sin llegar a 24.**

Quien no muere llega a 24 en 14 de 20 casos, y quien muere en 2 de 12. Es una correlación: no prueba que evitar las muertes dé esos 14 de 20. Hubo 68 muertes; de las 67 con causa registrada, la mayoría fueron por Drowned (22), zombis (21) y esqueletos (12).

**Para el refactor de comandos:** este banco solo ve regresiones de unos 2/8. Sirve para una comprobación final de 4 tiradas frente a esta base, no para validar cada paso; cada paso se apoya en `make verify` y en `bot/probar_frases_seco.js`.

**Se revisa si** una nueva base da σ > 2 (pediría 8 o más tiradas), o si un arreglo hace los resultados tan estables que bastan menos.
