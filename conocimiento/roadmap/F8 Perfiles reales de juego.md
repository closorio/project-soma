---
tipo: roadmap
fase: F8
estado: en-curso
responsable: seppuq
actualizado: 2026-11-05
siguiente: "Banco M medido: base 16/32 en 4 tiradas, y un veredicto pide 4 tiradas por versión ([[2026-11-05-tiradas-del-banco-m]]). Investigar por qué 5 personajes se quedan sin morir en m_pozo (falta «mina»), sobre todo en (15036, 15068) y (15132, 14956). Causas abiertas: muertes en cadena al recuperar, muerte tras reconectar que borra el sitio, huir de creeper sin camino, pico gastado; ir_a_arbol sin árbol; conseguir desde cero 2/5. Aparte: count revisa [[2026-11-05-arquitectura-de-roles]]; al aceptarla, composición de submodos"
---
# F8 Perfiles reales de juego

## Objetivo
Roles de juego de largo horizonte: Casual, Speedrunner (hasta el dragón), Redstoner y Builder, con los de apoyo Granjero, Minero y Explorador. Los perfiles actuales pasan a ser estilos de rutinas.

## Estado
**F8.0a hecha (2026-10-24, rama `develop`).** Servidor propio `servidor-local/` (26.1.2, 25567, RCON 25577) y `servidor/rcon.py`; taxonomía de amenazas por nombre; decisores por personaje; perfiles v2 `casual` y `speedrunner` validados en JS y Python; rutinas `rutina_madera` y `rutina_noche`; memoria persistente.
Puerta G0, parte 1: `probar_supervivencia.py` en 26.1.2 pasa **todas** las secciones con los criterios de F7.2 (comer, fabricar, refugiarse en llano y ladera, atacar zombi y esqueleto, esperar, dormir, apartarse, caza, reflejos; medidas en `entrenamiento/habilidades_medidas_local.json`). Soma, 5 min en libre con el decisor `guion` en el mundo local, sin errores; `rutina_madera 3` hecha en 68 s. Falta la parte 2 de G0: E0 (explorar robusto), que es F8.0b.
**F8.0b hecha (2026-10-24).** La fundación C3-C7 (fabricar genérico, fundir, poner, sacar del cofre, antorchas, escalera, subir, desatascarse, cazar, cubo) pasa el banco H-hab en 26.1.2 (9 secciones con sus criterios). El banco E0 de explorar da llano 10/10, montaña 10/10, río 10/10 y cueva 8/10: sale del túnel en las 10, pero 2 salidas hacia el norte del llano no superan el terreno de allí. Los manglares quedan para E3. Ver [[explorar decidía el suelo con el primer bloque]] y [[minecraft-data no trae recetas de horno]]. Ver [[2026-10-23-perfiles-v2-guion-mas-red]] y [[En 26.1 time query daytime ya no existe]].

**F8.1 parada sin pasar el banco K (2026-10-25).** El capataz del Casual recorre todas sus etapas, y el banco K elige puntos con ovejas y árboles, corta si caen los bots y da las causas de muerte. Medida 9: pico de hierro 7/8 (mediana del día 0,37), cama 3/8 (mediana 1,34) y 3/8 en el criterio, que pide ≥ 6/8. Lo que falta, según los registros, son cuatro habilidades concretas, no el diseño: cazar desde bajo tierra, árboles inalcanzables, ahogamiento y el tejado de `construir`. Ver [[2026-10-25-1401-banco-k-casual-medida-9]], [[Una presa que desaparece no está muerta]], [[Pedir ovejas elige llanos pelados]], [[El navegador pasa bloques sin posición a las exclusiones]] y [[El tejado de la cabaña no se alcanza desde fuera]].

**F8.2 Minero, primer trozo (2026-11-02).** La orden «consigue N X» (`bot/conseguir.js`, `cavar_tunel`) resuelve pico, antorchas, bajada, túnel con la lava tapada y entrega; seco 44/44. Rol `minero` (M1-M6 sobre `conseguir`, 15 etapas, valida). Humo del banco: hierro 6/6 en 224 s, 0 muertes (el primero se ahogó en un lago: ahora sale del agua). Banco completo lanzado con `make nightly BENCHES=bench-gather`. Ver [[2026-11-02-recolector-conseguir]].
Recolector aceptado por el usuario tras 4 rondas sin cumplir del todo el criterio (diamante 4/5, desde cero 2/5, 1 ahogado) y criterio del banco M medido en el inventario: [[2026-11-03-recolector-aceptado-y-criterio-m]].

## Siguiente paso
Ver campo «siguiente». Casual es el primer rol completo (F8.1) y su red llega en F8.G; Speedrunner va al final (F8.7-F8.8).

## Enlaces
- Decisiones: [[2026-10-23-perfiles-v2-guion-mas-red]], [[2026-11-01-reparto-de-roles-f8]]
- Builder, Redstoner y Sentinela (count): [[F8 Roles de count]]
- Aprendizajes: [[CUDA frente a numpy en redes pequeñas]], [[En 26.1 time query daytime ya no existe]]
- Detalle: `PLAN_F8_perfiles.md` (fuera del vault).
