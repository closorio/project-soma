---
tipo: roadmap
fase: "F-estructuras"
estado: en-curso
responsable: "seppuq"
actualizado: "2026-11-02"
siguiente: "Andamio sobre los suelos ya puestos (la torre del castillo para en la capa 9, 1086/3210, en el server creativo) y luego terminarla y el castillo entero"
---
# Catálogo de estructuras

## Objetivo
Que un bot construya una plantilla `.litematic` del catálogo donde diga el usuario («construye casa_roble en 300 64 -20»),
consiguiendo los materiales que falten y pidiendo lo que no pueda conseguir.

## Estado
Los seis pasos del plan están hechos y pasan en seco: importador, orientación, construir con varios bloques y posición, andamio,
abasto por tandas y órdenes del chat (también por el LLM local). La lectura de `.litematic` está validada con archivos reales.
En el server local (2026-11-02), `casita_prueba` (5×5×5: puerta, ventanas, antorcha de pared, tejado de escaleras y losas con
andamio) quedó 99/99 bloques con su estado dos veces: con todo en la mochila y con el abasto desde un cofre de la base (sacar,
fabricar, 7 tandas). `deshaz` la dejó vacía. En el mundo del compañero (26.3), Oqva la terminó 98/98 en la zona de
carteles «norte», dentro de la base, tras arreglar el paso por vedadas, la mesa, el pico, la madera y el andamio. También importa
`.nbt` del juego y construye girada («mirando al este»): una casa de aldea, 151/151 en el server local. Guía: `catalogo/LEEME.md`. Pendiente: `fabricar oak_planks N` a veces falla («no se pudo») y cuesta tandas.
En el server creativo propio (2026-11-02), la torre recortada de `castillo_musgo` (3210 bloques) llegó a 1086 con 0 mal orientados tras cuatro arreglos de obra grande; para en el centro del suelo de madera de la capa 8: [[2026-11-02-2108-castillo-musgo-torre-en-el-server-creativo]].

## Siguiente paso
Ver campo «siguiente». Después, una nota de experimento con bloques bien y mal orientados, tiempo y tandas.

## Enlaces
- Decisiones: [[2026-11-02-catalogo-de-estructuras]], [[2026-11-02-server-creativo-para-obras]]
- Experimentos: [[2026-11-02-2108-castillo-musgo-torre-en-el-server-creativo]]
