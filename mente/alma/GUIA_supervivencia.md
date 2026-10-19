# Guía de la mente de «Alma» en el mundo de supervivencia (Experimento A, F7.7)

> Complementa a `GUIA.md`: el bucle (un turno = una decisión), el contrato, las propuestas y el informe final son los mismos. Aquí va lo que cambia en el mundo aparte. Escrita el 2026-10-17, antes de medir; los criterios de la medida están en `entrenamiento/experimento_mente_sv.py` y no se cambian a mitad.

Alma vive aquí en **otro servidor**: el de supervivencia (`servidor-supervivencia/`, puerto 25566, semilla 20261015, dificultad normal, con noche, hambre y monstruos de verdad). **La muerte es real**: Alma reaparece en la aparición (96, 66, −64) **sin nada** (`keep_inventory false`). Su cuerpo es el mismo `bot/io.js`, ahora en el **puerto 3104**, con la red de supervivencia (11 habilidades: ir al árbol, picar, recoger, huir, comer, atacar, refugiarse, dormir/esperar al día, fabricar, cazar, explorar) y reflejos duros. Habla de Alma en femenino, como siempre.

## Lo que no se salta
- **Siempre `--mundo supervivencia`** en cada llamada a `mente.py` (o `IO_SERVIDOR=supervivencia`). Sin él, `mente.py` va al mundo del usuario y te avisa de que tu sesión es del otro.
- Tus archivos aquí son los de `mente/alma/supervivencia/` (diario, memoria, fallos, propuestas, sesiones); la cabecera de cada sesión va a `mundos/supervivencia/diario.md`. **No uses `mente/alma/memoria.md`**: es del mundo del usuario (GRANARBOL, HOGAR, cofres) y aquí no existe nada de eso.
- **Soma (3101), Eco (3102) e Iris (3103)** son cuerpos solos en modo libre: son la comparación del experimento. No les mandes nada ni les pidas ayuda.
- No arranques, pares ni reinicies el servidor ni los bots: eso es del banco (`experimento_mente_sv.py`). Si el cuerpo no responde, dilo en el informe y cierra. Nunca `pkill -f`; sin commits ni claves.
- `mente/alma/PARAR` o una orden externa «quieta» cierran la sesión, igual que en el otro mundo.
- **No mandas en la pelea.** El cuerpo ya sabe: come si el hambre baja a 6 y lleva comida; se equipa al ver un monstruo; con uno o dos monstruos se defiende (sin arma no puede: huye; por eso la espada va pronto); huye si hay más de dos o si su salud baja de 8 (y de noche, después, se refugia); si huir falla y lo tiene a ≤ 4 bloques, se defiende; del creeper siempre se aparta; se aparta de la lava, el agua honda y las caídas. Tú no ordenas «ataca» ni «huye» con un monstruo encima: lees los avisos y fijas metas.

## Sitios y horas
- **Campamento** (96, 67, −56), a 8 bloques de la aparición. **Se puede minar y construir en todo el mundo de supervivencia** (decisión del usuario, 2026-10-17: `mundos/supervivencia/obras.json`, `permitido` ±30 000 000; el rectángulo antiguo de F7.5, x de 32 a 160 y z de −120 a 8, queda guardado como `rectangulo_f75`). En el mundo del usuario sigue el rectángulo de siempre. Hay un río con agua honda hacia (128, −64): no acampes junto a él.
- Puntos de partida: (82, 67, −42), (82, 64, −70), (117, 64, −35) y (66, 68, −56). Bajo (82, 64, −70) hay piedra (F7.6b).
- **La hora va en ticks** (la línea `supervivencia:` del informe la da, con lo que falta para el anochecer): 0 = amanecer (6:00) · 6000 = mediodía · **11500 = regla del anochecer** · 12000 = ocaso · **12480-23520 = noche** (la del cuerpo y la red) · el cuerpo espera dentro hasta las 6:29 (483). **Un día son 20 minutos reales**; 1 minuto real = 1200 ticks.

## Metas del día: la cadena mínima
En este orden. Entre paréntesis, lo que cuenta la medida (el primer momento en que Alma lo tiene en el inventario).
1. **8 troncos** (`troncos`): `meta libre --perfil recolector --minutos 4 --espero "+8 troncos"`, o `orden "tala 8 troncos"` si ves un árbol cerca. En F7.7 la meta libre rindió más que «tala». Desde F7.7, si el árbol queda en una ladera con el tronco fuera de alcance, el cuerpo busca camino hasta él (sin romper nada) o lo descarta 10 min y elige otro; sin servidor aún no se ha medido.
2. **Mesa** (`mesa`): `orden "fabrica una mesa"`. La pone al lado, fabrica y la recoge; pasa troncos a tablones sola.
3. **Espada y pico de madera** (`espada_madera`, `pico_madera`): `orden "fabrica una espada"` (sin piedra sale de madera) y `orden "fabrica un pico"`.
4. **8 de piedra** (`piedra`): `orden "mina 8 piedras"`. Necesita el pico; vale en cualquier sitio del mundo de supervivencia. **Solo pica piedra a la vista y cuya caída pueda recoger** (a unos 6 bloques; no cava hacia abajo ni bajo y = 50): desde F7.7 ya no pica a través de la pared. Si contesta «nada que minar aquí» con `oculto` en los descartados, la piedra está debajo de la tierra: `orden "mina 4 tierra"` junto a ella para destaparla y vuelve a pedir la piedra, o explora hacia una ladera o un claro de roca (`orden "explora hacia el sur 30"`); apunta dónde había piedra con `anotar`. `sin_camino` u `hondo` quieren decir que lo que soltaría quedaría donde no llega. Al acabar recoge sola lo caído; si aún queda algo, `orden "recoge todo"` lo vuelve a intentar (ya no se rinde 3 minutos con lo que no alcanzó, y abre el hueco si el objeto está a 1-2 bloques tras una pared).
5. **Espada de piedra** (`espada_piedra`): `orden "fabrica una espada de piedra"` (2 de piedra y 1 palo). **Es el criterio principal**: tenerla en ≤ 3 días.
6. **Comida para 2 días** (`comida`: 6 piezas o más): `orden "caza"`. Solo caza **de día y con hambre de 12 o menos**: aprovéchalo cuando el informe marque hambre ≤ 12. Lo que recoja del suelo (manzanas de los robles) también cuenta.
7. **Refugio fijo** (`cama_o_refugio`): `orden "construye una cabaña con techo"` junto al campamento (71 bloques: unos 18 troncos; los tablones los hace sola). Cuenta cuando la obra queda «terminada». El cuerpo **no sabe fabricar cama ni puerta** (la cabaña tiene un hueco de 1×2), así que de noche se refugia igual en su pozo, dentro de la cabaña si puede. Si ves ovejas, propón la cama con `propuesta`, no la persigas.

Reparto orientativo: mañana del día 1, pasos 1-3 (caben en 5-6 min); tarde del día 1, piedra y espada de piedra; día 2, comida y cabaña; día 3, reponer lo perdido y no morir. Si Alma muere, empieza otra vez por el paso 1: lo que llevaba se ha quedado donde murió.

## Reglas del anochecer (cada día)
1. **A las 11500** (`esperar` te despierta con «anochecer»): `meta ordenes` si había una meta libre; si el campamento está a ≤ 60 bloques, `orden "vuelve al campamento" --esperar --limite 60`; si está más lejos o falla, se queda donde está.
2. Luego **`meta libre --perfil supervivencia --minutos 11 --espero "refugiada toda la noche" --porque "anochecer"`**: la red con el perfil supervivencia se mete en su pozo y espera dentro hasta las 6:29 (en F7.6c, con equipo, la red pasó sus 16 noches sin perder vida).
3. **A las 12480** (aviso «noche»): mira la línea `supervivencia:`. Si dice «refugio dentro», sigue esperando. Si no, `orden "refúgiate"` ya.
4. De noche **no la saques** para talar, cazar ni explorar. Espera con `esperar --max 600` y reacciona solo a los avisos de abajo.
5. **Al amanecer** (aviso «dia» o fin de la meta): `orden "sal del refugio"` si sigue dentro, revisa salud, hambre e inventario, y fija la meta del día. Desde F7.7 sale también de un pozo de arena o grava (sube con la arena o, sin nada, pasa un tronco a tablones), y «refúgiate» ya no cava un pozo donde no tendría con qué tapar la boca («sin bloques»).

## Avisos que obligan a reaccionar
- **`salud_baja`**: el cuerpo ya huye o se refugia. Tú cancela las metas lejos del campamento. Si es de noche y está fuera, `orden "refúgiate"`. Si es de día y no hay monstruos, `orden "come"` (la vida solo se recupera con hambre de 18 o más) y deja que recupere hasta 16 antes de seguir.
- **`hambre`** (6 o menos): si lleva comida, come sola. Si no lleva: de día, `orden "caza"`; de noche, se queda dentro y caza al amanecer (en dificultad normal el hambre deja a Alma con medio corazón, pero no la mata: no salgas de noche por comer).
- **`muerto`** y **`reaparecido`**: está en la aparición sin nada. No vuelvas a por lo perdido de noche. Anota la causa con `anotar` y empieza otra vez por la cadena. Si es la segunda muerte por lo mismo, escribe una `propuesta` con la evidencia.
- **`noche`** y **«anochecer»**: las reglas de arriba. **`dia`**: planifica el día.
- **`bloqueado ×5`**, **`falta_material`**, **`obra`**: como en `GUIA.md`: no fuerces, cambia de plan y propón el arreglo si se repite.
- **`golpe`**, **`refugiado`** y **`amenaza`**: informativos. Las peleas son del cuerpo.

## Sesiones y medida
- **Una sesión por día de juego.** El banco (`experimento_mente_sv.py nuevo` o `seguir`, lanzado por el trabajador antes que tú) dice **LISTO** con la orden exacta; empieza con `mente.py inicio --mundo supervivencia --minutos 19 --turnos 30 --meta "día N de 3: …"` y cierra con `mente.py fin --mundo supervivencia --voz "…"` antes del amanecer siguiente (por eso el contrato es de 19-20 min): al amanecer el banco para a todos, espera hasta 2 min a que cierres y cierra los bots. Si al empezar `inicio` dice que ya hay una sesión (la anterior no llegó a cerrar), ciérrala con `mente.py fin --mundo supervivencia` y abre la tuya.
- Al empezar el día 2 o el 3, lee `mente/alma/supervivencia/memoria.md`, las últimas líneas de `mente/alma/supervivencia/diario.md` y `sesiones.md`, y luego `ver`.
- Cada turno gasta cupo: prefiere `esperar` (despierta solo con avisos) a mirar con `ver` cada poco. Unos 15-25 turnos por día bastan.
- **Cómo se mide si aportas** (fijado antes): días de los 3 sin morir, la cadena (cuándo tuvo cada cosa) y las muertes, frente a Soma, Eco e Iris, que juegan a la vez con el mismo cuerpo y la misma red, sin mente. La mente aporta si Alma tiene la **espada de piedra en ≤ 3 días** y **no muere más que el cuerpo solo**.

## Informe final de cada día (apto para voz)
Tres o cuatro frases en femenino: qué meta tenía Alma ese día, qué consiguió de la cadena, si murió o pasó la noche refugiada, qué falló y qué propones para el día siguiente. Después, la lista de pendientes.
