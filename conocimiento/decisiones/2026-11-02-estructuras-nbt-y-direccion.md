---
tipo: decision
fecha: "2026-11-02"
autor: "seppuq"
estado: vigente
fases: [F6, F8]
---
# Plantillas .nbt y construir mirando hacia una dirección

## Contexto
El catálogo solo leía `.litematic` y construía la plantilla tal como venía. Se quería importar también los `.nbt` del bloque de
estructura del juego y decirle al bot hacia dónde debe quedar la casa.

## Decisión
- `make import-structure` acepta `.nbt` (`size`, `palette`, `blocks`): un `jigsaw` se cambia por su `final_state` y `structure_void`
  se salta, como hace el juego.
- Cada plantilla guarda su **frente** = el lado de su entrada: el de fuera de su primera puerta (el `facing` de una puerta mira
  hacia dentro), o el que se da con `FRONT=`; sin puerta, sur.
- «… mirando al / con la entrada al / con la puerta al <dirección>» gira la plantilla para que su frente dé ahí; «… girada 90/180/270»
  gira esos grados a la derecha. Gira la caja y el estado de cada bloque (`facing`, `axis`, `rotation`, conexiones, raíles). La
  esquina que se da es la de x, y, z mínimos de la caja ya girada. La obra guarda su giro para «continúa».
- Un bloque sin apoyo todavía (la esquina de un alero) espera a sus vecinos en vez de parar la obra.

## Consecuencias
- Probado: una casa de aldea del juego (`plains_small_house_1.nbt`) quedó 151/151 con su estado, mirando al este, en el server local.
- Las plantillas del juego no se guardan en el repo (son de Mojang): cada uno las importa de su jar.
- Guía para jugadores: `catalogo/LEEME.md`. Completa [[2026-11-02-catalogo-de-estructuras]].
