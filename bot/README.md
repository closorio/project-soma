# Bot de Ío en Minecraft · modos y órdenes (F4) · la mente de Alma (F6)

Cuatro personajes (Soma, Eco, Iris y Alma) en un proceso Mineflayer. Cada uno tiene su puerto de control local (solo 127.0.0.1) y oye el chat del juego.

> **Nombres (2026-10-15):** Io pasó a llamarse **Soma** (puerto 3001, el cuerpo que decide la red) y Claude pasó a ser **Alma** (puerto 3004, femenina, la gobierna una sesión de Claude Code). Eco e Iris no cambian. **Io = Soma, Claude = Alma**: los diarios, ejecuciones e informes anteriores conservan los nombres antiguos. En el chat y por el puerto, «Io, …» y «Claude, …» siguen valiendo como alias de Soma y Alma. Ío, el asistente de voz, sigue siendo Ío.
> En un servidor sin conexión el jugador sale del nombre: Soma y Alma son jugadores nuevos (sin el inventario ni la posición de Io y Claude) y su aspecto lo pone el juego según el nombre; no se puede elegir sin complementos.

## Arrancar

### Con make (desde la raíz del repo; `make` enseña todos los objetivos)
Hace falta `make` (`sudo apt install make`). El `Makefile` pone en el PATH el node de nvm y el Python del venv. Objetivos y
variables en inglés.
```
make install                                    # una vez: npm ci y entrenamiento/.venv con numpy
make server-start                               # server local 26.1.2 (127.0.0.1:25567); make server-stop al acabar
make casual BOTS="Soma Eco"                     # dos bots con el rol casual, en libre, en segundo plano (Soma 3001, Eco 3002)
make status-all BOTS="Soma Eco"                 # qué hace cada uno · make progress PORT=3002: etapa, lo que falta y lo hecho
make role PORT=3002 ROLE=speedrunner            # cambiar de rol en caliente (o por el chat: «Eco, rol speedrunner»)
make order PORT=3001 TEXT="vuelve al campamento"   # cualquier orden en lenguaje sencillo; make idle / make free
make bots-stop                                  # por su PID (nunca pkill)
make casual WORLD=companero BOTS=Soma           # al server del compañero (26.1.x, online-mode=false); antes: make partner-ping
```
Qué esperar del Casual (banco K, medidas 9-10):
- recorre solo sus etapas: madera → herramientas → piedra → carbón → hierro → pico de hierro (hacia el día 1 de juego, unos 20 min reales);
- la cama sale en 1 de cada 3 o 4 partidas: le cuesta cazar ovejas si está en la mina;
- la casa aún no la termina: falla en el tejado;
- muere de vez en cuando (agua, zombis, creepers) y, al morir, rehace las etapas de inventario.

El Speedrunner no se ha medido: llega hasta el hierro y el cubo; del Nether en adelante sus pasos están pendientes.

```
cd bot && node io.js Soma Eco:3002:cooperativo Iris:3003          # los tres, en modo órdenes (quietos)
node io.js Soma Eco:3002:cooperativo Iris:3003:recolector:libre     # Iris empieza en modo libre
IO_MODO=libre IO_DESPUES=libre node io.js Soma Eco:3002 Iris:3003   # todos en libre; al terminar una orden, vuelven a libre
node io.js Soma Eco:3002:cooperativo Iris:3003 Alma:3004            # los cuatro; Alma (puerto 3004) la gobierna la mente (abajo)
IO_BOTS=Soma,Eco,Iris node io.js Alma:3004                          # Alma sola, en otro proceso: los demás no cuentan como humanos
```
Formato de cada personaje: `NOMBRE[:PUERTO[:PERFIL[:MODO[:DECISOR[@RUTA]]]]]` (F8.0a: `DECISOR` es `red`, `guion` o `capataz`, y `@RUTA` su política; sin él, `IO_DECISOR` e `IO_POLITICA` como siempre; p. ej. `Eco:3002:supervivencia:libre:guion@../entrenamiento/politica_supervivencia_dagger3.json`). Sin argumentos arranca Soma en 3001. Puertos de siempre: Soma 3001, Eco 3002, Iris 3003 y Alma 3004. Se para con `kill PID` (nunca `pkill -f`): antes de salir apunta en el diario el tramo de modo libre en curso.

### Apuntar al mundo de supervivencia (servidor de pruebas aparte)
Por defecto todo va al mundo del usuario (`servidor/`, 25565). El mundo de pruebas para la supervivencia (noche, monstruos, daño) es `../servidor-supervivencia/`: puerto **25566**, RCON **25576** con clave propia, semilla **20261015**, dificultad normal (ver PLAN.md, «Mundo de supervivencia»).
```
servidor-supervivencia/arrancar.sh                                  # (desde mundo-simulado/) se niega con < 3 GB disponibles
cd bot && IO_SERVIDOR=supervivencia node io.js Prueba1:3101         # nombres y puertos de control propios (31xx)
curl -s "127.0.0.1:3101/?c=percibir"                                # entidades a ≤ 24 bloques: zombie@…, skeleton@…
python3 servidor-supervivencia/comprobar.py                        # la prueba entera con Prueba1 (responde, árboles, monstruos de noche)
python3 servidor/rcon.py --servidor supervivencia "time set night"  # o IO_SERVIDOR=supervivencia python3 …
servidor-supervivencia/guardar.sh; servidor-supervivencia/parar.sh  # parar.sh guarda y cierra por PID
```
- `IO_SERVIDOR=supervivencia` lleva el bot al 25566 y `servidor/rcon.py` (y con él las herramientas de `entrenamiento/`) al RCON 25576. Ajuste fino: `IO_HOST`, `IO_PORT_SERVIDOR` e `IO_VERSION` (bot); `IO_RCON_PUERTO`, `IO_RCON_CLAVE_ARCHIVO` e `IO_RCON_CLAVE` (RCON), o `rcon.py --servidor/--puerto/--clave-archivo`. Un valor desconocido de `IO_SERVIDOR` se niega (no cae al mundo del usuario).
- Datos por mundo (F7.0): `bot/mundo.js` y `entrenamiento/mundo.py` resuelven, a partir de `IO_SERVIDOR`, el puerto y los datos de `../mundos/<mundo>/` (`zonas.json`, `cofres.json`, `obras.json`, `diario.md`; en el de supervivencia también `mundo.json`, el de `preparar.py`, con un enlace desde `servidor-supervivencia/`). En `mundos/usuario/` son enlaces a los archivos de siempre (`../zonas.json`…, `../mente/diario.md`), que no se han movido; si faltara un enlace, el mundo del usuario vuelve a su archivo de siempre. El de supervivencia empieza vacío (sin zonas ni cofres; `obras.json` con `permitido: null` hasta que haya campamento) y escribe su diario en `mundos/supervivencia/diario.md` y su registro en `entrenamiento/ejecuciones/modos-supervivencia-AAAAMMDD.jsonl`. Los puntos de partida de `medir.py`, `medir_ejecutor.py` y `experimentos.py` salen de `mundo.py` (usuario: el arbolado 303,32; supervivencia: `mundo.json: puntos` o, mientras no los haya, el campamento o la aparición). `python3 entrenamiento/mundo.py` enseña lo que resuelve; `medir.py … --seco` escribe la serie de puntos sin servidor. Sin separar aún: `mente/alma/mente.py` (diario del cuerpo; F7.7).
### Apuntar al mundo local de F8 (26.1.2, servidor propio)
El banco de los perfiles reales (`PLAN_F8_perfiles.md`): `../servidor-local/`, Minecraft **26.1.2** en **25567**, RCON **25577**, semilla **20261024**, normal, `keep_inventory` y `spawn_phantoms` apagados. Usa el Java 25 del runtime de Minecraft (`~/.minecraft/runtime/java-runtime-epsilon`; otro con `IO_JAVA`).
```
servidor-local/descargar.sh                                         # la primera vez: jar con sha1 comprobado y server.properties con clave nueva
servidor-local/arrancar.sh                                          # se niega con < 3 GB disponibles; la primera vez prepara el mundo
cd bot && IO_SERVIDOR=local node io.js Soma:3001:recolector:libre:guion
IO_SERVIDOR=local python3 servidor-supervivencia/comprobar.py      # los bancos de supervivencia siguen a IO_SERVIDOR
python3 servidor/rcon.py --servidor local list
servidor-local/parar.sh
```
- Ojo en 26.1: `time query daytime` ya no existe (los relojes son «timelines»: `time query day` da los ticks del día, no el número de día); `time set N` sigue igual.
- Fuera del mundo del usuario cada personaje guarda su memoria en `mundos/<mundo>/memoria_<nombre>.json` (base, refugio, muertes; no viaja por git) y la recupera al arrancar.

### Apuntar al server del compañero (26.1, por wifi)
Desde el 2026-10-23 los bots también van al server Java de un compañero en la misma wifi: `IO_SERVIDOR=companero`. Host, puerto y versión salen de `mundos/companero/mundo.json` (`servidor: {host, puerto, version}`); `IO_HOST`, `IO_PORT_SERVIDOR` e `IO_VERSION` los sobreescriben. **mineflayer 4.39 (la última) llega hasta Minecraft 26.1 (protocolo 775); 26.2 y 26.3 no tienen soporte**: el server tiene que estar en **26.1.x** (26.1.2 es la última), o los bots no entran.
```
# 1. su IP local en mundos/companero/mundo.json → "servidor": {"host": "192.168.1.50", "puerto": 25565, "version": "26.1"}
cd bot && node -e "require('minecraft-protocol').ping({host:'192.168.1.50',port:25565},(e,r)=>console.log(e||r.version))"
#    → { name: '26.1.2', protocol: 775 }   (sin respuesta: IP o firewall; protocol ≠ 775: no está en 26.1)
IO_SERVIDOR=companero node io.js Soma Eco:3002:cooperativo Iris:3003 Alma:3004   # los cuatro, con sus puertos de siempre
IO_SERVIDOR=companero IO_POLITICA=../entrenamiento/politica_supervivencia_dagger3.json IO_MODO=libre node io.js Soma   # libre en un mundo con monstruos
curl -s "127.0.0.1:3001/?c=estado"; python3 mente/alma/mente.py --mundo companero ver     # Alma, puerto 3004
```
- **Lo que tiene que hacer el compañero:** server en 26.1.2; en `server.properties`, `online-mode=false` (los bots no tienen cuenta Microsoft; con `true` salen expulsados con «Failed to verify username»), `server-ip=` vacío, `server-port=25565`; dejar pasar TCP 25565 en su firewall (en Windows, el aviso de Java al arrancar el server); darte su IP local (`ipconfig` / `ip a`). Si tiene lista blanca: Soma, Eco, Iris, Alma y tu nombre.
- **Tu cliente:** en TLauncher instalar y elegir 26.1.x y entrar por «Multijugador → Dirección directa → IP:25565». Sin ViaProxy ni plugins.
- Como no es el mundo del usuario, van activas las reglas de supervivencia: reflejos (`reflejos [si|no]`), informes `hambre/golpe/noche/dia`, `minar` y `recoger` con las reglas de F7.7. Sin zonas ni cofres. Desde F8.0b/F8.1 el rectángulo de obras solo manda en el mundo del usuario: aquí `mina`, `construye`, el capataz de los roles (talar, minar, cavar escaleras, cazar, poner la mesa y el horno, levantar la cabaña), `refugiarse` y `salir_del_refugio` tocan cualquier sitio que no esté en `mundos/companero/zonas.json` (vacío). **Acordadlo antes con el compañero** o poned sus zonas protegidas en ese archivo. Diario en `mundos/companero/diario.md`, registro en `entrenamiento/ejecuciones/modos-companero-AAAAMMDD.jsonl`.
- Sin RCON todavía (`servidor/rcon.py` no está en este PC): las herramientas de `entrenamiento/` que mandan al servidor (`medir*.py`, `experimentos*.py`, `reponer_serie.py`) no sirven aquí hasta recrearlo y que el compañero active `enable-rcon`. `medir_carga.py` es solo para servidores locales.
- Si más adelante sube a 26.2/26.3: ViaProxy en este PC (`bind-address 127.0.0.1:25568`, `target-version 26.3`, `auth-method NONE`) o ViaVersion + ViaBackwards en Paper; los bots siguen con `version: 26.1`.

- Sentidos de supervivencia (F7.1, en seco): la orden `obs_sv [inicio [segundos=1200]]` da en JSON `{obs, datos}` las 47 entradas de `entrenamiento/entorno_supervivencia.py: OBS` (fuente única de nombres, orden y significado; `observacion.js: NOMBRES_SV` es su copia): hostil más cercano (distancia a ≤ 24 y tipo: zombi, esqueleto, araña, creeper u otro) y cuántos hay a ≤ 16, hambre, comida que no hace daño, hora (seno y coseno) y luz (la del juego: de noche al aire libre 4/15), mejor arma, puntos de armadura, bloques para tapiarse, cama, refugio (distancia al último refugio o al campamento, y si está encerrado en 1×2), caída de más de 3, lava y agua honda a ≤ 3, y lo de siempre sin las 4 del compañero (se queda `jugador_dist`), con las 11 acciones de supervivencia en `previa_*` y 5 pesos de perfil (el nuevo, `supervivencia`, vale 0,5/5 hasta que F7.3 lo ponga en `perfiles/`). `obs` (las 25 de la red actual) no cambia. Eventos nuevos en el informe, solo fuera del mundo del usuario: `hambre` (≤ 6), `golpe` (de quién, a qué distancia, cuántos seguidos y la salud que queda), `noche` y `dia`, `refugiado` y `reaparecido`. Prueba en seco: `node bot/probar_sentidos_seco.js` (nombres frente a Python, 17 escenarios y los eventos). Calibrado con el servidor de supervivencia (`servidor-supervivencia/probar_sentidos.py`, 10/10, 2026-10-15): la luz se lee en la casilla x XOR 14 de su trozo (prismarine-chunk 1.41 la guarda así) y, encerrado, no cuenta la del cielo (el servidor no manda los cambios de luz de los trozos que el bot ya tiene: un techo o una antorcha puestos después no se ven).

- Habilidades de supervivencia (F7.2, `habilidades/{comer,atacar,refugiarse,salir_del_refugio,dormir,fabricar,equipar,apartarse,recoger_comida}.js`, utilidades en `habilidades/sv.js`; por el puerto `hab NOMBRE …` o `NOMBRE …`): `comer [mínimo=14]` (la mejor comida que no hace daño, la cruda solo si no hay otra; vuelve a la mano el arma) · `atacar [tipo|id:N|-] [segundos=20]` (con la mejor arma, golpes con la barra llena; se niega con un creeper —se aparta—, con salud < 8, con más de 2 hostiles o sin arma) · `refugiarse [auto|tapiar|cavar]` (cava un pozo de 3 y tapa la boca con 1 bloque, o se tapia con bloques donde falten —10 en llano—; nunca junto a agua, lava, huecos o cuevas, ni con un hostil a ≤ 4; guarda el refugio en la memoria) · `salir_del_refugio` (del pozo sube poniendo bloques debajo) · `dormir` (con cama la pone, duerme y la recoge; si no, dentro del refugio espera al día) y `esperar_al_dia` (encerrado hasta las 6:29, comiendo si hace falta; desde F7.6 vale ya desde el atardecer, 11040 ticks, como el simulador) · `fabricar [OBJETO|-]` (tablones, palos, mesa, espada/pico/hacha de madera o piedra, antorcha; sin objeto, la cadena de `siguiente_fabricacion()` del simulador; pone la mesa y la recoge) · `equipar [arma|armadura|todo]` · `apartarse` (de lava, caída > 3 o agua honda a ≤ 3, a 4-7 bloques) · `recoger_comida` (de día y con hambre ≤ 12: comida del suelo o caza). En el mundo del usuario solo pican o ponen bloques dentro del rectángulo de obras. Reflejos de supervivencia (`reflejos.js`; interruptor `reflejos [si|no]`, por defecto sí fuera del mundo del usuario y no en él, `IO_REFLEJOS` lo fuerza), tras cada habilidad, cada 2 s en reposo y en cuanto le golpea un monstruo: creeper a ≤ 6 → huir de él; golpe de un monstruo → huir si hay más de 2 hostiles a la vista, salud < 8 o no lleva arma (de noche, después refugiarse), si no defenderse (atacar a quien le golpeó) — la regla del usuario; el daño que no es de un monstruo no cuenta; salud < 8 con un hostil a ≤ 8 → huir; si huir falla y un hostil sigue a ≤ 4 → defenderse (acorralado); lava, caída o agua honda → apartarse; hambre ≤ 6 → comer; un hostil a la vista → equipar. Fuera del mundo del usuario la amenaza y un golpe cortan solo la habilidad (no el bucle libre ni la orden), no cortan atacar, huir, refugiarse, apartarse ni equipar, ni nada dentro del refugio. Órdenes: come, ataca [al zombi], refúgiate (tápiate, cava un refugio), sal del refugio, duerme / espera al día, fabrica [una espada de piedra], equípate, apártate, caza. Pruebas: `node bot/probar_habilidades_sv_seco.js` (en seco) y `servidor-supervivencia/probar_supervivencia.py` (en el mundo de supervivencia; escribe `entrenamiento/habilidades_medidas_sv.json`).
- Ejecutor de supervivencia del modo libre (F7.5, `libre.js`): la política dice qué observación quiere (`red.observacion()`). Con la del mundo del usuario (`politica_habilidades.json`, 25 entradas) todo es como antes: `observar`, los mismos argumentos y tramos de 5 min. Con una de supervivencia (`IO_POLITICA=…/politica_supervivencia_dagger.json`, 47 entradas) observa con `observarSv`, usa los argumentos de las 11 acciones (`fabricar` sin objeto: la cadena de `siguiente_fabricacion()`), los tramos duran un día de Minecraft (1200 s, como el episodio del simulador) y, dentro del refugio, sale antes si la habilidad elegida haría algo fuera (`_necesita_salir()` del simulador). Los bloques que cambian `refugiarse` y `salir_del_refugio` van al registro del bot (`[terreno] {…}`) para reponerlos. Prueba en seco: `node bot/probar_libre_seco.js` (repite las decisiones registradas del mundo del usuario y la parte de supervivencia). Una noche de verdad en el mundo aparte: `servidor-supervivencia/probar_noche.py`. F7.6: con `IO_DECISOR=guion` (y una política de 47 entradas) decide el guion de supervivencia (`guion_sv.js`, copia exacta de `guion_sv_lote`; prueba en seco `node bot/probar_guion_sv_seco.js`) en vez de la red; la matriz de F7.6 (red, guion, red vieja y quieto a la vez, en los 4 puntos) es `entrenamiento/experimentos_sv.py`.
- F7.6b (decisión del usuario: tras huir, refugiarse y recuperar vida): `huir` detecta el atasco (menos de 1 bloque en 1 s: la física de mineflayer le dejaba colgado contra un escalón de 1 bloque mientras los zombis pegaban), se despega, prueba otro rumbo (primero de lado) y a la tercera falla «atascado» (el cuerpo, si le acorralan, se defiende); `refugiarse`, junto al agua y si a ≤ 4 no vale nada, busca un sitio seco a ≤ 10 bloques (nadando; donde cava, la misma comprobación de líquidos de siempre); `dormir`/`esperar_al_dia` dentro del refugio espera además hasta que sea seguro salir (vida ≥ 16 o no puede curarse, ningún hostil a ≤ 8; come hasta 18 para curarse; de día, como mucho 120 s). El guion (`guion_sv.js`) sigue la regla del usuario en todos los perfiles y se refugia tras huir.

- F7.7 (arreglos del cuerpo tras la medición de la mente, solo fuera del mundo del usuario; allí todo sigue igual): `minar` ya no pica a través de la pared (solo bloques con una cara al aire que se ven desde el ojo; lo que suelten no puede caer más de 3 bloques y tiene que haber camino a pie hasta un sitio desde el que se pica y se recoge, o un hoyo de 1 abierto por arriba); `recoger` olvida los inalcanzados al minuto, la orden «recoge» (`otra_vez`) los vuelve a intentar todos y, con un objeto a ≤ 2 bloques al que no llega andando, lo intenta otra vez pudiendo picar solo alrededor de él (a `obras.json`, como lo minado); `refugiarse` no cava donde no tendría con qué tapar la boca (arena o grava sin otros bloques: «sin bloques para tapar»); `salir_del_refugio` sube el pozo también con arena o grava y, sin nada, pasa un tronco a tablones; `ir_a_arbol`, si el árbol queda «enfrente» con el tronco fuera de alcance (laderas), va con el navegador a donde lo alcance o marca la columna y falla «tronco fuera de alcance». Prueba en seco: `node bot/probar_cuerpo_f77_seco.js` (16 comprobaciones). Sin arreglar: «sin suelo seco» de `explorar` y «vuelve al campamento» junto al río (ver el informe de F7.7).

## Perfiles v1 = estilos; perfiles v2 = roles (F8)
Hoy un perfil (`perfiles/*.json`: recolector, constructor, cooperativo, supervivencia, explorador) son 5 pesos que cambian cómo decide la red; `perfil X` lo cambia en caliente. En F8 esos perfiles pasan a ser **estilos** de rutinas (`rutina_madera`, `rutina_noche`…), y aparecen los **roles** (`perfiles/v2/<rol>.json`): Casual, Speedrunner, Redstoner, Builder y, de apoyo, Granjero, Minero y Explorador. Cada rol es una cadena de etapas que lleva un capataz sin tokens, con una red pequeña para la zona gris. Desde F8.0b el cuerpo sabe además: `fabricar OBJETO [n]` con cualquier receta del juego (cama, cubo, cofre, horno, `pico_hierro`, `armadura_hierro`…), `fundir ENTRADA [n] [combustible]` (hierro, oro, cobre, arena, piedra, carne…; pone o fabrica el horno), `poner BLOQUE [x y z]`, `sacar_del_cofre OBJETO [n]`, `iluminar [radio]`, `cavar_escalera [y] [rumbo]` (para con lava o agua junto al escalón), `subir_a_superficie`, `desatascarse`, `cazar ANIMAL [n]`, `recoger_agua` y `verter agua|lava [x y z]`. Por el chat: «funde 5 de hierro», «cocina la carne», «fabrica una cama», «pon el cofre», «saca 10 troncos», «ilumina», «baja 12» o «cava una escalera hasta y=-20 hacia el norte», «sube a la superficie», «desatáscate», «caza 3 ovejas», «recoge agua», «vierte el agua». Fuera del mundo del usuario, `explorar` cava si no hay camino a pie, nada si hay agua y se desatasca en túneles cerrados. Bancos: `IO_SERVIDOR=local python3 servidor-supervivencia/probar_supervivencia.py --solo f8` y `servidor-supervivencia/probar_explorar.py`.
Desde F8.0a ya hay: los roles `casual` y `speedrunner` en `perfiles/v2/` (se validan con `node bot/probar_perfiles_seco.js`), las rutinas `rutina_madera [N] [max_s]` y `rutina_noche [max_s]` (por el puerto, como una habilidad: `curl "127.0.0.1:3001/?c=rutina_madera 6 300"`) y la orden `decisor red|guion` (chat) o `decisor X [RUTA]` (puerto). El capataz que recorre las etapas llega en F8.1. Plan: **`PLAN_F8_perfiles.md`**; los perfiles v1 siguen funcionando igual (ver `perfiles/README.md`).

## La mente de Alma (F6)

«Alma» (antes «Claude») es un personaje femenino como los demás (misma red, mismas habilidades, mismo reflejo del cofre; habla de sí en femenino), pero la gobierna una sesión de Claude Code: la **mente**. Es la que se usa en los experimentos en que un agente Claude actúa directamente en el mundo. La mente no manda cada paso: fija metas (`perfil X` + `modo libre` durante N min, u órdenes concretas), lee el informe del cuerpo y aprende de los fallos. Todo lo mecánico lo hace `mente/alma/mente.py`; la guía de la mente es `mente/alma/GUIA.md`; su memoria vive en `mente/alma/` (hasta el 2026-10-15, `mente/claude/`).
- **Informe cuerpo → mente**: `curl -s "127.0.0.1:3004/?c=resumen"` (JSON): lo hecho desde la última lectura (órdenes, tramos libres con sus decisiones agrupadas, troncos ganados, viajes al cofre, éxitos y fallos por habilidad), los fallos agrupados por causa, los eventos (amenaza, bloqueado, agua, cofres llenos, muerto, salud baja, orden externa, desconectado, reconectado, modo) y lo que hay ahora (posición, salud, hambre, hora, inventario agrupado, árbol, jugador, amenaza, compañero, cofre, campamento). `resumen todo` no corta por la última lectura.
- Las peticiones de la mente llevan `&de=mente`; una orden de cualquier otro (chat, Ío) aparece en el informe como `orden_externa`, y la mente no la pisa.
- `campamento [aqui|x y z|-]`: el punto al que vuelve «vuelve al campamento» (la mente lo fija al empezar la sesión).
- Sesión típica (la lanza Ío como trabajador con contrato, o una sesión interactiva): `mente.py inicio --minutos 45 --turnos 30 --meta "…"` → `ver` → `meta libre --perfil recolector --minutos 5` / `orden "…"` → `esperar` → `anotar` → `fin`. Para pararla: crear `mente/alma/PARAR` o decir «Alma, quédate».

### Órdenes nuevas (F6): explorar, minar, construir
Solo dentro del **rectángulo de obras** de `obras.json` (`permitido`), acordado con el usuario y fuera del arbolado de pruebas, de las zonas y de los cofres; sin él, minar y construir se niegan. En el mundo de supervivencia, desde el 2026-10-17, `permitido` es todo el mundo (±30 000 000; el rectángulo de F7.5 queda en `rectangulo_f75`): allí se mina y se construye en cualquier sitio que no esté protegido.
| Orden | Qué hace |
|---|---|
| `explora [hacia el norte] [N] [nadando]` | se aleja N bloques (40; ≤ 120) en ese rumbo (o al azar, lejos del campamento) por tramos de 12, sin romper ni poner nada, sin pisar zonas vedadas ni agua (si se moja, vuelve a la última casilla seca); con «nadando» (o «a nado», «cruzando») vadea y nada, y solo vuelve si se queda sin aire; cuenta troncos, agua, minerales, animales y jugadores a la vista |
| `vuelve al campamento` · `campamento aquí` | volver al campamento · fijarlo donde está |
| `mina N piedras` (tierra, arena, grava, carbón, mineral…) | pica hasta N bloques (≤ 32) de ese tipo al alcance, dentro del rectángulo de obras; nunca troncos, cofres, bloques de una obra, bajo los pies, con agua o lava al lado, con arena o grava encima ni por debajo de y = 50; con la herramienta que más rinda (sin pico no pica piedra); apunta cada bloque en `obras.json`. Fuera del mundo del usuario (F7.7), además, solo lo que se ve y cuya caída puede recoger (descartados `oculto`, `hondo`, `sin_camino`) y recoge al final hasta 4 veces |
| `construye una cabaña` (`con techo`, `un muro`, `un pilar`, `una plataforma`) [`aquí`] | elige una parcela llana (o la de al lado con «aquí»), hace el presupuesto, fabrica tablones de los troncos que lleve (1 → 4, sin mesa) y, si alcanza, coloca el plano capa a capa desde fuera; cada bloque queda en `obras.json`. Si falta material lo dice antes de poner nada |
| `deshaz la cabaña` (el muro…) | rompe solo los bloques que puso esa obra (si siguen siendo los mismos), en orden inverso, y recoge lo caído |
Habilidades por el puerto: `explorar [rumbo|-|volver] [bloques] [segundos] [nadando]`, `minar [bloque] [n] [radio] [y=50] [forzar]`, `construir PLANO [x z] [materia] [nombre=…]`, `deshacer OBRA`. Planos: `bot/planos.js` (pilar 3, muro 10, plataforma 9, cabana 46, cabana_techada 71 bloques).

## Los dos modos

- **Modo órdenes** (por defecto): quieto hasta que se le pide algo; hace la orden y, al terminar, **se queda quieto** o **vuelve a modo libre**, según el ajuste «al terminar» (por defecto, quieto).
- **Modo libre**: decide solo con la red (`entrenamiento/politica_habilidades.json`, la misma inferencia que `ejecutor.py`) según su perfil: observa, elige una habilidad, la hace y vuelve a mirar (≥ 1 s por decisión; 5 s si lleva cinco seguidas sin nada que hacer). Va por tramos de 5 minutos.
- Cualquier orden con acción (ven, tala…) saca al personaje del modo libre. Las órdenes de consulta (estado, ayuda) no lo interrumpen.
- Las órdenes directas del puerto de siempre (`hab`, `cerebro`, `talar`, `ir`, `ven`, `para`…) también lo pasan a modo órdenes: el ejecutor y las mediciones funcionan igual que antes.

## Órdenes en lenguaje sencillo

Por el **chat del juego**, empezando por el nombre: `Soma, ven` · `Eco, tala 5 troncos` · `Alma, quédate` · `todos, quietos` (`Io, …` y `Claude, …` aún valen como alias). Sin nombre no hacen caso (para no confundir la conversación normal). Responden por el chat.

Por el **puerto** (así las manda Ío, el asistente de voz), el mismo texto, con o sin nombre:
```
curl -s "127.0.0.1:3001/?c=orden%20tala%205%20troncos"              # a Soma (su puerto); responde al aceptarla
curl -s "127.0.0.1:3001/?c=orden%20Eco%2C%20ven"                    # por el puerto de Soma, para Eco
curl -s "127.0.0.1:3001/?c=orden%20todos%2C%20modo%20libre"         # a todos los de ese proceso
curl -s "127.0.0.1:3002/?c=orden_esperar%20guarda%20en%20el%20cofre" # responde al terminar
curl -s "127.0.0.1:3001/?c=modo"                                    # estado del modo en JSON
curl -s "127.0.0.1:3001/?c=modo%20libre%20despues%20quieto"         # interruptor directo
```
`orden` contesta enseguida («Voy a talar 5 troncos.») y la orden sigue en marcha; el resultado sale por el chat, en `modo` («ultima») y en el diario. `orden_esperar` contesta con el resultado.

| Orden (ejemplos) | Qué hace |
|---|---|
| `ven`, `ven aquí`, `acércate` | va hasta quien habla (por el puerto, el jugador humano más cercano) y para a ≤ 3 bloques |
| `sígueme`, `ven conmigo` | le sigue hasta otra orden (máx. 10 min) |
| `quédate`, `quieto`, `para`, `espera` | deja lo que hace y se queda quieto (en modo órdenes) |
| `tala N troncos` (`tala cinco troncos`) | consigue N troncos más (sin número, 1; máx. 64) |
| `recoge` / `recoge todo` | recoge troncos caídos a ≤ 8 bloques / cualquier objeto |
| `guarda en el cofre` | guarda lo recogido en los cofres de `cofres.json` (conserva comida y herramientas) |
| `huye`, `huye de X` | se aleja 16 bloques del hostil más cercano o de X (jugador o bicho: zombi, esqueleto…) |
| `modo libre` / `modo órdenes` | el interruptor |
| `al terminar quieto` / `al terminar vuelve a libre` | qué hace al acabar cada orden |
| `perfil cooperativo` | cambia el perfil (recolector, cooperativo, supervivencia, constructor, explorador) |
| `estado` | modo, qué hace, salud, troncos encima, posición y última orden |
| `ayuda` | lista de órdenes |

Admite «por favor», plurales e infinitivos (`talad`, `quedaos`, `huir`) y no distingue tildes ni mayúsculas.

## Seguridad (lo que ya respetan todas las órdenes)

- Zonas protegidas (`zonas.json`: GRANARBOL, ESTANQUE, HOGAR) y árboles marcados: no talan nada protegido; si lo más cercano está protegido, lo dicen («No talo en HOGAR: es zona protegida») y talan fuera. No pisan las zonas vedadas: si el jugador está dentro, `ven` y `sígueme` esperan en el borde; `huye` no huye hacia dentro y `recoge` no recoge lo caído dentro.
- El navegador nunca rompe troncos ni cofres; las órdenes andan sin romper ni poner bloques.
- Límites: tala ≤ 64 troncos, ≤ N + 2 picados, 60 s + 30 s por tronco (máx. 10 min) y 4 fallos seguidos; sígueme ≤ 10 min; ven ≤ 60 s.
- Los personajes no se dan órdenes entre ellos (solo atienden a jugadores humanos y al puerto).

## Registro (para comparar los dos modos)

- `mente/diario.md`: una cabecera por sesión del bot, una línea por orden (hora, personaje, modo y si cambió, orden, quién y por dónde, ✓/✗ y resultado, segundos, pasos y qué hace al terminar) y una por tramo de modo libre (troncos ganados, decisiones en secuencia, viajes al cofre y por qué acabó).
- `entrenamiento/ejecuciones/modos-AAAAMMDD.jsonl`: cada decisión de la red (observación de 25 valores, valores Q, resultado), cada orden con sus pasos y cada tramo.
