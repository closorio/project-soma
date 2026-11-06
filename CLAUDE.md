# project-soma: trabajo a dos

En este repo trabajan dos personas, cada una con su propio agente de Claude Code. **El hub de contexto en tiempo real
(`compartido/`) está en pausa desde el 2026-11-02:** sus hooks y su canal están quitados y no hay que publicar estado ni
mandar mensajes con `cliente.py`. El código sigue en `compartido/`; para reactivarlo, ver `compartido/README.md` y el
commit que lo pausó. La coordinación durable sigue por el vault.

## Conocimiento compartido (vault de Obsidian en `conocimiento/`)

Lo que debe durar va al vault, que viaja por git. Al arrancar la sesión recibes un resumen
(fases en curso, últimas decisiones, último experimento). Las personas lo leen en Obsidian; tú escribe Markdown con el
frontmatter de `conocimiento/plantillas/` (copia la plantilla, rellena `autor` con tu `SOMA_AGENTE`).

| Cuándo | Dónde |
|---|---|
| Decides algo que afecta al otro (interfaz, puerto, convención, criterio de medida) | `decisiones/AAAA-MM-DD-titulo.md` |
| Termina una medida o un entrenamiento | `python3 conocimiento/herramientas/experimento.py RUTA.json`, y luego rellena «Conclusión» y `veredicto` |
| Descubres algo que no conviene redescubrir (un fallo con causa, un límite de una librería) | `aprendizajes/Titulo.md` |
| Cambia el estado o el siguiente paso de una fase | el frontmatter de su nota en `roadmap/` (`estado`, `siguiente`, `actualizado`) |
| Al cerrar la sesión, si hubo trabajo | `diario/<SOMA_AGENTE>/AAAA-MM-DD.md`, unas líneas |

Reglas:
- Una nota por cosa. No reescribas decisiones ni experimentos: crea otra y marca la vieja `estado: sustituida`.
  No toques el diario del otro.
- No copies diarios brutos ni salidas largas: resume y enlaza la ruta.
- `git pull` antes de escribir en el vault; al terminar, commit y push solo de esas notas. Si tu usuario no quiere commits automáticos, déjalas sin commitear y díselo.
- `PLAN.md` y `PLAN_F7_supervivencia.md` siguen siendo el detalle técnico: no los muevas al vault.

## Economía de tokens (decisión [[2026-10-31-economia-de-tokens]])

El entrenamiento y los bancos corren en esta máquina; Claude solo diseña, escribe código y lee veredictos.
- Una tarea por sesión: `/clear` al cambiar de tarea, `/compact` antes de una pausa larga. Modelo por defecto: Sonnet; Opus o
  Fable con `/model` solo para diseñar una fase.
- Sin modo plan, brainstorming ni subagentes en tareas acotadas: el diseño, en 2-3 frases en el chat, y a trabajar.
- Leer por trozos: `grep -n` y `sed -n A,Bp`. Nunca enteros `bot/io.js` ni los `PLAN*.md`.
- Para saber qué pasó, `make report` (≤ 20 líneas), no los registros. Bancos largos con `make nightly` o en segundo plano, sin
  sondeos; se lee la nota de experimento o la última línea, no la salida entera.
- No releer lo que ya está en la conversación ni re-verificar lo que el comando ya confirmó.
- Sin sesiones de Alma (`mente.py`, `experimento_mente*.py`) salvo que el usuario lo pida: cada una gasta Claude.
