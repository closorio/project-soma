# Plan · Supervivencia de los bots en un mundo normal (Experimento A, F7)

> Plan aprobado el 2026-10-15 (03:45) desde la sesión de planificación (Fable). Lo ejecutan trabajadores con Opus, una fase cada uno; los criterios de cada fase están fijados aquí antes de medir. Mientras el usuario no responda las preguntas finales, se aplican los valores por defecto: ventana A de RAM, mismos nombres de personajes con puertos 31xx, muerte real con `keepInventory false` en las mediciones, y F7.0-F7.4 intercaladas con F6.

## Contexto
El usuario pregunta por voz: «¿qué hace falta para que los bots puedan sobrevivir en un mundo normal?» (monstruos, noche, daño). Hoy todo vive en el mundo pacífico del usuario: la red decide entre 6 habilidades con 25 entradas, la «amenaza» es una entidad marcada a mano y la vida y las muertes de F5 eran simuladas. F5 ya enseñó dos cosas: con la misma red, el perfil supervivencia huye más (92 % frente a 44-54 %), y la medición de supervivencia real en el mundo del usuario mide la navegación (agua, charco, pasillos entre zonas) y no el perfil. Por eso existe `servidor-supervivencia/` (25566, RCON 25576, semilla 20261015, dificultad normal), preparado y sin arrancar por falta de RAM.

Lo que falta, en orden de dependencia: **datos y herramientas separados por mundo → sentidos nuevos → habilidades de supervivencia (reflejos en el cuerpo) → simulador con noche, hambre, monstruos y daño → red nueva → medición en el mundo aparte → la mente (Alma) planificando refugio, comida y exploración**. Este plan no implementa nada; fija ficheros, pasos, criterios de verificación y de calidad para que lo ejecuten trabajadores con Opus, una fase por trabajador.

## Respuesta corta a la pregunta del usuario
Para que un bot sobreviva en un mundo normal hacen falta cuatro cosas, y la pregunta de diseño es cuáles son reflejo (red/habilidad) y cuáles deliberación (Alma):
1. **Sentidos**: hostiles con tipo y distancia (ya hay `hostilCercano`), hambre (`bot.food`), luz y hora (`block.light`, `bot.time.timeOfDay`), equipo y comida en el inventario, altura al suelo y agua/lava cerca, y si hay un refugio conocido. La red actual no ve nada de esto salvo `amenaza_dist`, `noche` y `salud`.
2. **Habilidades nuevas**: `comer`, `atacar` (solo zombis, esqueletos y arañas, con arma o puño, retirándose de creepers), `refugiarse` (tapiarse con 1 bloque de tierra o cavar un hoyo de 1×2 y cerrarlo con un bloque encima), `dormir` (cama) o `esperar_al_dia` dentro del refugio, `fabricar` (tabla, mesa, espada y pico de madera y de piedra; se parece a `construir`, que ya hace tablones), `equipar` (arma y armadura si las hay), `apartarse` (de lava, caídas y agua profunda; la mitad ya existe en `prudentesSecos`).
3. **Cadena de recursos mínima**: madera → tablones → mesa → espada y pico → piedra → espada de piedra; comida (manzanas, animales, pan no al principio); 1-2 bloques de tierra siempre encima para tapiarse; cama cuando haya lana (3 ovejas) o se renuncia a ella y se espera dentro del refugio.
4. **Simulador y red nuevos**: el semi-MDP de `entorno_habilidades.py` tiene ya noche, 1 hostil y 1 vida/s. Falta hambre, varios hostiles con tipo, luz, refugio, comida, herramientas y una recompensa de supervivencia. La red pasa de 25→6 a ~38→11 y se reentrena con DQfD contra un guion de supervivencia escrito a mano (como en F2-F3).

**Reparto cuerpo-mente** (decisión de diseño de este plan):
- **Reflejos en el cuerpo (sin red, como el del cofre)**: `comer` si hambre ≤ 6 y hay comida; `huir`/`refugiarse` si salud < 8 con hostil a ≤ 8; `apartarse` de lava y agua profunda; equipar la mejor arma al ver un hostil. Son reglas duras: la red no debe poder desaprenderlas.
- **Red (decide entre habilidades, según el perfil)**: huir frente a atacar frente a seguir trabajando cuando hay un hostil a la vista; refugiarse al caer la noche frente a aprovecharla; comer antes de que apriete el hambre; ir a por comida o madera. Es la zona gris donde el perfil importa y donde medimos.
- **Mente (Alma)**: dónde poner el campamento, cuándo fabricar herramientas, qué cadena de recursos seguir (madera → mesa → espada → cama), explorar para buscar ovejas o comida, salir de atascos, y decidir el perfil del cuerpo según la hora («al anochecer, supervivencia y vuelve al refugio»). La mente no toca un hostil ni un golpe: solo lee eventos (`amenaza`, `salud_baja`, `muerto`, `hambre`, `noche`) y fija metas.

## Restricciones que condicionan el plan
- **RAM**: 15,9 GB totales, ~2,3 GB disponibles ahora, swap llena (3,4 de 3,9 GB). Consumen: cliente Minecraft del usuario 1,7 GB, servidor del usuario 1,25 GB, narrador 1,5 GB, bots 0,57 GB, sesiones de Claude ~2,5 GB. El servidor de supervivencia pide 3 GB disponibles (`arrancar.sh`, `MINIMO_MB`). No caben los dos servidores con el cliente abierto.
- **Servidor del usuario**: no se para ni se reinicia; el trabajador 033849 (mente de Alma, sesión de 20 min desde las 03:40) lo está usando; no mandar nada hasta que acabe.
- **No tocar todavía** `entrenar_*`, `politica_*.json` ni la red; esta es la fase de plan.
- Sin `pkill -f`, sin commits, sin claves de API. Trabajadores con Opus; criterios fijados antes de medir.

## Procedimiento de RAM (vale para todas las fases con el servidor de supervivencia)
Dos ventanas posibles; la elección es del usuario (pregunta final 1):
- **Ventana A (recomendada)**: cuando el usuario cierre su **cliente** de Minecraft (libera ~1,7 GB) y los bots del mundo del usuario estén parados por PID (~0,6 GB), quedan ~4,5 GB: cabe el servidor de supervivencia con su propio servidor del usuario en marcha. No hace falta parar nada del usuario.
- **Ventana B**: además, parar el servidor del usuario con `save-all flush` + `stop` por RCON (solo cuando no esté dentro y con su permiso explícito): ~5,8 GB libres, más holgura para el primer arranque (generación del mundo).
- **Nunca** los dos servidores con el cliente abierto. El servidor de supervivencia se baja a `-Xmx1536M` en `arrancar.sh` (un bot, distancia 8, bastan) y `MINIMO_MB=2560`; se mide con `medir_carga.py` la primera vez y se deja escrito el consumo real en `mundo.json`.
- **Sesiones cortas y guardadas**: cada sesión en el mundo de supervivencia termina con `guardar.sh --copia ETIQUETA` y `parar.sh`; una copia tar.gz por hito (`copias/mundo-*-semilla-limpia`, `…-con-refugio`).
- Lo que **no necesita servidor** y se puede hacer ahora, con la RAM actual: F7.0 (separar datos), F7.1-F7.2 (código del bot, comprobado en seco), F7.3 (simulador) y F7.4 (entrenamiento en CPU; numpy, ~1 GB).

## Fases

### F7.0 · Datos y herramientas por mundo (sin servidor; ~2 h de trabajador)
Hoy el bot con `IO_SERVIDOR=supervivencia` sigue leyendo `zonas.json`, `cofres.json`, `obras.json` y escribiendo en `mente/diario.md` del mundo del usuario.
- **Carpeta de datos por mundo**: `mundos/usuario/` (enlaces o movimiento de `zonas.json`, `cofres.json`, `obras.json`; se mantienen los ficheros en la raíz como enlaces simbólicos para no romper nada) y `mundos/supervivencia/` (`zonas.json` vacío, `cofres.json` vacío, `obras.json` con `permitido: null` hasta que el campamento exista, `mundo.json` de `preparar.py`).
- **Un solo punto de resolución**: `bot/mundo.js` exporta `{nombre, carpetaDatos, puertoMc, diario}` a partir de `IO_SERVIDOR`; `zonas.js`, `cofres.js`, `obras.js`, `registro.js` (`DIARIO` → `mundos/<mundo>/diario.md`) y `informe.js` lo usan. En Python, `servidor/rcon.py` ya resuelve el servidor; añadir `entrenamiento/mundo.py` con la misma resolución para `ejecutor.py` (`DIARIO`, `ZONAS`), `medir_ejecutor.py` y `experimentos.py` (puntos de partida: hoy fijos del arbolado; en supervivencia, los lee de `mundo.json: aparicion` y de una lista `puntos` que escribe F7.5).
- **Verificación**: `IO_SERVIDOR=supervivencia node -e` que carga los módulos y comprueba rutas; sin la variable, `medir.py 2 42 --excluir 305,10,317,21` da lo mismo que ayer (2 puntos, pacífico) para demostrar que el mundo del usuario no cambia. Criterio: cero rutas al mundo del usuario desde el modo supervivencia (grep de `zonas.json|cofres.json|obras.json|diario.md` fuera de `mundo.js`/`mundo.py` = 0).

### F7.1 · Sentidos nuevos (bot; sin servidor para escribir, servidor de supervivencia para calibrar)
Añadir a `bot/observacion.js` una **observación de supervivencia** (sin tocar aún las 25 entradas que usa la red actual: `obs` sigue igual; `obs_sv` da el vector nuevo y `datos` extendidos). Entradas nuevas en [0, 1] (nombres definitivos en `entorno_supervivencia.py: OBS`, fuente única):
| entrada | cálculo en el bot |
|---|---|
| `hostil_dist`, `hostil_tipo_zombi/esqueleto/aranya/creeper/otro` (one-hot 5) | `hostilCercano(bot, 24)` por `e.name` (`type === 'hostile'` ya funciona en normal; `amenaza_prueba` sigue valiendo) |
| `hostiles_n` (/4) | hostiles a ≤ 16 |
| `hambre` | `bot.food / 20` |
| `comida_inv` (/8) | `registry.foodsByName` (ya en `estado`) |
| `luz` | `bot.blockAt(pos).light / 15` (luz de bloque + cielo; 0 de noche sin antorchas) |
| `hora` (seno/coseno del día, 2 entradas) | `bot.time.timeOfDay` |
| `arma` (0 nada, 0,5 madera, 1 piedra o mejor), `armadura` (/20 puntos) | inventario y `bot.entity.equipment` |
| `tierra_inv` (/4) | bloques colocables (tierra, piedra, tablones) |
| `refugio_dist` (/48), `en_refugio` | memoria del personaje: posición del último `refugiarse` o del campamento |
| `cama_inv` | 0/1 |
| `caida`, `lava_cerca`, `agua_profunda` | bloques bajo los pies y a ≤ 3 (reutiliza `prudentesSecos` y el vigía de agua de `explorar.js`) |
| `salud`, `noche`, `troncos_inv`, `arbol_dist`, `arbol_enfrente`, `tronco_al_alcance`, `objetos_suelo`, `tiempo_restante`, `previa_*`, `previa_exito`, perfil (4) | como hoy |
Quitar en la red nueva las 4 del compañero (fase C) y `jugador_dist` (en el mundo aparte no hay jugador humano; se puede volver a añadir), o mantenerlas a 1,0 fijas: **decisión: mantener `jugador_dist` y quitar las 4 del compañero**, para que la red siga sirviendo en el mundo del usuario (el cooperativo) y no crezca sin motivo.
- **Eventos nuevos** en `informe.js`: `hambre` (≤ 6), `golpe` (`bot.on('entityHurt')` sobre sí mismo, con el atacante si se ve), `noche`/`dia`, `refugiado`, `muerto` (ya), `reaparecido` (`bot.on('spawn')` tras muerte).
- **Verificación**: en seco, `obs_sv` devuelve el vector con los nombres de `OBS`; con el servidor de supervivencia, un guion `servidor-supervivencia/probar_sentidos.py` que pone noche por RCON, invoca un zombi a 10 bloques (`summon` con NoAI), quita hambre (`effect give @s hunger`) y comprueba que las entradas cambian como se espera (10 comprobaciones, todas deben pasar).

### F7.2 · Habilidades de supervivencia (bot/habilidades/*.js; se escriben en seco y se prueban en el mundo aparte)
Cada una devuelve `{habilidad, exito, causa, …, ms}` como las demás, respeta la cancelación y la interrupción por amenaza (salvo `atacar`, `huir`, `refugiarse`, que son las respuestas a la amenaza). Sin plugins nuevos (no hay `mineflayer-pvp` ni `auto-eat` en `node_modules`; se hace con `bot.attack`, `bot.consume`, `bot.equip`, `bot.craft`, `bot.sleep`, `bot.placeBlock`).
| habilidad | qué hace | éxito | fallos |
|---|---|---|---|
| `comer [minimo=14]` | equipa la mejor comida (sin patata venenosa ni carne cruda si hay cocinada) y `consume()` hasta hambre ≥ mínimo | hambre sube | sin comida · interrumpido |
| `atacar [tipo|-] [segundos=20]` | equipa arma; persigue al hostil a ≤ 3 y golpea cada 0,6 s (`attack`), mirando; **se niega** con creeper (lo trata como huir), con salud < 6 o con ≥ 3 hostiles; retrocede 2 bloques tras cada golpe a esqueletos | hostil muerto o huido a > 16 | sin arma y sin puño permitido · creeper · salud baja · lo perdí · tiempo agotado |
| `refugiarse [modo=auto]` | **tapiarse**: con ≥ 2 bloques colocables se encierra en 1×2 (bloques a los 4 lados y encima, donde falten); si no, **cavar**: baja 2 bloques en vertical (nunca sobre agua/lava/aire: comprueba las 3 capas de abajo) y tapa arriba. Guarda `refugio` en la memoria del personaje | encerrado (6 caras sólidas) | sin bloques ni pico · suelo peligroso · interrumpido |
| `salir_del_refugio` | rompe el bloque de arriba o de un lado y sube | fuera | — |
| `dormir` | si lleva cama la coloca y `sleep()`; si no, `esperar_al_dia` dentro del refugio: espera hasta `timeOfDay` < 12000 con `comer` si hace falta | amanece | sin cama y sin refugio · monstruos cerca (el juego lo impide) |
| `fabricar OBJETO` | tabla, mesa, palo, espada/pico/hacha de madera, espada/pico de piedra, antorcha; coloca mesa si hace falta (y la recoge después); reutiliza la conversión troncos→tablones de `construir.js` | el objeto en el inventario | faltan materiales · sin mesa y sin tablones · receta desconocida |
| `equipar` | mejor arma en mano, armadura si la hay | equipado | nada que equipar |
| `apartarse` | de lava, de borde con caída > 3 y de agua profunda: 4 bloques hacia terreno seguro (`prudentesSecos`) | a salvo | sin camino |
| `recoger_comida` | manzanas caídas, carne de animales muertos; ataca animales pasivos (vaca, cerdo, pollo, oveja) a ≤ 12 solo si `hambre ≤ 12` y de día | +comida | nada que comer a la vista |
`huir` y `picar_tronco` ya existen. `minar` existe pero solo dentro de `obras.json: permitido`: en supervivencia el rectángulo permitido es un radio de 64 alrededor del campamento (lo escribe F7.5 en `mundos/supervivencia/obras.json`).
- **Reflejos en `io.js`** (como el del cofre, con interruptor `reflejos [si|no]` para medir con y sin): tras cada habilidad y cada 2 s en reposo: `apartarse` si peligro; `comer` si hambre ≤ 6 y hay comida; `equipar` al aparecer un hostil; `huir`+`refugiarse` si salud < 8 y hostil a ≤ 8; nunca `atacar` por reflejo.
- **Órdenes en lenguaje sencillo** (`ordenes.js`): come, ataca [al zombi], refúgiate, sal, duerme, fabrica una espada, equípate, apártate, caza. La mente las usa.
- **Prueba** `servidor-supervivencia/probar_supervivencia.py` (hermana de `probar_habilidades.py`; semilla 42; todo por RCON en el mundo aparte): 10 pruebas de cada habilidad con el estado preparado (`give`, `summon` con y sin NoAI, `time set`, `effect`). **Criterios fijados antes de medir**: comer 10/10; fabricar 10/10 por objeto; refugiarse ≥ 9/10 en terreno llano y ≥ 7/10 en ladera, nunca cava sobre agua o lava (0 fallos de seguridad); atacar a un zombi con espada de madera ≥ 8/10 sin bajar de 10 de salud, a un esqueleto ≥ 6/10; esperar_al_dia 5/5 sin daño dentro del refugio; apartarse 10/10 con la lava puesta a 2 bloques. Los tiempos medianos de cada una van a `habilidades_medidas_sv.json` para calibrar el simulador (mismo formato que `habilidades_medidas.json`).

### F7.3 · Simulador de supervivencia (`entrenamiento/entorno_supervivencia.py`; sin servidor)
Nuevo módulo, hermano de `entorno_habilidades.py` (que no se toca: la red actual sigue valiendo para el mundo del usuario). Reutiliza de él `cargar_perfiles`, `vector_perfil`, `calibrar` (generalizado a una ruta), la mecánica de árboles/objetos y el guion como base.
- **Acciones (11)**: `ir_a_arbol, picar_tronco, recoger, huir, comer, atacar, refugiarse, dormir, fabricar, recoger_comida, explorar` (`explorar` ya existe en el bot; `equipar`, `apartarse` y `salir_del_refugio` son reflejos o pasos internos, no acciones de la red; `ir_a_jugador` y `ir_a_otro_arbol` quedan fuera: en el mundo aparte no hay jugador ni equipo; la observación mantiene `jugador_dist` a 1,0).
- **Estado nuevo**: hambre (baja 1 cada ~80 s andando, ~40 s luchando; con hambre 0, 1 de vida cada 4 s hasta 1 de vida en normal), hostiles como lista (tipo, distancia, vida; de noche aparecen a ritmo creciente con la oscuridad, hasta 3; de día se queman zombis y esqueletos, las arañas se vuelven neutrales, los creepers quedan), daño por tipo (zombi 3 cada 1 s a ≤ 2; esqueleto 2-4 cada 2 s a ≤ 15 con probabilidad por distancia; araña 2; creeper 25-49 si está a ≤ 3 más de 1,5 s), armadura y arma (espada de madera 4, de piedra 5, puño 1; zombi 20 de vida, esqueleto 20, araña 16), refugio (dentro, sin daño salvo creeper pegado; salir cuesta 2 s), luz (1 de día, 0 de noche al aire libre, 0,3 en refugio con antorcha), cama (dormir salta la noche si no hay hostiles a ≤ 8), inventario de comida, tierra, tablones, herramientas; objetos del árbol como hoy. Duración del episodio: **un día entero de Minecraft (1200 s) empezando a las 6:00 o a las 18:00** (la mitad de cada), con un `tiempo_restante`.
- **Recompensa por perfil** (misma fórmula de F2 más términos nuevos, pesos del perfil): `madera·troncos − tiempo·s − seguridad·(0,05·vida perdida + 5·muerte) + comida·0,02·(hambre comida) + supervivencia·1 por noche pasada sin daño`. `perfiles/*.json` ganan un peso `supervivencia` (defecto 0,5; supervivencia 3, recolector 0,5, explorador 0,2) y `_escala.json` su divisor (5). El vector de perfil pasa de 4 a 5 entradas.
- **Guion de supervivencia a mano** (`guion_sv_lote`): comer si hambre ≤ 7 y hay comida; apartarse si peligro; creeper a ≤ 6 → huir; hostil a ≤ 8: con arma ≥ madera y salud ≥ 10 y ≤ 1 hostil → atacar, si no → huir y, si es noche y hay bloques, refugiarse; al oscurecer (`luz < 0,3` y noche) sin refugio → refugiarse (o dormir con cama); dentro del refugio de noche → dormir/esperar; de día, sin espada y con ≥ 2 troncos → fabricar; hambre ≤ 12 y sin comida de día → recoger_comida; si no, el guion de madera de hoy. Los perfiles cambian umbrales (seguridad alta: huir siempre, refugiarse al atardecer; baja: atacar hasta 2 hostiles, trabajar de noche con luz).
- **Verificación del simulador** (`python3 entorno_supervivencia.py 300`): azar frente a guion por perfil; criterios: guion ≥ 90 % de episodios sin muerte en 1200 s con el recolector y ≥ 97 % con supervivencia; azar < 50 %; el guion sigue sacando madera (≥ 60 % de la del guion pacífico de hoy en un día). Si el azar sobrevive casi siempre, el simulador es demasiado blando y se endurece antes de entrenar (esto se fija aquí para no «afinar» después).
- **Calibración**: `calibrar(ruta=habilidades_medidas_sv.json)` tras F7.2; tiempos y probabilidades de las habilidades nuevas; hasta tenerlos, los valores por defecto arriba, marcados como «sin medir».

### F7.4 · Entrenamiento de la red de supervivencia (CPU; sin servidor; 2-4 h de máquina)
- `entrenamiento/entrenar_supervivencia_rapido.py`, copia de `entrenar_habilidades_rapido.py` apuntando a `entorno_supervivencia` (misma receta: DQN doble, DQfD con suelo 0,1, γ 0,97 por 10 s, actores en procesos, validación cada décimo); red **~40→64→64→11**. Salida `politica_supervivencia_sN.json` con `obs` y `acciones` propias; `politica_habilidades.json` **no se toca**. `red.js` pasa a aceptar `IO_POLITICA` con otro conjunto de entradas si coinciden con `obs_sv` (hoy exige las 25 de `NOMBRES`: se generaliza a «la política dice qué observación quiere»).
- Episodios: 6000, semillas 0 y 1, perfiles por turnos, un agente (los equipos se dejan para después). RAM: ~1 GB con 4 actores y 12 evaluadores; se puede bajar `EVALUADORES=6` si hace falta.
- **Criterios (prueba final, 300 mundos emparejados por perfil)**: red − guion en muertes ≤ 0 (no muere más que el guion), red − guion en recompensa ≥ −0,1 por mundo, supervivencia 0-1 muertes en 300; coincidencia con el guion ≥ 95 % (si es 99,9 %, la red no aporta; se anota, no es fallo). Se elige la semilla con mejor recompensa total de validación, como siempre. Comprobación numpy float64/float32 300/300.
- Lo que la red puede aprender y el guion no tiene: cuándo compensa atacar un hostil solo frente a huir, y cuándo seguir talando con luz de noche. Se mira en la tabla de uso.

### F7.5 · Primer arranque y campamento en el mundo aparte (ventana A o B; 1 sesión de ~1 h)
1. `MINIMO_MB=2560 servidor-supervivencia/arrancar.sh` (tras bajar `-Xmx` a 1536M), `comprobar.py` (ya escrito: Prueba1, árboles, noche, monstruos vistos), revisar `mundo.json` y que `server.properties` siga en 600. `guardar.sh --copia semilla-limpia`.
2. Trabajador elige el **campamento**: con `explorar` desde la aparición, un punto llano y seco a ≤ 40 bloques del bosque, lejos del agua; lo escribe en `mundos/supervivencia/mundo.json: campamento` y `obras.json: permitido` (radio 64). Puntos de partida para medir: 4 puntos a 15-30 bloques del campamento, sin agua en 8 bloques (`motion_blocking_no_leaves`, la comprobación que ya se sabe que ve el agua bajo hojas), en `mundo.json: puntos`.
3. `medir_carga.py` adaptado al RCON de supervivencia: memoria del servidor y ms por tick con 1 bot. Se anota.
4. `parar.sh`. Criterio: `comprobar.py` todo en verde, copia hecha, carga anotada.

### F7.6 · Medición de supervivencia real (`entrenamiento/experimentos_sv.py`; ventana A o B; 2-3 sesiones de ≤ 1,5 h)
Reutiliza de `experimentos.py` el reparto por celdas, réplicas, `resumen` y el `Vigia` (posición y vida por RCON cada 0,5 s), pero **sin amenaza fantasma ni vida simulada**: el daño es real. Cada ejecución: un bot (Prueba1) teletransportado a un punto, inventario fijado por RCON (`clear` + `give`: 1 hacha de madera, 4 pan, 4 tierra; variante «desnudo» sin nada), **hora fijada** (`time set 12000`, atardecer: la noche entera cae dentro de la ejecución) y `gamerule doDaylightCycle true`; 1 noche de Minecraft (≈ 10 min reales, 600 s) o hasta la muerte. Al acabar: `kill @e[type=!player]` de hostiles en 64 bloques, `time set day`, reponer bloques del refugio con la lista que devuelve `refugiarse` (el bot apunta cada bloque como `obras.json`).
- **Matriz**: políticas {red de supervivencia, guion de supervivencia, red vieja (`politica_habilidades.json`, que solo sabe huir), quieto} × perfiles {recolector, supervivencia} × 4 puntos × 2 réplicas, equipo «hacha + pan + tierra». Variante «desnudo» solo con red y guion. ≈ 48 ejecuciones de 10 min = 8 h de servidor: **se divide en sesiones** con `--seguir`, y se baja a 1 réplica si no hay ventanas (24 ejecuciones, 4 h).
- **Métricas fijadas antes**: supervive la noche (sí/no), vida mínima, vida perdida total, golpes recibidos, hostiles matados, segundos refugiado, troncos, veces que comió, y la elección ante hostil a la vista (huir/atacar/refugiarse/otra). Criterio principal: **tasa de supervivencia por noche**; secundario: vida perdida. Éxito de la fase: red de supervivencia ≥ 75 % de noches sobrevividas con equipo (y ≥ 50 % desnudo), frente a la red vieja; red ≥ guion − 10 puntos; «quieto» como suelo (en normal, un bot quieto al aire libre muere casi siempre). Diferencias con la dispersión entre réplicas, como en F5 (|dif| > 2 σ_rep y mismo signo en los 4 puntos).
- Brecha sim→real: cada causa de muerte real (caída, creeper, ahogo, hambre) se traslada al simulador antes de reentrenar, como manda la regla del PLAN.

### F7.7 · La mente en supervivencia (Alma; ventana A o B; después de F7.6)
- `mente/alma/GUIA_supervivencia.md` (o sección en GUIA.md activada por `IO_SERVIDOR`): metas del día («cadena mínima»: 8 troncos → mesa → espada y pico de madera → 8 piedra → espada de piedra → comida para 2 días → cama o refugio fijo con puerta), reglas del anochecer (a las 11500 ticks: perfil supervivencia y «vuelve al campamento y refúgiate»), y qué eventos obligan a reaccionar (`salud_baja`, `hambre`, `muerto`).
- `mente.py` gana `--mundo supervivencia` (puerto 3104, nombre `AlmaSV` o la propia Alma en el otro servidor), lee `mundos/supervivencia/diario.md` y el informe incluye hambre, hora, equipo y refugio (ya hay `hambre` y `hora` en `resumen`).
- **Medida** (`experimento_mente_sv.py`, hermano de `experimento_mente.py`): 3 días de Minecraft (1 h real) **cuerpo solo en libre con la red nueva** frente a **cuerpo + mente**, mismo punto, inventario vacío. Criterio: días sobrevividos (0-3), objetos de la cadena conseguidos (espada, mesa, cama o refugio fijo), muertes. Éxito: la mente consigue la cadena hasta espada de piedra en ≤ 3 días y no muere más que el cuerpo solo. Dos trabajadores de Opus con contrato de 45 min cada día de juego.

## Orden recomendado y coste
| fase | servidor | RAM extra | tiempo trabajador / máquina | cupo (Opus) |
|---|---|---|---|---|
| F7.0 datos por mundo | no | 0 | 2 h | bajo |
| F7.1 sentidos | solo para probar (F7.5+) | 0 | 3 h | medio |
| F7.2 habilidades | no para escribir; sí para `probar_supervivencia.py` | 0 / 1,5 GB | 6-8 h en 2 trabajadores | alto |
| F7.3 simulador | no | 0 | 4 h | medio |
| F7.4 entrenamiento | no | ~1 GB, 2-4 h CPU (4 actores + 12 evaluadores; 28 núcleos) | 1 h + espera | bajo |
| F7.5 arranque y campamento | **sí** (ventana A/B) | 1,5-2 GB | 1 h | bajo |
| F7.2 pruebas + F7.1 calibración | **sí** | 1,5-2 GB | 2 sesiones de 1 h | medio |
| F7.6 medición | **sí** | 1,5-2 GB | 2-3 sesiones de 1,5 h | medio |
| F7.7 mente | **sí** | 1,5-2 GB | 3 sesiones de 1 h | alto (sesiones de Alma) |
Orden: **F7.0 → F7.3 (simulador con valores por defecto) → F7.1 y F7.2 en seco → F7.5 (primera ventana) → pruebas F7.2 y calibración → F7.4 (reentrenar calibrado) → F7.6 → F7.7**. Lo que no requiere servidor (F7.0-F7.4 en seco) puede empezar ya con la RAM actual, sin tocar el servidor del usuario; el simulador se entrena una primera vez sin calibrar para detectar fallos de diseño y otra tras calibrar.

## Riesgos
- **Brecha sim→real mayor que en F2**: el combate y el terreno (cuevas, acantilados, agua) no se parecen al plano 2D. Mitigación: criterios de F7.2 por habilidad en el mundo real antes de medir la política; cada muerte real se modela.
- **Creepers**: destruyen el refugio y matan de un golpe. Regla dura: nunca atacar; huir a ≥ 8; refugio bajo tierra (cavar) es más seguro que tapiarse en superficie: se mide en F7.2 cuál sobrevive mejor.
- **Muerte y reaparición**: el bot reaparece en el punto de aparición sin inventario (`keepInventory false` en normal). Decisión: `keepInventory` **false** en las mediciones (si no, no se mide nada) y el banco repone el inventario fijo por RCON en cada ejecución.
- **RAM**: si una ventana se cierra a mitad (el usuario abre el cliente), el servidor de supervivencia puede quedarse sin memoria y el sistema swapear; `arrancar.sh` ya se niega al principio, pero hace falta que el trabajador compruebe `MemAvailable` cada ejecución y pare con `parar.sh` (guardando) si baja de 800 MB. Añadirlo a `experimentos_sv.py`.
- **RCON compartido** (pendiente h de F5): un solo lector por servidor; el `Vigia` y las órdenes del banco van por el mismo hilo o con un cerrojo.
- **`block.light`** puede venir a 0 si el servidor no manda luz de bloque a los bots; se comprueba en F7.1 y, si falla, `luz` se deriva de la hora y de si hay techo (`skyLight`).
- **Daño de verdad al bot del usuario**: nada de esto corre en el mundo del usuario; `IO_SERVIDOR` sin valor sigue yendo al mundo pacífico, y las habilidades nuevas allí no se activan por reflejo (interruptor `reflejos no` por defecto en el mundo del usuario; `atacar` se niega sin hostiles reales).
- **Cupo**: F7.2 y F7.7 son las fases caras; se parten en trabajadores de ≤ 45 min con criterios ya escritos aquí.

## Ficheros que se crearán o tocarán (resumen)
- Nuevos: `bot/mundo.js`, `entrenamiento/mundo.py`, `mundos/{usuario,supervivencia}/…`, `bot/habilidades/{comer,atacar,refugiarse,salir_del_refugio,dormir,fabricar,equipar,apartarse,recoger_comida}.js`, `entrenamiento/entorno_supervivencia.py`, `entrenamiento/entrenar_supervivencia_rapido.py`, `entrenamiento/experimentos_sv.py`, `entrenamiento/experimento_mente_sv.py`, `servidor-supervivencia/{probar_sentidos,probar_supervivencia}.py`, `entrenamiento/habilidades_medidas_sv.json`, `entrenamiento/politica_supervivencia_s*.json`, `mente/alma/GUIA_supervivencia.md`.
- Tocados: `bot/{zonas,cofres,obras,registro,informe,observacion,red,io,ordenes}.js`, `bot/habilidades/index.js`, `servidor-supervivencia/arrancar.sh` (Xmx, MINIMO_MB), `entrenamiento/{ejecutor,medir_ejecutor,experimentos,medir_carga}.py` (resolución del mundo), `perfiles/*.json` y `_escala.json` (peso `supervivencia`), `mente/alma/mente.py`, `PLAN.md` (sección F7), `bot/README.md`.
- Intactos: `entrenar_habilidades*.py`, `politica_habilidades.json`, `entorno_habilidades.py`, `zonas.json`/`cofres.json`/`obras.json` del usuario (solo se mueven a `mundos/usuario/` con enlace), `servidor/`.

## Cómo se verifica en Minecraft (resumen de puertas)
1. F7.0: `medir.py 2 42 --excluir …` da lo mismo que la última medida con el mundo del usuario; modo supervivencia sin rutas al mundo del usuario.
2. F7.2: `probar_supervivencia.py` con los criterios por habilidad (arriba); `habilidades_medidas_sv.json` escrito.
3. F7.3/F7.4: guion ≥ 90 %/97 % de supervivencia en el simulador; red − guion en muertes ≤ 0.
4. F7.6: tasa de noches sobrevividas con la red nueva ≥ 75 % con equipo, con el mismo criterio de dispersión de F5.
5. F7.7: cadena hasta espada de piedra en ≤ 3 días con la mente; muertes ≤ cuerpo solo.

## Preguntas que solo el usuario puede responder
1. **Ventana de RAM**: ¿basta con que cierres tu cliente de Minecraft cuando no juegues (ventana A, tu servidor sigue en marcha), o permites además parar tu servidor con `stop` por RCON cuando no estés dentro (ventana B)? Si no respondes, se usa solo la A.
2. **Nombre del bot en el mundo de supervivencia**: ¿Soma, Eco, Iris y Alma también allí (mismos nombres, otro mundo), o personajes de prueba (Prueba1…, SomaSV, AlmaSV)? Propuesta: los mismos nombres, porque el experimento es «los mismos bots en un mundo normal»; los puertos de control serían 31xx para no chocar con los del mundo del usuario.
3. **Muerte**: ¿aceptas que los bots mueran de verdad en el mundo aparte (sin inventario al reaparecer) para que la medida valga?
4. **Orden de prioridad frente a F6**: la mente de Alma (F6) aún no está medida en Minecraft (T1-T3). ¿Terminar F6 antes de empezar F7.5-F7.7, o intercalar (F7.0-F7.4 no estorban a F6)? Propuesta: intercalar.

## Decisión del usuario (2026-10-15, por voz): reacción al daño (F7.2 y simulador)
- Si el bot recibe 2 golpes seguidos en menos de 3 s (señal de que hay más de un atacante), HUYE (reflejo `golpe` interrumpe la habilidad).
- Si recibe daño de un solo atacante (un golpe, un solo monstruo), SE DEFIENDE (`atacar`), no huye.
- Esto sustituye al "huir cuando le hieren" propuesto por F7.3. Ajustar el simulador y recalibrar en F7.2/F7.4. Sigue abierto: criterio del azar (55,7 % vs < 50 %).

### Refinamiento aprobado por el usuario (2026-10-15): reglas de reacción al daño
1. Contar ATACANTES DISTINTOS, no golpes: huir si 2 o más atacantes distintos le hieren en < 3 s (un zombi que pega varias veces sigue siendo uno). Un solo atacante: defenderse (`atacar`).
2. Creeper: nunca se defiende, se aparta y huye siempre. El daño que no viene de un monstruo (caída, fuego, lava, hambre) no cuenta como ataque.
3. Aunque sea un solo atacante, huir si la salud < 8. Esqueleto a distancia: acercarse o tapiarse, no quedarse quieto.
Aplicar en F7.2 (reflejo `golpe` en el bot) y reflejar en el simulador (F7.3) al recalibrar.

### Simplificación del usuario (2026-10-15, sustituye a las dos anotaciones anteriores sobre golpes)
- NO se usa la ventana de golpes en < 3 s. El bot ya detecta cuántos enemigos hay (`hostiles_n`).
- Huye solo si hay MÁS DE 2 enemigos (3 o más) o la salud es baja (< 8). En cualquier otro caso se defiende (`atacar`).
- Se mantiene, salvo que el usuario diga lo contrario: creeper = apartarse siempre; el daño que no viene de monstruos no cuenta.

### Decisión del usuario (2026-10-15): criterio del azar
Se afloja el criterio de cordura del simulador: el bot que elige al azar debe sobrevivir < 60 % (antes < 50 %; medido 55,7 %). No se endurece el simulador con números inventados; se medirán los parámetros de verdad en el mundo de supervivencia (F7.5).

### Decisiones del usuario tras F7.2 (2026-10-15)
- Regla «acorralado» APROBADA: si huir falla y un monstruo sigue a ≤ 4 bloques, se defiende aunque haya más de 2 enemigos o poca vida (ya implementada como propuesta en F7.2; queda confirmada).
- Criterio del azar: el límite (< 60 %) se aplica solo a la versión SIN reflejos (54,0 % medido, cumple); con reflejos (73 %) no se exige.

### Decisión del usuario tras F7.4 (2026-10-15)
Se entrena la red de supervivencia por CLONACIÓN del guion con DAgger (fidelidad objetivo ≥ 95 %, muertes similares a las del guion), no por DQfD con la recompensa actual. Mejora con refuerzo después, si procede.

### Decisión del usuario tras DAgger (2026-10-15)
Se usa la semilla 0 (pasa todos los criterios; 74 muertes frente a 61 del guion) como `politica_supervivencia_dagger.json`. Elegida DESPUÉS de ver los resultados (la regla previa elegía la semilla 1, que falla «muertes similares en total»): selección a posteriori, anotada.
