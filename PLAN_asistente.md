# Plan · Asistente personal (línea lateral F-asistente)

> Plan del 2026-10-31. **Para ejecutarlo: las fichas de `planes/asistente/`** (una por fase, para Sonnet; protocolo en su README). Se ejecuta en la sesión principal, sin trabajadores, por el límite de uso (ver «Límite de uso»); los criterios de cada fase están fijados aquí **antes de medir**. Este documento no implementa nada. Resumen en el vault: `conocimiento/roadmap/Asistente personal.md`.

## Contexto
El usuario (2026-10-31) pide un roadmap lateral, fuera de F6-F8, para un **asistente personal** en Minecraft. Debe ser un personaje que, con órdenes sencillas por chat o voz, haga lo siguiente:
- mina en un punto fijo hasta que se le diga;
- baja a las cuevas profundas y trae minerales;
- cuida una granja de cultivos y animales;
- hace el farmeo repetitivo;
- si muere, vuelve a donde murió a recoger sus cosas.

Pide además dos cosas: un **alcance reducido que no cueste entrenar**, y que funcione en **Minecraft Java 26.3**.

## Decisiones del usuario (2026-10-31)
1. El asistente vive en **el mundo propio del usuario** (`servidor/`, hoy 1.21.11 y sin recrear), **migrado a 26.3**. El banco local (`servidor-local/`, 26.1.2) sigue igual y es donde se mide.
2. Se llega a 26.3 con un **puente ViaProxy y el parche `tick_end`**: el bot habla 26.1 y el proxy traduce al servidor vanilla 26.3. Ver `conocimiento/decisiones/2026-10-31-tick-end-por-envoltorio.md`, que sustituye a la de ViaProxy: `tick_end` va por un envoltorio y no se fija mineflayer a master.
3. Granja v1 **mínima**: trigo, vacas, ovejas y gallinas. El asistente no construye cercados ni huertos: los hace el usuario y los marca con `!zona`.
4. **Sin red neuronal en v1**: todo es guion determinista, un rol v2 del capataz más habilidades. La fase A6, opcional, clona la zona gris por DAgger solo si una medida lo justifica. Ver `conocimiento/decisiones/2026-10-31-asistente-todo-guion-sin-red.md`.
5. **Límite de uso: ≤ 5 % del cupo semanal de Claude** para todo el trabajo de esta línea. Ver «Límite de uso» y `conocimiento/decisiones/2026-10-31-asistente-limite-semanal-5.md`.
6. Respuestas antes de A0: el asistente es **Soma**; el mundo 26.3 es **nuevo, con semilla aleatoria** (el 1.21.11 ya no estaba en el disco); servidor y proxy **solo en 127.0.0.1**.

## Hechos que condicionan el plan (comprobados el 2026-10-31)
- **Java 26.3 «Wilderness Bound»** salió el 15-09-2026 y pide Java 25. Ya está en `~/.minecraft/runtime/java-runtime-epsilon`, el que usa `servidor-local/arrancar.sh`.
- **mineflayer 4.39.0** es la última versión en npm (06-09-2026). Tanto ella como node-minecraft-protocol llegan hasta **26.1**, y `minecraft-data` solo trae `pc/26.1`. El soporte de 26.2 y 26.3 está en ramas `pc26_3` sin publicar.
- **Los servidores 26.3 expulsan al bot a los 1,5 s** (`invalid_player_movement`) si no manda `client_tick_end` tras cada movimiento (issue mineflayer #4189, abierto). La rama master de mineflayer ya lo manda desde el PR #4137 (03-10-2026), pero no hay versión publicada con ese cambio.
- **ViaProxy 3.4.13** (18-09-2026) añadió soporte de 26.3 como cliente y como servidor, y pide Java 17 o más. Hay informes de que, a través de Via, **los clics de ventana (cofres, mesa) pueden fallar**. Es el riesgo principal de A0 y se mide lo primero.
- **Lo caro aquí no es la CPU** (DAgger tarda 4-6 min). Lo caro son las horas de trabajador y las sesiones con servidor, a ≈ 1 punto de cupo por medida. El coste del plan se da en esas unidades.
- **El mundo del usuario tiene protecciones duras**:
  - `Y_MIN = 50` en `bot/habilidades/minar.js`.
  - La memoria persistente está apagada allí (`memoria_persistente.activo()` mira el nombre del mundo).
  - Hay zonas vedadas: `HOGAR`, `GRANARBOL` y `ESTANQUE`.

  El asistente necesita minería profunda y memoria en ese mundo, así que se abren **con una bandera del mundo**, no por su nombre.
- **Hoy nadie recupera nada tras morir.** `anotarMuerte` guarda la posición con `causa: null`. Además, `dormir.js` **recoge la cama** después de dormir, así que la reaparición no queda fijada en la base.

## Respuesta corta
El asistente es **un rol v2 del capataz** (`perfiles/v2/asistente.json`). En modo libre mantiene la granja y espera órdenes. Encima lleva **seis órdenes nuevas** de chat que lanzan **cuatro habilidades compuestas**: minar en un punto, expedición, recuperar tras morir y rutina de granja. Las cuatro se construyen con las ≈ 35 habilidades que ya existen. **No hay red**: el guion es determinista y medible. Casi todo el trabajo nuevo está en dos sitios, el puente a 26.3 y la minería profunda segura. La granja y la recuperación son sobre todo composición de lo que ya hay.

## Restricciones
- **Versión:** el bot habla siempre **26.1** (`mundo.json` → `version: '26.1'`) y el proxy traduce. Los bloques nuevos de 26.3 (álamo, bosque moteado) llegan como sustitutos de 26.1, y el asistente **no los usa** en v1.
- **Dónde se mide:** todo lo medible va en `servidor-local/` (26.1.2, con RCON), con bancos repetibles. En el mundo del usuario solo se hace una prueba de humo por fase.
- **Mundo del usuario (decidido en la fase P, 2026-10-31):** es un mundo nuevo y **sin límites**. Lleva `"reglas": "libre"` en `mundos/usuario/mundo.json`, y `bot/mundo.js` exporta `reglasLibres`: con las reglas libres funciona como el de supervivencia (minar hondo, cavar, memoria y reflejos). El usuario pone límites con `!zona`, y las zonas vedadas mandan siempre. Verter lava sigue prohibido por nombre. Los datos del mundo 1.21.11 quedan como archivo en la raíz (`mundos/usuario/LEEME.md`). Ver `conocimiento/decisiones/2026-10-31-mundo-del-usuario-sin-limites.md`.
- **F2-F8 no cambian de comportamiento.** Todos los cambios son aditivos, y Casual y Speedrunner siguen igual en el banco K.
- **RAM:** se sigue el procedimiento de `PLAN_F7_supervivencia.md` (un servidor cada vez con el cliente abierto). El proxy suma ≈ 200-300 MB.
- **Nombres:**
  - Los objetivos, variables del Makefile y opciones nuevas de CLI van **en inglés**.
  - Las órdenes de chat van **en español**, como las de `bot/ordenes.js`.
  - Las habilidades se nombran en español, como las 35 que existen y el catálogo `_etapas.json`.
- **Alcance:** un solo personaje, que por defecto es **Soma** salvo que el usuario elija otro nombre. Quedan fuera el trabajo en equipo, Alma en el bucle, el Nether y construir.

## Órdenes nuevas
Llegan por el chat del juego o por `curl "127.0.0.1:PORT/?c=orden …"`, y por voz con la skill `io-minecraft`.

| orden | ejemplo | lanza |
|---|---|---|
| `ve a X Y Z` | «Soma, ve a 120 64 -30» | `ir_a_punto` (hoy solo existe el comando crudo `ir x y z` del puerto) |
| `mina en X Y Z [N \| hasta llenar]` | «mina en 100 12 40 hasta llenar» | `minar_punto` |
| `trae MINERAL [N]` | «trae 16 de hierro», «trae diamantes» | `expedicion` |
| `recupera tus cosas` (también sola al reaparecer) | — | `recuperar_objetos` |
| `cuida la granja`, `cosecha`, `cría vacas`, `esquila` | — | `rutina_granja` o la habilidad suelta |
| `base aquí` | alias de «campamento aquí» | fija la base y el cofre de entrega |

Se reutilizan tal cual: `tala N`, `guarda`, `recoge`, `funde`, `fabrica`, `duerme`, `come`, `ven`, `sígueme`, `quédate`, `campamento`, `modo libre/órdenes` y `estado`.

## Fase P · Preparación para Sonnet (hecha el 2026-10-31)
Antes de A1, este modelo dejó lo que Sonnet necesita para no equivocarse:
- **P1:** los datos del mundo del usuario empiezan de cero.
- **P2:** las reglas por mundo (`reglasLibres`, `IO_REGLAS=duras|libres` para las pruebas, y `bot/probar_reglas_mundo_seco.js`).
- **P3:** el banco común `entrenamiento/arena.py`, y las puertas A1, A2, A4 y A5 **como código** en `entrenamiento/banco_asistente.py`, escritas antes de las habilidades. Se lanzan con `make bench-assistant PHASE=…` y se comprueban con `make verify`.
- **P4:** las fichas `planes/asistente/{README,TRAMPAS,A1,A2,A3,A4,A5}.md` y el borrador de la prueba de A1 (`planes/asistente/pruebas/probar_asistente_seco.js`, 30 frases).

## Fases
Orden: **A0 → A1 → A2 → A4 → A3 (∥ A5) → A6 opcional.** A4 va antes que A3 porque las expediciones matan.

| fase | contenido | puerta (criterio fijado antes de medir) | servidor | coste |
|---|---|---|---|---|
| A0 | puente 26.3 | conectado ≥ 10 min; camina, pica, pone, cofre, mesa y cama | usuario 26.3 | ≤ 8 h, 2 sesiones |
| A1 | rol, órdenes y memoria | parser 30/30; `ve a` 10/10; recuerda tras reiniciar | local + humo | ≤ 6 h, 1 sesión |
| A2 | minar en un punto | ≥ 64 bloques en el cofre en ≥ 4/5; 0 muertes | local + humo | ≤ 8 h, 2 sesiones |
| A4 | muerte y recuperación | ≥ 80 % recuperado en ≥ 6/8 de día; 0 segundas muertes | local | ≤ 6 h, 1 sesión |
| A3 | expedición profunda | ≥ 16 de hierro en ≥ 4/5; 0 muertes por lava | local + humo | ≤ 16 h, 3-4 sesiones |
| A5 | granja mínima | cosecha y resiembra 9/9 en 8/8; ≥ 1 cría en ≥ 6/8 | local + humo | ≤ 10 h, 2 sesiones |
| A6 | red de zona gris (opcional) | fidelidad ≥ 95 % y supera al guion en la puerta que falló | local | ≤ 8 h, 2 sesiones |

### A0 · Puente 26.3 (`servidor/`, `servidor/proxy/`, `bot/package.json`, `bot/mundo.js`, `Makefile`; difícil, investigación)
- **Servidor.** Se recrea `servidor/` con la misma forma que `servidor-local/`:
  - `descargar.sh` baja el jar vanilla **26.3** de Mojang y comprueba su sha1.
  - `arrancar.sh` usa Java 25, `-Xmx2G`, `online-mode=false` y RCON en 25575.
  - Hay también `parar.sh` y `guardar.sh`.
  - `server.properties` lleva `pause-when-empty-seconds=0`.
  - `white-list=false`: 26.3 la trae activada y con offline no sirve (ver «26.3 trae la lista blanca activada»).
  - El mundo es nuevo, con semilla aleatoria.
- **Proxy.** `servidor/proxy/descargar.sh` baja **ViaProxy 3.4.14** y comprueba su sha256. `arrancar.sh` lo lanza en modo CLI: escucha en 127.0.0.1:25568, apunta a 127.0.0.1:25565, versión de destino 26.3 y sin autenticación. El usuario entra **directo** al 25565 con su cliente 26.3, y el bot entra por el **25568** hablando 26.1.
- **tick_end.** Lo manda `bot/tick_end.js`, un envoltorio que escribe `tick_end` tras cada `position`, `position_look`, `look` y `flying`. Se enciende con `servidor.tick_end: true` en `mundos/usuario/mundo.json`. `bot/package.json` no cambia. Fijar mineflayer a un commit de master posterior al PR #4137 queda como plan B.
- **Datos del mundo.** `mundos/usuario/mundo.json` lleva `servidor.puerto: 25568`, `version: '26.1'`, `rcon` y la bandera `asistente`.
- **Makefile**, con nombres en inglés: `user-server-download/start/stop/save/status`, `proxy-download/start/stop/ping`, `assistant` (Soma en modo órdenes en el mundo del usuario) y `smoke-26-3` (la puerta).
- **Puerta A0** (humo en el mundo del usuario, 1 sesión; la prueba es `entrenamiento/humo_26_3.py`, con `make smoke-26-3`). Todo esto tiene que pasar:
  - el bot sigue conectado ≥ 10 min sin `invalid_player_movement`;
  - camina 100 bloques con el navegador;
  - pica 10 bloques y pone 5;
  - **abre un cofre, deposita y saca**, que es el punto dudoso con Via;
  - fabrica en la mesa y duerme en la cama;
  - `make test` sigue pasando.
- **Criterio de abandono, escrito antes.** Si fallan los clics de ventana, se prueba hasta 6 h más con Paper 26.3 y el plugin ViaVersion. Si tampoco funciona, se pasa a las ramas `pc26_3` de PrismarineJS y se escribe una decisión nueva que sustituya a la de ViaProxy.

### A1 · Rol asistente, órdenes y memoria (`perfiles/v2/asistente.json`, `_etapas.json`, `bot/ordenes.js`, `bot/io.js`, `bot/memoria_persistente.js`, `bot/habilidades/{dormir,minar}.js`; fácil-media)
- **Rol.** Reglas: `{noche: 'dormir_en_base', y_min: -59, cofre: 'base', cama: 'fija'}`.
  - Etapa `base`: campamento y cofre registrados.
  - Etapa `servicio`: es un bucle. Si hay huerto o corral marcados, lanza `rutina_granja`; si no, se queda quieto en la base.
  - `capataz.olvidarSiMurio` no borra la base.
- **Memoria.** `memoria_persistente.activo()` lee la bandera del mundo en vez de su nombre. `anotarMuerte` rellena `causa` con el mensaje de muerte y guarda el `inventario` (nombres y cantidades) en el momento de morir.
- **Cama.** Con `cama: 'fija'`, `dormir.js` deja la cama puesta, así que el bot reaparece en la base. Es la mitigación principal de «morir es perderlo todo».
- **Minería.** En `minar.js`, `Y_MIN` sale de la bandera para el rol asistente. Las zonas vedadas siguen mandando.
- **Órdenes.** Entran en el parser y en `AYUDA`: `ve a`, `base aquí`, `recupera`, `cuida la granja`, `mina en` y `trae`. Las dos últimas contestan «aún no sé» hasta A2 y A3.
- **Puerta A1.**
  - `probar_perfiles_seco.js` sigue pasando.
  - La nueva `probar_asistente_seco.js` da 30/30 frases con el tipo esperado, y JS y Python validan el rol igual.
  - En el mundo, 10/10 órdenes `ve a` a puntos de 20-80 bloques acaban a ≤ 3 bloques.
  - Tras reiniciar el proceso, el bot recuerda la base, el cofre y la cama.

### A2 · Minar en un punto fijo (`bot/habilidades/minar_punto.js`; media)
- **Composición.** `ir_a_punto` → `cavar_escalera` hasta la Y pedida (ya existe en `escalera.js`) → bucle de `minar` en túnel de 1×2 con `iluminar` cada 8 bloques.
- **Cuándo vuelve:**
  - Con el inventario ≥ 80 % lleno (`reflejoGuardar` ya existe): `subir_a_superficie`, `depositar` en el cofre de la base, y vuelta al punto para seguir.
  - Si el pico se rompe: fabrica otro con lo que lleva, o vuelve a la base.
  - Con vida < 8 o hambre ≤ 6 actúan los reflejos.
  - De noche sigue bajo tierra, con el túnel iluminado.
- **Cuándo para:** con `quédate` o al llegar a N.
- Apunta el punto en `memoria.minas` y lo que ha traído en el diario (`anotarOrden`).
- **Puerta A2** (banco en 26.1.2 por RCON, con terreno fijo y `banco_k/` como molde). Son 5 ejecuciones de 30 min desde un punto a 40 bloques de la base, con pico de hierro:
  - ≥ 64 bloques útiles (piedra o menas) **depositados** en el cofre en ≥ 4/5;
  - 0 muertes;
  - reanuda tras depositar en 5/5.

  Humo en 26.3: 1 ejecución.

### A4 · Muerte y recuperación (`bot/habilidades/recuperar_objetos.js`; `io.js` al reaparecer; fácil-media)
- **Cuándo lo intenta.** Al reaparecer, solo si se cumplen tres condiciones:
  - la muerte es reciente, de menos de 4,5 min (los objetos desaparecen a los 5);
  - la causa no es lava, fuego ni vacío;
  - hay camino a pie de ≤ 150 bloques (`hayCamino`).

  Entonces va al sitio, recoge todo en radio 8 y vuelve a la base a `depositar`.
- **Un solo intento.** Aborta si hay ≥ 3 hostiles a ≤ 12 bloques o si la vida baja de 10, y en ese caso actúan los reflejos.
- **Avisa por chat**, por ejemplo «he muerto en X Y Z por caída; voy a recuperar» o «no lo intento: lava». Al acabar compara con el inventario guardado al morir y da la cuenta: «recuperé 38/41».
- **Puerta A4** (banco en 26.1.2). Las muertes se provocan por RCON: `give` de un inventario fijo, `tp` a 60 bloques y `kill`. Son 8 de día y 4 de noche:
  - recupera ≥ 80 % de los objetos en ≥ 6/8 de día y en ≥ 2/4 de noche;
  - **0 segundas muertes**;
  - en los 2 casos de lava no sale de la base.

### A3 · Expedición a cuevas profundas (`bot/habilidades/expedicion.js`, `cavar_tunel`; difícil, la fase más cara)
- **Orden `trae MINERAL [N]`.** Desde la base hace `cavar_escalera` hasta la Y objetivo. La tabla de alturas va en `expedicion.js`: hierro y≈16, cobre y≈48, redstone y≈-40, diamante y≈-58.
- **Minería en ramas.** Usa `cavar_tunel rumbo n`, pone antorchas cada 8 bloques y abre 2 ramas por lado. Va a cada mena que vea a ≤ 6 bloques con `ir_a_mena`. Usa los detectores de lava y agua que ya tiene `escalera.js`. Vuelve por la misma escalera (`subir_a_superficie`) y deposita.
- **Cuándo vuelve:** al cumplir N, al llenar el inventario o al gastar el pico sin tener repuesto.
- **Qué lleva.** Antes de salir saca del cofre (`sacar_del_cofre`) un pico de repuesto, 8 antorchas y comida.
- Reutiliza las etapas M2-M5 del Minero de `PLAN_F8_perfiles.md` y sus criterios. Contra las muertes, cuenta con A4 y la cama fija.
- **Puerta A3** (banco en 26.1.2). Son 5 expediciones de ≤ 40 min con pico de hierro:
  - ≥ 16 de hierro crudo depositados en ≥ 4/5;
  - ≥ 1 diamante en ≥ 2/5, que es solo informativo;
  - **0 muertes por lava**;
  - ≤ 1 muerte en total, y si la hay, A4 la recupera.

  Humo en 26.3: 1 expedición de hierro.

### A5 · Granja mínima (`bot/habilidades/{arar,sembrar,cosechar,criar,esquilar,recoger_huevos}.js`, `bot/rutinas.js`; media; va en paralelo con A3)
- **Zonas.** El usuario marca `HUERTO` y `CORRAL` con `!zona`. Usan un modo nuevo, `granja`, en `bot/zonas.js`: el bot puede pisar y trabajar ahí, pero no talar ni minar.
- **Cultivo.** `arar` (la azada ya se fabrica), `sembrar trigo` y `cosechar`, que lee `age=7` y resiembra al momento.
- **Animales:**
  - `criar ANIMAL` da trigo o semillas (`useOn`) a dos adultos del corral, con un **tope de 10 por especie**;
  - `esquilar`, con cizallas;
  - `recoger_huevos`.
- Todo lo cosechado va al cofre de la base.
- **`rutina_granja`** es el modo libre del rol. Cada 10 min de juego cosecha lo maduro y resiembra, cría si hay menos del tope, recoge huevos y lana, y deposita.
- **Puerta A5** (banco en 26.1.2; el trigo se madura con `setblock wheat[age=7]`, como en el banco G de F8):
  - cosecha 9/9 y resiembra 9/9 en 8/8;
  - ≥ 1 cría en ≥ 6/8;
  - nunca pasa del tope;
  - 20 min de `rutina_granja` sin atascos ni muertes en 8/8.

  Humo en 26.3: 1 ciclo.

### A6 · Red de zona gris (opcional)
Solo se abre si una puerta de A2 o A3 falla por decisiones de «cuándo volver» o «cuándo bajar», y lo tiene que mostrar una medida. Lleva cuatro piezas:
- un guion `bot/guion_asistente.js`, con su lote gemelo en Python;
- un simulador hermano de `entrenamiento/entorno_supervivencia.py`;
- DAgger con la receta de F7.4, que tarda 4-6 min de CPU;
- la misma puerta que falló, repetida con la red.

## Límite de uso (pedido del usuario, 2026-10-31)
Todo el trabajo de Claude en esta línea cabe en **≤ 5 % del cupo semanal**. Soma no usa Claude en ejecución.
- **Medida.** Claude Code no da el porcentaje a los scripts. Al empezar y al acabar cada sesión, el usuario mira `/usage`, y la diferencia se apunta en el diario del día: `uso F-asistente: +N % (acumulado semanal M %)`.
- **Corte.** Al llegar al 5 %, se para en el siguiente punto estable (pruebas en verde y commit) y se sigue la semana siguiente. Sin el dato, no se abre una fase nueva en esa sesión.
- **Para gastar poco:**
  - sin subagentes, trabajadores ni workflows;
  - sin sesiones de Alma;
  - bancos y pruebas de humo en segundo plano, sin sondeos;
  - leer solo los fragmentos necesarios.

## Coste total
≈ **10-12 sesiones con servidor** y 0 minutos de entrenamiento, salvo en A6. Con el límite del 5 %, el calendario es ≈ **una fase por semana**: A0 la semana del 2026-10-31 y el resto en 5-6 semanas más. Cada fase se para donde llegue y se anota la decisión del usuario.

## Riesgos
- **Via rompe los clics de ventana.** A0 lo mide primero, y el criterio de abandono y las alternativas están escritos.
- **El envoltorio de `tick_end` duplicaría el paquete** si una versión nueva de mineflayer lo manda sola. Al subir mineflayer se quita o se comprueba con `make smoke-26-3`.
- **Lava y acuíferos bajo y=10.** M2 de F8 ya lo marca como difícil. Por eso A3 es la última fase obligatoria y A4 va antes.
- **RAM con cliente, servidor, proxy y bot a la vez** en 15,9 GB. Se usan las ventanas A/B de F7, y el servidor del usuario va con `-Xmx2G`.
- **El corral se llena.** `criar` tiene un tope duro por especie.
- **La skill de voz `io-minecraft`** está fuera del repo, en el plugin narrador. Tiene rutas viejas y no conoce las órdenes nuevas. Queda pendiente del usuario y no entra en el roadmap.

## Ficheros (resumen)
- **Nuevos:**
  - servidor: `servidor/{descargar,arrancar,parar,guardar}.sh` y `servidor/proxy/{descargar,arrancar,parar}.sh`;
  - rol: `perfiles/v2/asistente.json`;
  - habilidades: `bot/habilidades/{ir_a_punto,minar_punto,expedicion,recuperar_objetos,arar,sembrar,cosechar,criar,esquilar,recoger_huevos}.js`;
  - pruebas y bancos: `bot/probar_asistente_seco.js` y `entrenamiento/experimentos_asistente.py`.
- **Tocados, siempre de forma aditiva:**
  - configuración: `bot/package.json`, `bot/mundo.js`, `mundos/usuario/mundo.json`, `Makefile`;
  - órdenes y control: `bot/ordenes.js`, `bot/io.js`, `bot/capataz.js`, `bot/rutinas.js`, `bot/zonas.js` (modo `granja`);
  - habilidades y memoria: `bot/habilidades/index.js`, `bot/habilidades/{dormir,minar,escalera}.js`, `bot/memoria_persistente.js`;
  - catálogo: `perfiles/v2/_etapas.json`.

## Preguntas que solo el usuario puede responder
- Respondidas el 2026-10-31: el asistente es **Soma**, el mundo 26.3 es **nuevo con semilla aleatoria** y servidor y proxy van **solo en 127.0.0.1**.
- Respondida el 2026-10-31 (fase P): los datos del mundo 1.21.11 se archivan y el mundo 26.3 empieza de cero, sin límites.
- ¿Las habilidades se nombran en español, como las existentes? El plan lo supone.
