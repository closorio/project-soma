# project-soma

Experimento A: personajes de Minecraft (Oqva, antes Soma; Eco, Iris y Alma) que juegan solos o por órdenes de chat.
El cuerpo es un bot de [mineflayer](https://github.com/PrismarineJS/mineflayer) (`bot/`) con habilidades escritas a mano
(talar, minar, fabricar, construir, refugiarse…). Encima va un guion o una red pequeña entrenada por DAgger en un simulador
de Python (`entrenamiento/`), y para Alma, una «mente» con Claude (`mente/`). Trabajamos dos personas, cada una con su
Claude Code, coordinadas por un hub en la LAN y un vault de Obsidian.

## Quién hace qué

| persona | lleva |
|---|---|
| **seppuq** | roadmap F1-F8 salvo lo de abajo: F6 Alma, F7 supervivencia, F8 Casual y Speedrunner, roles de apoyo (Minero, Granjero, Explorador), la red de equipo y el asistente personal |
| **count** | roles F8 **Builder**, **Redstoner** y **Sentinela**; su server 26.x (`WORLD=companero`) y el hub (`compartido/`) en su PC |

Decisión: [conocimiento/decisiones/2026-11-01-reparto-de-roles-f8.md](conocimiento/decisiones/2026-11-01-reparto-de-roles-f8.md).

## Empezar

```
make install                      # dependencias de node (bot/) y Python (.venv)
make                              # ayuda: todos los objetivos y variables
make partner                      # proxy hacia el server de count + Oqva en modo órdenes
make partner-stop                 # para el bot y el proxy
make bots BOTS="Oqva Eco" WORLD=local MODE=libre   # varios bots, otro mundo, otro modo
make report                       # resumen corto de lo último medido
```

Mundos (`WORLD=`): `local` (server propio 26.1.2 en `servidor-local/`, el de los bancos de F8), `companero` (el de count
por wifi), `usuario` (26.3 por ViaProxy) y `supervivencia`. Cómo apuntar a cada uno, las órdenes de chat y la seguridad
(zonas vedadas, zonas de trabajo, obras): [bot/README.md](bot/README.md).

## Lo que ya está hecho

| fase | qué dejó |
|---|---|
| F1 Validar el entrenamiento | la red de andar y talar de F1, medida en el mundo real |
| F2 Habilidades de alto nivel | 20+ habilidades con contrato `{exito, causa, ms}` (`bot/habilidades/`) y una red que elige entre ellas |
| F3 Perfiles de propósito | perfiles v1 (recolector, cooperativo, explorador, constructor), que hoy son estilos |
| F4 Modo órdenes y modo libre | órdenes en lenguaje sencillo por chat; modo libre que se interrumpe y se retoma |
| F5 Experimentos de perfiles | comparación medida de perfiles y modos |
| Mundo de supervivencia | `servidor-supervivencia/` con RCON para medir sin tocar el mundo del usuario |
| F8.0a infraestructura | `servidor-local/` 26.1.2, `servidor/rcon.py`, decisores, perfiles v2 (`perfiles/v2/`), rutinas, memoria persistente |
| F8.0b cuerpo base | fabricar genérico, fundir, poner, sacar del cofre, antorchas, escalera, cazar, cubo; banco H-hab y explorar E0 superados |

Además: multi-personaje en un proceso (fase B), zonas de trabajo (2026-10-31), puertas y camas.

## En curso

**Roadmap principal** (`PLAN.md`, notas en `conocimiento/roadmap/`):

| fase | estado / siguiente paso |
|---|---|
| F6 La mente de Alma | medir T1-T3 con `entrenamiento/experimento_mente.py` |
| F7 Supervivencia en un mundo normal | F7.0-F7.4 hechas (red DAgger, semilla 0); falta la medición real F7.6 |
| F8.1 Casual | parada: el banco K da 2-3/8 y pide ≥ 6/8. Faltan cazar bajo tierra, árboles inalcanzables, ahogamiento y el tejado de la cabaña |
| F8 resto | Minero ∥ Granjero → primera red (F8.G) → Explorador → **Builder** → **Redstoner** → Speedrunner (`PLAN_F8_perfiles.md`, «Orden recomendado») |

**Líneas laterales activas:**

| línea | siguiente paso |
|---|---|
| Asistente personal | pausada hasta el 2026-11-07 por el límite semanal; luego A1 (`planes/asistente/A1.md`) |
| Conocimiento compartido en Obsidian | abrir `conocimiento/` en los dos PCs y comprobar que cargan las Bases |
| Trabajo a dos | count arranca el hub en su PC; los dos ponen `.claude/settings.local.json` y se prueba `compartido/claude-canal` |
| Varios personajes con un modelo compartido | medir la red de equipo en Minecraft (solo, dúo y trío) y repetir el trío con el arreglo de `picar_tronco` |

## La parte de count

Las etapas, habilidades nuevas, bancos y criterios de Builder y Redstoner ya están fijados en
[PLAN_F8_perfiles.md](PLAN_F8_perfiles.md) (secciones «Builder B1-B6», «Redstoner R1-R7», «Fases» y «Bancos»). No se
copian aquí, para que no se desincronicen.

1. **Builder (F8.5, B1-B6).** Casas, espacios y granjas a partir de planos JSON. Puerta: 150 bloques al 100 % en 4/4 y
   400 bloques ≥ 95 % en 3/4. Ya existe la base: `bot/habilidades/construir.js` y `deshacer.js`, los planos de
   `bot/planos.js` (pilar, muro, plataforma, cabaña), el registro de obras (`bot/obras.js`, `mundos/*/obras.json`) y las
   zonas de trabajo. Un problema abierto que te toca de cerca: «El tejado de la cabaña no se alcanza desde fuera»
   (`conocimiento/aprendizajes/`). Por dónde empezar: B1 `construir_json`.
2. **Redstoner (F8.6, R1-R7).** Mecanismos: puerta de hierro con palanca, cultivo cosechado con agua, puerta de pistón…
   Puerta: R4 5/5 y R5 ≥ 4/5. R1 necesita redstone de M6 (el Minero, de seppuq). Mientras no esté, el banco R da los
   materiales por `give`, así que R2-R5 no tienen que esperar.
3. **Sentinela (sin plan todavía).** Protector o atacante: hay que decidir cuál, o los dos, y escribir sus etapas y su
   banco igual que los otros roles (añadir una sección en `PLAN_F8_perfiles.md` y su `perfiles/v2/sentinela.json`). Se
   apoya en lo que ya hay de combate: `bot/habilidades/atacar.js`, `huir.js`, `bot/reflejos.js` y la taxonomía de
   amenazas (`bot/habilidades/taxonomia.js`).

Cómo está hecho un rol: el perfil v2 (`perfiles/v2/<rol>.json`, con su catálogo `_etapas.json`) lo lee el capataz
(`bot/capataz.js`). Mira `casual.json` como ejemplo, y valida con `make validate-profiles`.

## Reglas de trabajo a dos

- **Hub** (`compartido/README.md`): publica `estado` al empezar, al decidir algo que afecte al otro y al terminar. Lo
  urgente, con `enviar`. Si el otro está tocando un archivo, avisa antes de editarlo. Las reglas para los agentes están en
  [CLAUDE.md](CLAUDE.md).
- **Vault** (`conocimiento/`, ábrelo en Obsidian): cada decisión, experimento o aprendizaje es una nota con su plantilla.
  El roadmap de cada fase vive en `conocimiento/roadmap/` (los campos `responsable` y `siguiente`). `git pull` antes de
  escribir.
- **Tu server**: ahí los bots pican y construyen en cualquier sitio que no esté protegido. Pon tus zonas en
  `mundos/companero/zonas.json` o crea zonas de trabajo (`!zona fin NOMBRE trabajo`).
- Commits: conventional commits en inglés, en la rama `develop`.

## Dónde leer más

- [PLAN.md](PLAN.md): el plan del Experimento A, fase a fase.
- [PLAN_F8_perfiles.md](PLAN_F8_perfiles.md): los roles de F8, con sus etapas, bancos y orden.
- [PLAN_F7_supervivencia.md](PLAN_F7_supervivencia.md): supervivencia y la red DAgger.
- [bot/README.md](bot/README.md): arrancar, mundos, órdenes, seguridad y registro.
- [compartido/README.md](compartido/README.md): el hub.
- [conocimiento/Inicio.md](conocimiento/Inicio.md): la portada del vault.
