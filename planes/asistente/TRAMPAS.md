# Trampas conocidas (léelas antes de tocar nada)

Cada una costó una sesión descubrirla. Síntoma → causa → qué hacer.

## Servidor 26.3 y proxy
- **El bot entra y lo echan a los 1,5 s** (`invalid_player_movement`) → 26.3 exige `client_tick_end` y mineflayer 4.39 no lo manda → ya lo hace `bot/tick_end.js` si el `mundo.json` lleva `servidor.tick_end: true`. No subas mineflayer sin comprobarlo con `make smoke-26-3`.
- **`multiplayer.disconnect.not_whitelisted` en bucle** → 26.3 trae la lista blanca activada, y `whitelist add` guarda el UUID de la cuenta oficial, no el offline → `white-list=false` (ya está en `servidor/descargar.sh`) o `whitelist off` por RCON.
- **`make proxy-ping` da el protocolo 777** → es lo correcto: el ping lo contesta el servidor de detrás. El bot entra hablando 26.1 igualmente.
- **`node -e '…'` en el Makefile con `\` al final de línea no arranca** → la barra llega a node. Pon el JS en un `define` exportado (mira `PROXY_PING`).

## Reglas del mundo del usuario
- **Se mandan por `mundo.reglasLibres`, no por el nombre del mundo** (P2). El mundo 26.3 lleva `"reglas": "libre"`: sin límites salvo las zonas de `!zona`. **Nunca** escribas `mundo.nombre === 'usuario'` para una regla nueva. Las únicas que quedan por nombre son verter lava (`agua.js`), los nombres de fichero y los sufijos (`io.js:490`, `mundo.js`). `probar_reglas_mundo_seco.js` falla si aparece otra.
- **Una prueba en seco que miraba «el mundo del usuario no hace X»** → ahora sí lo hace. Para el comportamiento de siempre, pon `IO_REGLAS: 'duras'` en el entorno del proceso hijo (mira `probar_memoria_seco.js`).
- **Una prueba que no acaba nunca** → un proceso hijo con temporizadores vivos (`informe.vigilar`, intervalos). Acaba el hijo con `process.exit(0)`.
- **Pruebas en seco que piden numpy** → necesitan el venv: lánzalas con `make test` o `make verify`, no con `node` a pelo.

## Bancos y pruebas en el mundo
- **«sin sitio», «nada que minar aquí» en el terreno de verdad** → desiertos, laderas, agua. Las puertas que ponen o pican van en una plataforma de `arena.py`, cada prueba en su trozo (`s.en(dx, dz)`), nunca justo donde otra ya picó.
- **Al pasar por un cofre desaparecen la mesa, la cama o la piedra** → `depositar` guarda todo lo que no es herramienta, arma, armadura ni comida → da el material de cada prueba justo antes (`m.dar(...)`).
- **Las habilidades acaban en «amenaza» o «monstruos cerca»** → la noche y los monstruos cortan la tarea (`habilidades/index.js`) → pacífico mientras dura la prueba (lo pone `Sesion`), salvo que la puerta pida monstruos.
- **`spreadplayers` dice «Could not spread»** → con 0 de separación falla, y sobre agua no deja a nadie → `spreadplayers X Z 1 30 false Soma`, o `s.suelo_firme()`.
- **`setworldspawn` sin argumentos MUEVE el punto de aparición** (no lo consulta). Para mirarlo: `data get level SpawnX` (o no lo toques).
- **`time query daytime` ya no existe en 26.1+** → usa `rcon.hora()` de `servidor/rcon.py`.
- **La salida de RCON se mezcla entre conexiones** → `servidor/rcon.py` ya pone un cerrojo por servidor; no abras tu propio socket.
- **`effect give … resistance 1200 4`**: son segundos y nivel 5, inmune. Aun así, un ahogado lo mató de noche en A0 → pacífico.
- **minecraft-data no trae recetas de horno** → `fundir.js` lleva su tabla. **No hay `bot.pathfinder` con puertas**: el navegador no las abre.

## Código del bot
- **Habilidad nueva**: contrato `async (bot, args, tarea) => ({ exito, causa, ...datos })`. Mira `tarea.cancelada` en cada vuelta. Se registra en `bot/habilidades/index.js` (`HABILIDADES`) y, si es una acción del capataz, en `perfiles/v2/_etapas.json` → `acciones`.
- **Orden nueva**: regex en `bot/ordenes.js` `interpretar()`, **antes** de las reglas que se la comerían (`tala` se come «trae», `mina` se come «mina en»). Los números negativos se leen del texto original, porque `normalizar` quita el signo (mira el caso `baja`). Luego, su `case` en `bot/io.js` `hacer()` y su aviso en `AVISOS`.
- **Memoria que sobrevive al reinicio**: `bot/memoria_persistente.js` (escritura atómica). La RAM es `bot/memoria.js` (`bot.yo`). Una orden instantánea (como `campamento`) no pasa por `trasHabilidad`: guarda tú con `persistente.trasHabilidad(bot)`.
