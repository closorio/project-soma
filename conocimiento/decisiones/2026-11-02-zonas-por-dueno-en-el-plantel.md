---
tipo: decision
fecha: "2026-11-02"
autor: "seppuq"
estado: vigente
fases: [F8]
---
# Las zonas por dueño, en el plantel del mundo compartido

## Contexto
La PR #8 de Count trajo [[2026-11-02-zona-hogar-y-zonas-por-dueno]] (modo `hogar`, `zonas_<dueño>.json`) el mismo día que
[[2026-11-02-configuracion-por-alcance]] (plantel `jugadores/<jugador>.json`). Las dos resuelven lo mismo: de quién es cada zona.

## Decisión
- **Mundo compartido** (con carpeta `jugadores/`): las zonas de cada dueño viven en su `jugadores/<jugador>.json`. El
  `zonas___count.json` de la PR pasa a `jugadores/__Count.json` (su HOGAR, ya en modo `hogar`). Los bots de cada uno ven las zonas
  de todos: vedadas, no talar y árboles; las de trabajo, solo las de su dueño; y **el hogar de otro cuenta como «no talar»** (no se
  rompe nada dentro, pero no es su casa: no duermen, depositan ni cosechan allí). `zonas.hogares()` solo devuelve los propios.
- **Mundo de un solo jugador**: `zonas_<dueño>.json` como en la PR (ahora ignorado por git, es de cada persona).
- El modo `hogar`, `!zona modo`, la escritura atómica y `baseZona()` (el hogar del dueño como base) se quedan como en la PR; el abasto
  del catálogo de estructuras usa también `baseZona()`.

## Consecuencias
- Para Count: su HOGAR sigue siendo su casa; lo cambia en su `jugadores/__Count.json` (con `!zona`) y lo comparte con `make share`.
- `campo_hogar.json` (parcelas de su campo) sigue en git tal cual vino; si deja de ser útil compartirlo, iría a `.local`.
