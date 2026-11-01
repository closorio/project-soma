---
tipo: aprendizaje
fecha: "2026-11-01"
autor: "seppuq"
fuente: "bot/habilidades/construir.js (ponerSaltando)"
---
# La capa alta queda por encima de los ojos

Desde el suelo, los ojos del bot quedan a 1,62 bloques de altura. El primer bloque de la 3.ª capa de una cabaña solo se puede apoyar
encima de la capa de debajo, y la cara de arriba de ese apoyo queda por encima de los ojos. `GoalPlaceBlock` con `LOS: true` no
encuentra ningún sitio desde el que verla y `construir` se rendía con «no llego». En el techo pasaba lo mismo y además empezaba por
el centro, donde no hay nada en que apoyarse.

## Evidencia
- Server del compañero: la cabaña se quedaba en 30 de 46 bloques («no llego a 662,70,-831»).
- Paper local: con el salto, la cabaña sale 46/46. La cabaña con techo sale 71/71 en 64 s; antes eran 52 o 59 bloques, o se
  agotaban los 10 minutos.

## Qué hacer con ello
- `construir.js`, `ponerSaltando`: para los bloques que quedan a 3 o más por encima del suelo, el bot se pone al lado, salta y
  coloca el bloque en lo alto del salto. El servidor no pide ver la cara, solo alcanzarla.
- Cada capa se construye del borde hacia dentro, para que cada bloque del techo tenga ya un vecino en el que apoyarse.
