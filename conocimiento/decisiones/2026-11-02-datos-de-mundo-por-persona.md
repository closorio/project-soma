---
tipo: decision
fecha: "2026-11-02"
autor: "seppuq"
estado: vigente
fases: [F8]
---
# Los datos de cada mundo son de cada persona y no van a git

## Contexto
`mundos/<mundo>/personajes.json`, `zonas.json`, `cofres.json`, `obras.json`, `arboles.json` y `diario.md` estaban versionados. Cada
pull traía los del otro: a seppuq le llegaban `amos: __Count`, los bots de Count y su HOGAR, y al revés.

## Decisión
Esos archivos (en todos los mundos), y los heredados del mundo del usuario en la raíz (`zonas.json`, `obras.json`, `cofres.json`,
`mente/diario.md`), salen de git y van a `.gitignore`, como `local.mk` y la memoria de los personajes. Siguen en git
`mundos/*/mundo.json` (servidor y proxy, iguales para los dos), el catálogo y las listas de materiales. Plantilla genérica:
`mundos/companero/personajes.ejemplo.json`; sin `personajes.json`, `bot/conectar.sh` dice cómo crearlo. Sin zonas, cofres u
obras, los bots arrancan con ellos vacíos.

## Aviso para el compañero (importante)
El commit `bf64772` quita esos archivos de git. **Al hacer pull, git los borrará de tu disco.** Antes del pull:

```
tar czf ~/datos-mundos.tgz mundos/*/personajes.json mundos/*/zonas.json mundos/*/cofres.json mundos/*/obras.json mundos/*/arboles.json mundos/*/diario.md zonas.json obras.json cofres.json mente/diario.md
```

y después `tar xzf ~/datos-mundos.tgz`. Si ya hiciste el pull, se recuperan de git (quedan ignorados):
`git checkout bf64772^ -- mundos/companero/personajes.json mundos/companero/zonas.json …`.

## Alternativas descartadas
- Seguir versionándolos y resolver choques en cada pull: es lo que pasaba.
- Una carpeta por persona dentro de git: los datos de partida no le sirven al otro.

## Consecuencias
Las zonas, los cofres y los bots de un mundo compartido se configuran en cada PC (con `!zona`, los carteles y `personajes.json`).
