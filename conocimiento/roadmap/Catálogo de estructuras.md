---
tipo: roadmap
fase: "F-estructuras"
estado: en-curso
responsable: "seppuq"
actualizado: "2026-11-02"
siguiente: "Probar el abasto con talar, minar y fundir en terreno natural (la prueba fue desde un cofre) y una casa real de más de 5 de alto"
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
fabricar, 7 tandas). `deshaz` la dejó vacía. Pendiente: `fabricar oak_planks N` a veces falla («no se pudo») y cuesta tandas.

## Siguiente paso
Ver campo «siguiente». Después, una nota de experimento con bloques bien y mal orientados, tiempo y tandas.

## Enlaces
- Decisiones: [[2026-11-02-catalogo-de-estructuras]]
- Experimentos:
