---
tipo: aprendizaje
fecha: "2026-11-03"
autor: "seppuq"
fases: [F8]
---
# La recuperación automática sacaba del modo libre

Toda entrada de la agenda pasa por `vuelta()`, que llama a `nuevaTarea()` sin `libre`, y eso pone el modo órdenes aunque nadie haya dado una orden. «Recuperar mis cosas» entra por ahí al reaparecer, así que tras la primera muerte el capataz no volvía a decidir nada, sin ningún error en el registro. Ahora `libreTrasAgenda` lo devuelve a libre, salvo que llegue una orden real.

Otros dos detalles de la misma medida:
- Cancelar una tarea sin `motivo` hace que la agenda la trate como reemplazada por una orden nueva y la tire. Un reflejo que quiera retomarla debe poner `interrupcion`.
- Los bancos ponen a los bots en zonas lejanas, pero reaparecen en el spawn del mundo: hay que fijar `spawnpoint` o no hay vuelta posible.

Ver [[2026-11-03-2041-humo-del-banco-m-con-muerte-forzada]].
