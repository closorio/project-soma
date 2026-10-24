---
tipo: aprendizaje
fecha: 2026-10-24
autor: seppuq
fuente: "diarios de mundos/companero y mundos/supervivencia; banco servidor-supervivencia/probar_explorar.py en el mundo local (26.1.2)"
---
# explorar decidía el suelo con el primer bloque

`parcela.superficie` miraba la columna de 10 por encima hacia abajo y decidía con el **primer** bloque no libre. Bajo hojas, bajo un techo de roca, en una ladera de más de 10 o en un barranco devolvía «sin suelo seco», aunque hubiera suelo de sobra un poco más abajo. Por eso, en el server del compañero, explorar acertó 4 veces de 437 y Alma pasó un día entero en un túnel.

## Evidencia
- Diarios: en companero, 431 de 437 «sin camino/sin suelo seco»; en supervivencia, 592 fallos frente a 64 aciertos.
- Banco E0 (`probar_explorar.py`, 10 salidas de 60 bloques por terreno):

| | antes | después |
|---|---|---|
| llano | 8/10 | 10/10 |
| montaña | 8/10 | 10/10 |
| río | 2/10 | 10/10 |
| cueva | 1/10 | 8/10 |

## Qué hacer con ello
- Para pisar, `parcela.pisable`: toda la columna, y la casilla más cercana a la altura del bot. `superficie` sigue valiendo para construir.
- Otras causas que salieron en el banco, cada una con su arreglo:
  - el mundo aún no está cargado justo después de un `tp`: esperar a los trozos;
  - el agua acababa la exploración: fuera del mundo del usuario, seguir a nado y aceptar la superficie del agua como destino;
  - `subir_a_superficie` paraba al ver el cielo desde el fondo de su propia zanja: seguir hasta poder salir de lado;
  - las hojas contaban como techo.
- Sin resolver: los manglares (raíces anegadas, ni suelo seco ni agua libre) y el terreno al norte del llano del mundo local. Van a E3.
