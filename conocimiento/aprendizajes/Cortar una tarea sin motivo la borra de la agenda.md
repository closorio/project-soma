---
tipo: aprendizaje
fecha: "2026-11-04"
autor: seppuq
fuente: "servidor-supervivencia/logs/recuperar-20261104-1545.json"
---
# Cortar una tarea sin motivo la borra de la agenda

En `bot/io.js`, `tarea.cancelada = true` sin `tarea.motivo` hace que `vuelta()` lo tome por `reemplazo`: la agenda dice «Dejo … por la orden nueva» y la entrada desaparece, aunque no haya ninguna orden. Con `motivo = 'interrupcion'` queda en pausa y se retoma.

## Evidencia
Pasó primero con `respirar` (2026-11-03) y otra vez con los golpes en `alGolpear`: M4 perdió 477 objetos en el banco M. Reproducido 0/3: [[2026-11-04-1605-banco-de-recuperar-tras-un-golpe]].

## Qué hacer con ello
Un reflejo que corta una tarea debe decir si es una interrupción. `alGolpear` solo lo hace con obras del catálogo, `conseguir` y «recuperar mis cosas»: cualquier otra orden sigue perdiéndose con un golpe. Es lo buscado en esas órdenes o no se ha revisado; si una orden desaparece con un «por la orden nueva» sin orden nueva, mirar aquí.
