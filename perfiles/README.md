# Perfiles

## v1: estilos (los de hoy)
`recolector.json`, `constructor.json`, `cooperativo.json`, `supervivencia.json` y `explorador.json`. Cada uno tiene `nombre`, `identidad`, `metas` y 5 `pesos` (`madera, compania, seguridad, tiempo, supervivencia`). Solo se usan los pesos: divididos por `_escala.json`, entran en la observación de la red (entradas `perfil_*`) y en la recompensa de los simuladores. `identidad` y `metas` no las lee el código.

**No se mueven ni se renombran.** Los leen `cargar_perfiles()` (`entrenamiento/entorno_habilidades.py`, un glob de `*.json` sin subcarpetas), `bot/observacion.js`, `mente/alma/mente.py` y tres políticas entrenadas que guardan su vector. En F8 solo ganan claves aditivas (`"v": 1, "rutina": "madera"`) y pasan a llamarse **estilos**: describen *cómo* hace una rutina el cuerpo (cómo tala, cómo pasa la noche).

## v2: roles (F8, planificado; ver `PLAN_F8_perfiles.md`)

Un rol también puede incluir **submodos** (`perfiles/v2/submodos/<nombre>.json`), piezas con dueño que se componen al cargar: `{ "submodo": "fundacion", "cambia": { "madera": { "max_s": 120 } } }`. El capataz solo ve la lista plana. Las reglas están en `conocimiento/decisiones/2026-11-05-arquitectura-de-roles.md`.
Irán en `perfiles/v2/<rol>.json`, con un catálogo común de etapas en `perfiles/v2/_etapas.json`. Un rol describe *a qué juega* el personaje: una cadena de etapas con objetivo medible que lleva el capataz (`bot/capataz.js`), y unos pesos que ve la red de zona gris. Roles base: `casual`, `speedrunner`, `redstoner`, `builder`; de apoyo: `granjero`, `minero`, `cartografo`.

```json
{ "v": 2, "nombre": "casual", "identidad": "Aventura estándar: progresa con calma y no se juega la vida.",
  "sirve_a": [], "estilos": { "madera": "recolector", "noche": "supervivencia" },
  "pesos": { "madera": 0.5, "seguridad": 1.0, "tiempo": 0.002, "supervivencia": 1.0, "progreso": 1, "riesgo": 0.2 },
  "reglas": { "noche": "refugio", "y_min": 0, "cofre": "base" },
  "etapas": [
    { "id": "herr_piedra", "objetivo": { "inv": { "pico": 0.66, "espada": 0.66 } } },
    { "id": "antorchas",   "pre": { "inv": { "pico": 0.66 } }, "objetivo": { "inv": { "antorchas": 8 } } },
    { "id": "hierro",      "objetivo": { "inv": { "pico": 1 } }, "hacer": ["minar iron_ore", "fundir iron", "fabricar iron_pickaxe"] },
    { "id": "cama",        "objetivo": { "inv": { "cama": 1 } }, "hacer": ["cazar sheep 3", "fabricar white_bed"] } ] }
```

`pre` y `objetivo` son condiciones sobre el estado del personaje (inventario por categoría, memoria, hitos); `hacer` es la lista ordenada de habilidades o rutinas que el capataz prueba en esa etapa. Un validador en seco (JS y Python) comprobará el esquema, que cada `hacer` existe y que la cadena de etapas cierra.
