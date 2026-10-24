---
tipo: roadmap
fase: F8
estado: en-curso
responsable: seppuq
actualizado: 2026-10-24
siguiente: "F8.0b: adaptar la lectura de la hora a 26.1 en los bancos, E0 explorar robusto y la fundación C3-C7 (fundir, poner, sacar_del_cofre, iluminar, cavar_escalera, cazar, cubo)"
---
# F8 Perfiles reales de juego

## Objetivo
Roles de juego de largo horizonte: Casual, Speedrunner (hasta el dragón), Redstoner y Builder, con los de apoyo Granjero, Minero y Explorador. Los perfiles actuales pasan a ser estilos de rutinas.

## Estado
**F8.0a hecha (2026-10-24, rama `deploy`).** Servidor propio `servidor-local/` (26.1.2, 25567, RCON 25577) y `servidor/rcon.py`; taxonomía de amenazas por nombre; decisores por personaje; perfiles v2 `casual` y `speedrunner` validados en JS y Python; rutinas `rutina_madera` y `rutina_noche`; memoria persistente.
Puerta G0, parte 1: `probar_supervivencia.py` en 26.1.2 pasa **todas** las secciones con los criterios de F7.2 (comer, fabricar, refugiarse en llano y ladera, atacar zombi y esqueleto, esperar, dormir, apartarse, caza, reflejos; medidas en `entrenamiento/habilidades_medidas_local.json`). Soma, 5 min en libre con el decisor `guion` en el mundo local, sin errores; `rutina_madera 3` hecha en 68 s. Falta la parte 2 de G0: E0 (explorar robusto), que es F8.0b.
El cuerpo sigue llegando solo hasta la piedra: falta la fundación (carbón, horno, hierro, cama, cofre, cubo). Ver [[2026-10-23-perfiles-v2-guion-mas-red]] y [[En 26.1 time query daytime ya no existe]].

## Siguiente paso
Ver campo «siguiente». Casual es el primer rol completo (F8.1) y su red llega en F8.G; Speedrunner va al final (F8.7-F8.8).

## Enlaces
- Decisiones: [[2026-10-23-perfiles-v2-guion-mas-red]]
- Aprendizajes: [[CUDA frente a numpy en redes pequeñas]], [[En 26.1 time query daytime ya no existe]]
- Detalle: `PLAN_F8_perfiles.md` (fuera del vault).
