---
tipo: decision
fecha: 2026-10-31
autor: seppuq
estado: vigente
fases: ["[[Asistente personal]]"]
---
# El asistente llega a 26.3 por ViaProxy, con un envoltorio para tick_end

Sustituye a [[2026-10-31-asistente-en-26-3-por-viaproxy]]. La única diferencia es cómo se manda `tick_end`.

## Contexto
El mundo del usuario es vanilla 26.3. mineflayer 4.39.0 llega hasta 26.1, y un servidor 26.3 expulsa al bot si no manda `client_tick_end` tras cada movimiento (issue mineflayer #4189). La decisión anterior fijaba mineflayer a un commit de master, que ya lo manda. Al montar A0 apareció algo mejor: el paquete `tick_end` ya está en el protocolo 26.1 de la versión instalada, solo que mineflayer no lo usa.

## Decisión
- El mundo del usuario (`servidor/`) va en vanilla **26.3**. El bot habla **26.1** y entra por **ViaProxy 3.4.14** (127.0.0.1:25568 → 25565). El usuario entra directo al 25565.
- `tick_end` lo manda **`bot/tick_end.js`**, un envoltorio de `bot._client.write` que lo escribe tras `position`, `position_look`, `look` y `flying`. Solo se enciende si el `mundo.json` del mundo lleva `servidor.tick_end: true`; hoy, solo el del usuario.
- `bot/package.json` **no cambia**. El banco local (26.1.2) y el server del compañero no notan nada.

## Alternativas descartadas
- **Fijar mineflayer a master.** Mete cambios sin publicar que afectan a todos los mundos y al `npm ci` del compañero. Queda como plan B si el envoltorio no basta.
- **Ramas `pc26_3`** y **desarrollar en 26.1.2 y portar después**: descartadas por lo mismo que en la decisión anterior.

## Consecuencias
- Si un día mineflayer manda `tick_end` por su cuenta, el envoltorio duplicaría el paquete. Al subir mineflayer hay que quitarlo o comprobarlo con `make smoke-26-3`.
- El criterio de abandono de A0 (cofres y mesa a través de Via) sigue igual.

Plan en `PLAN_asistente.md`.
