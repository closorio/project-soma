---
tipo: aprendizaje
fecha: "2026-11-01"
autor: "seppuq"
fuente: "entrenamiento/prueba_rodeo.py (make bench-detour WORLD=paper)"
---
# Paper rechaza el borde pegado a un bloque

En un server Paper 26.3, el bot de mineflayer solo avanzaba en llano: no subía escalones de 1 bloque ni rodeaba obstáculos.
La causa es que Paper rechaza en silencio, sin nada en la consola, el paquete de movimiento que deja el borde del cuerpo
(±0,3) **justo** sobre la cara de un bloque. Por ejemplo, al saltar un escalón en z = 403 el bot manda z = 402,700. Paper lo
devuelve atrás, y el bot repite el intento en bucle, unas 20 veces por segundo. El 26.3 vanilla lo acepta.

## Evidencia
- Con `IO_DEPURAR_MOV=si`, el paquete `position 450.500 200.420 402.700` es rechazado, y el server devuelve el bot a 402,315.
- Server Paper local, `make bench-detour WORLD=paper`: sin holgura, 0/3 en escalón y muro; con holgura, 3/3 y 0 recolocaciones.
  En el server Paper del compañero sale del hoyo y llega a 11 pasos, también con 0 recolocaciones.
- No era `player_input` (no cambió nada). Tampoco era `tick_end` en cada tick: con eso, Paper expulsa con
  `invalid_player_movement`.

## Qué hacer con ello
- La holgura de `bot/tick_end.js` (`separar`): si un borde cae a menos de 1e-6 de un entero, la posición que se manda se mete
  1e-4 hacia dentro. Va activada en los mundos con `tick_end`; `IO_HOLGURA=no` la apaga.
- Para ver qué pasa cuando no avanza: `make move-log WORLD=…` (recolocaciones) e `IO_DEPURAR_MOV=si` (paquete a paquete).
- Para reproducir sin depender de nadie: `servidor-paper/` (Paper 26.3 local), con `make paper-server-start paper-proxy-start`.
