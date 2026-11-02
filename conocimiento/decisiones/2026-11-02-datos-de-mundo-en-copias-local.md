---
tipo: decision
fecha: "2026-11-02"
autor: "seppuq"
estado: vigente
fases: [F8]
---
# Los datos de cada mundo van en copias «.local», como un .env

## Contexto
Sustituye a [[2026-11-02-datos-de-mundo-por-persona]]. Quitar los archivos de git habría borrado los del compañero al hacer pull,
y seppuq no quiere que a Count se le borre nada: solo que dejen de actualizarse en git.

## Decisión
Los datos de cada persona en cada mundo (`zonas`, `cofres`, `obras`, `arboles`, `personajes` y `diario`) se leen y escriben en su
copia `.local` (`zonas.local.json`, `diario.local.md`…), ignorada por git (`*.local.json`, `*.local.md`). La primera vez se hace del
versionado (`bot/mundo.js` y `entrenamiento/mundo.py`: `propio()`; `bot/conectar.sh` y el plugin `/connect`, con
`personajes.local.json`). Los versionados quedan de plantilla y ningún código los vuelve a escribir.

## Para el compañero
Nada que hacer: el pull no le cambia ninguno de sus archivos (respecto a `origin` los de datos quedan igual). Al arrancar sus bots con
el código nuevo, sus datos de siempre se copian a sus `.local` y desde ahí siguen siendo suyos. Si quiere `/connect` con
`personajes.local.json`, que recompile el plugin (`plugin-connect/build.sh`); sin recompilar sigue leyendo su `personajes.json`.

## Consecuencias
Un cambio de zonas o de bots ya no viaja por git: cada uno lo hace en su PC. Lo versionado solo cambia a mano, como plantilla.
