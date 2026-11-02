---
tipo: decision
fecha: "2026-11-02"
autor: "seppuq"
estado: vigente
fases: []
---
# Alcance heredable y estado por dueño en JSON

## Contexto
Las listas (amos, bots_de, externos, IO_PROPIOS, aliados, operadores, marca `dueno=`) tienen cada una su propio alcance y no
heredan de nada. En concreto, `mundos/<mundo>/aliados.json` es global al mundo (se mezclan los aliados de dos dueños), cada
proceso `io.js` lo lee una sola vez y escribe el `Set` entero (el último pisa a los demás). Ya está en `.gitignore` (por PC), pero sigue siendo uno por mundo.
## Decisión
Un único esquema de alcance heredable (defaults del programa → mundo → personaje) cuyo concepto central es el jugador dueño, y
el estado mutable (aliados) en **JSON por dueño** (`aliados_<dueno>.json`), fuera de git, con escritura atómica (temporal +
renombrado) y releyendo antes de leer o cambiar. La config sigue en `personajes.json` versionado (con un `*.example` neutro).
El acceso va tras un módulo (`bot/alcance.js`: `duenoDe`, `esDeMiDueno`, `aliadosDe`, `obedece`) para poder cambiar el
almacenamiento sin tocar `io.js`.

## Alternativas descartadas
- SQLite: dependencia y binario que no se ve en git; excesivo para docenas de nombres. Se reconsidera si el estado crece (historiales).
- Proceso coordinador: componente extra que mantener y que puede caerse.
- Estado en el plugin: acopla bot y servidor; solo los operadores (de servidor) se quedan ahí.

## Consecuencias
- Cada dueño escribe solo su archivo: desaparece el pisado entre dueños distintos que comparten mundo.
- `IO_AMOS`, `IO_PROPIOS` e `IO_BOTS_DE` se sustituyen por un `IO_DUENO` y lo derivado.
- Pendiente: unificar también las variables del `Makefile` (`OWNERS`, `PROPIOS`, `OTHER_BOTS`, `IO_DUENOS`) con este esquema.
- Tocará `bot/io.js`, `bot/conectar.sh` y el plugin: avisar al compañero antes.
