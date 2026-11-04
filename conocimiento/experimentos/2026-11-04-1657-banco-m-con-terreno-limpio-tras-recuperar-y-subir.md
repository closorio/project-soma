---
tipo: experimento
fecha: 2026-11-04
autor: seppuq
titulo: Banco M con terreno limpio tras recuperar y subir
entorno: minecraft
politica: "Minero, commit fce9782"
N: 4
semilla: ""
metrica: pruebas que pasan
valor: 1/4
base: todas
veredicto: igual
fuente: servidor-supervivencia/logs/rol-minero-20261104-1657.json
---
# Banco M con terreno limpio tras recuperar y subir

Puerta Banco M en las zonas 3 y 10 regeneradas (hierro >= 24 en >= 6/8 y 0 muertes por lava): no pasa (1/4 pruebas).

| prueba | pasa | detalle |
|---|---|---|
| criterio hierro >= 24 en >= 6/8 | no | 2/8, finales 0 0 2 3 5 6 32 32, mediana 5 |
| 0 muertes por lava | sí | 0; 5 muertes: creeper x2, esqueleto x2, zombi x1 |
| puntos iguales que en el 3/8 | no | 5 puntos: antes 32 0 0 4 33 (2/5), ahora 0 3 2 6 32 (1/5) |
| puntos movidos por agua, aparte | no | 3 puntos: antes 32 0 0 (1/3), ahora 0 5 32 (1/3) |

Fuente: `servidor-supervivencia/logs/rol-minero-20261104-1657.json`

## Conclusión

No pasa: 2/8 frente a 6/8 exigidos, sin muertes por lava. Frente al 3/8 (`rol-minero-20261104-1324.json`) no hay mejora; la diferencia de un bot en una sola tirada no prueba que haya empeorado.

Causa de cada fallo:

| punto | hierro | qué pasó |
|---|---|---|
| rot1 M2 (zona 3), rot2 M1 y M3 (zona 10) | 3, 6, 5 | Vivos, en bucle hasta el final: [[Un paso que siempre acierta tapa al que falla]] (414, 503 y 695 `subir_a_superficie → ya fuera`). |
| rot1 M1 | 0 | Dos muertes. La segunda recuperación, con 259 objetos, se abandonó al instante: «Dejo recuperar mis cosas por la orden nueva». No sé qué orden fue. Acabó en `madera`, con `ir_a_arbol` bloqueado. |
| rot1 M3 (punto movido) | 0 | Tres muertes, las tres reapariciones en el spawn del mundo, a unos 6000 bloques de sus cosas. |
| rot1 M4 | 2 | Sin muertes. Sigue en `hierro` tras 2 días, con muchos «agua honda» y «amenaza»: sin diagnóstico completo. |

Sobre lo que se medía:

- Sin ahogados en esta tirada (el 3/8 tuvo 2). Es una sola tirada.
- Recuperar en libre apenas se ejerció: la primera de M1 sí funcionó. El «Recuperé 9/248» solo cuenta el segundo viaje; volvió a morir con 259 objetos.
- El control de agua del banco tiene dos defectos: el último candidato de `AL_LADO` se usa sin comprobar (rot1 M3 y rot2 M4), y movió rot1 M3, un punto que en el 3/8 dio 32.
- Los monstruos actúan durante la colocación: M3 huía de un creeper antes de empezar.

Registrado también aquí, sin nota propia: los arreglos de pozo y sellado de `fce9782` con `recuperar-20261104-1645.json` (base `recuperar-20261104-1639.json`, n=1; en 3 repeticiones pozo 3/3, charco 3/3, sellado 3/3), el humo con muerte forzada `rol-minero-20261104-1646.json` (pasa; el de las 16:18 falló) y el arranque fuera del agua de `c5d2d63`. El sitio que parecía inundado era el fondo de un pozo propio de 1×1 y 8 de hondo.

Lo más rentable sería arreglar el bucle, porque explica 3 de los 6 fallos. Queda a decisión del usuario; no se ha arreglado ni relanzado nada.
