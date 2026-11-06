---
tipo: roadmap
fase: F8-count
estado: en-curso
responsable: count
epica: [E2, E3, E4, E5]
actualizado: 2026-11-05
siguiente: "Leer las tres decisiones vigentes del 2026-11-05 (roles, épicas y comandos; objetar con otra nota si hace falta), integrar lo pendiente en bot/ para abrir el refactor y ordenar la cola propia: granjero pronto, plan y banco de centinela, constructor (B1) con la torre y el castillo, Builder"
---
# F8 Roles de count

## Objetivo
Los roles Builder (B1-B6), Redstoner (R1-R7) y Sentinela (protector o atacante) de F8, cada uno con su perfil v2 y
su banco pasado.

## Estado
Ningún rol tiene todavía perfil v2 ni banco, pero count ya hizo mucho trabajo cercano:
- **Guardia:** centinela y patrulla, guardaespaldas, aliados. Es la base de Sentinela, que sigue sin plan.
- **Oficios:** `cosechar` y `herrero`. `cosechar` se solapa con el Granjero.
- **Operación:** plugin (`/connect`, `/bo`, colores, inventario), lanzador, zona de hogar y zonas por dueño.

La base de Builder ya existe (`construir`, `deshacer`, `bot/planos.js`, obras y zonas de trabajo). Reparto en épicas:
[[2026-11-05-epicas-y-duenos]]. Desde el 2026-11-05, count lleva también el catálogo de estructuras, el Granjero y `herrero`.

## Siguiente paso
Ver campo «siguiente».

## Enlaces
- Decisiones: [[2026-11-01-reparto-de-roles-f8]]; sustituida por [[2026-11-05-arquitectura-de-roles]]
- Fase madre: [[F8 Perfiles reales de juego]]
- Detalle: `PLAN_F8_perfiles.md` (Builder B1-B6, Redstoner R1-R7, bancos B y R) y `README.md`.
