---
tipo: aprendizaje
fecha: "2026-11-02"
autor: "seppuq"
fuente: "torre de castillo_musgo en el server creativo"
---
# El coste de exclusión mayor que 100 prohíbe el paso

En mineflayer-pathfinder, `exclusionAreasStep` suma coste a cada paso, y en `movements.js` un movimiento con coste > 100 se
descarta (`if (cost > 100) return`). Un coste de 200 no es «evitar»: es prohibir. Si el bot ya está dentro de esa zona, el
navegador no encuentra ni un paso (`noPath` con 1 nodo visitado) y el bot se queda quieto hasta agotar el tiempo.

## Evidencia
Oqva, sobre el muro de la torre (dentro de la huella de la obra, coste 200), a 4,4 de un bloque: 20 s quieto por cada apoyo.
Con una sonda en el mismo sitio: con la exclusión, `noPath` (1 nodo); sin ella, `success` en 2 pasos.

## Qué hacer con ello
Para «evitar», un coste por debajo de 100 (la obra grande usa 10). Para «prohibir», que no se aplique cuando el bot ya está
dentro, o no podrá salir. `bot/habilidades/construir.js`, `levantar`.
