---
tipo: decision
fecha: 2026-10-31
autor: seppuq
estado: vigente
fases: ["[[Asistente personal]]"]
---
# El mundo del usuario en 26.3 va sin límites, con las reglas por mundo

## Contexto
El mundo del usuario se trataba con reglas duras por su nombre (`mundo.nombre === 'usuario'`, en 18 sitios de `bot/`): picar y poner solo dentro de un rectángulo de obras, sin memoria persistente, sin reflejos y sin cavar al explorar. Eso protegía las obras del mundo 1.21.11, que ya no existe. El mundo 26.3 es nuevo y el asistente tiene que minar hondo y trabajar en cualquier sitio. Las fichas para Sonnet necesitaban una regla clara, no 18 decisiones sueltas.

## Decisión
- El usuario (2026-10-31): el mundo 26.3 es **sin límites**, y los límites se ponen después con órdenes (`!zona`).
- `mundos/usuario/mundo.json` lleva `"reglas": "libre"`, y `bot/mundo.js` exporta `reglasLibres` (siempre verdadero fuera del mundo del usuario). 15 de las comprobaciones pasan a usarlo.
- Siguen por nombre: **verter lava en el mundo del usuario** (`agua.js`, prohibido), los nombres de fichero y los sufijos. `bot/probar_reglas_mundo_seco.js` falla si aparece una regla nueva por nombre.
- `IO_REGLAS=duras|libres` las fuerza. Las pruebas en seco miran así el mundo del usuario con las reglas de siempre.
- Los datos del mundo 1.21.11 (`zonas.json`, `cofres.json` y `obras.json` de la raíz) se quedan como archivo. `mundos/usuario/` tiene ficheros propios, vacíos (`mundos/usuario/LEEME.md`).

## Alternativas descartadas
- **Una bandera solo para el rol asistente**: habría que decidir 18 casos uno a uno, y otros bots en el mismo mundo se portarían distinto.
- **Mantener el rectángulo de obras**: cada punto de minado o de granja habría que marcarlo antes.

## Consecuencias
- Sin `"reglas": "libre"`, el mundo del usuario vuelve exactamente a las reglas de antes.
- Lo que el usuario quiera proteger lo marca con `!zona`. A5 añade el modo `granja`.
