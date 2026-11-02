---
tipo: decision
fecha: "2026-11-02"
autor: "seppuq"
estado: vigente
fases: [F6, F8]
---
# Catálogo de estructuras desde .litematic

## Contexto
Los bots solo levantaban planos escritos a mano de un solo material (`bot/planos.js`). Se quiere un catálogo de plantillas reales
(casas y decoración) que construyan donde diga el usuario, consiguiendo lo que falte.

## Decisión
- Los `.litematic` van a `catalogo/` y `make import-structure FILE=… NAME=… [ALIAS=…]` los pasa a `bot/estructuras/<id>.json`
  (`dim`, `paleta` de estados normalizados contra 1.21.11, `bloques` sin aire, `materiales`, `sinConseguir`) y a
  `bot/materiales/<id>.json` (la orden «materiales»). El origen (0,0,0) es la esquina de x, y y z mínimos: la posición que da el
  usuario es esa esquina, tal cual (la caja tiene que estar vacía; la hierba y las flores se quitan; no excava).
- Orientación: cada bloque se pone con el apoyo, el yaw y el punto del clic de `bot/habilidades/orientar.js` y se comprueba su
  estado (`facing`, `half`, `type`, `axis`, `hinge`…). Si sale con otra orientación se rompe y se prueba otro apoyo **una vez**;
  a la segunda se deja y se apunta en `obra.mal_orientado`, para no atascar la obra.
- Más de 3 por encima de los pies: andamio de tierra o adoquín fuera de la huella, apuntado en `obra.andamio`; se quita al
  terminar y `deshacer` también lo quita.
- Abasto por tandas (lo que cabe en la mochila): cofres de HOGAR → fabricar (planificador) → talar, minar, fundir, cazar; lo que
  no se consigue se pide por el chat. Sin LLM. Corta con 3 tandas sin avance; «continúa» retoma la obra.
- Nombres de bloque desconocidos: error con la lista. Solo se traducen los que Mojang renombró (`grass`, `grass_path`, `chain`).

## Alternativas descartadas
- Excavar o allanar la caja al construir en una posición dada: el usuario elige la posición; tocar el terreno sin pedirlo es peor
  que negarse con «ocupado».
- Rehacer los bloques mal orientados hasta que salgan bien: un vecino (otra puerta, una escalera al lado) puede impedirlo y la obra
  no acabaría nunca.

## Consecuencias
- Talar da la madera que haya cerca: si la plantilla pide otra (abeto), cuenta como «sin avance» y acaba pidiéndolo.
- El centro de tejados de más de ~8 de ancho puede no alcanzarse desde el andamio del borde.
- Validado en seco (`probar_estructuras/orientar/abastecer_seco.js`) y con `.litematic` reales de schematic4j
  (`catalogo/pruebas/`); falta la prueba en el server local con `casita_prueba` (ver [[Catálogo de estructuras]]).
