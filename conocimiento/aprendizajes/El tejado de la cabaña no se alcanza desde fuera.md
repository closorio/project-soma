---
tipo: aprendizaje
fecha: 2026-10-25
autor: seppuq
fuente: "servidor-supervivencia/logs/bots-casa-C1.log (prueba en vivo de la etapa casa); bot/habilidades/construir.js; bot/planos.js cabana_techada"
---
# El tejado de la cabaña no se alcanza desde fuera

`construir` trabaja desde fuera de la huella de la obra (pisarla cuesta 200, para no encerrarse ni subirse a lo recién puesto). En `cabana_techada` (5×4×5), las casillas interiores del tejado no tienen nada debajo: solo se apoyan en la cara lateral de la casilla vecina del tejado, y esa cara **solo se ve desde dentro de la cabaña o desde arriba**. Desde el suelo de fuera no hay línea de visión, y `GoalPlaceBlock` con `LOS: true` agota el tiempo.

## Evidencia
- Prueba en vivo de la etapa casa del Casual (C1, bosque en 60072, 60000): con 18 troncos hizo los tablones y levantó casi toda la cabaña, y falló a los 473 s con «no pude colocar en 60074,71,59983: no llego (tiempo agotado)», en la capa del tejado.

## Qué hacer con ello
- Opciones para F8.1 o F8.5 (Builder): poner el tejado **desde dentro** (permitir la huella solo para las capas por encima de la cabeza y entrar por la puerta), o hacerlo de fuera hacia dentro en espiral apoyando cada casilla en la anterior desde un andamio fuera de la huella.
- Una obra a medias se retoma (los bloques ya puestos cuentan), así que el arreglo no necesita deshacer nada.
