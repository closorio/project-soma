# Plan · Perfiles reales de juego (Experimento A, F8)

> Plan diseñado el 2026-10-23 en la sesión «Bots Minecraft Java version»; la sesión se cortó antes de guardarlo y se pasó al repo el 2026-10-24, con el mismo contenido. Lo ejecutan trabajadores con Opus, una fase cada uno; los criterios de cada fase están fijados aquí antes de medir. Este documento no implementa nada.

## Contexto
El usuario (2026-10-23) pide un roadmap de construcción, entrenamiento y evaluación para **perfiles reales de juego**, dejando los perfiles actuales (recolector, cooperativo, explorador, constructor, supervivencia) como **skills**:
- **Redstoner**: busca hierro y redstone para construir cosas técnicas.
- **Speedrunner**: pasarse el juego lo más rápido posible.
- **Casual**: aventura estándar, progresión natural.
- **Builder**: edificios, casas, espacios, granjas.
- De apoyo (los eligió el usuario): **Granjero** (comida, animales, cultivos), **Minero** (cuevas, minerales, carbón) y **Explorador/Cartógrafo** (estructuras, mapa). Ayudan a los 4 base.

**Lo que hay hoy.** Un perfil son 5 pesos (`perfiles/*.json`, divididos por `perfiles/_escala.json`) que entran en la observación de la red y en la recompensa del simulador; `identidad` y `metas` no las lee nadie. Hay 20 habilidades con contrato `{exito, causa, ms}` (`bot/habilidades/index.js`), reflejos duros (`bot/reflejos.js`) y un guion de supervivencia (`bot/guion_sv.js` ↔ `guion_sv_lote`) clonado por DAgger en 4-6 min de CPU (`entrenamiento/entrenar_supervivencia_dagger.py`, fidelidad ≥ 95 %). **El cuerpo llega hasta la piedra**: no hay horno, hierro, carbón útil, cama/cofre/puerta fabricables, sacar del cofre, minería profunda (`Y_MIN = 50` en `bot/habilidades/minar.js`), cubo, portal, Nether, End, redstone ni cultivos. No hay planificador sin Claude ni memoria persistente. Toda la evaluación repetible (`experimentos_sv.py`, `experimento_mente_sv.py`, `probar_supervivencia.py`) va por RCON.

**Dos hallazgos que condicionan el orden:**
1. En minecraft-data 26.1, ghast, slime, phantom, magma_cube, shulker y ender_dragon son de tipo `mob`, así que `hostiles()` no los ve (filtra `type === 'hostile'`). Al revés, enderman, piglin y zombified_piglin son `hostile` aunque sean neutrales: el bot huiría de cualquier piglin. Antes del Nether hace falta una taxonomía por nombre.
2. El 23-10, en el server del compañero, `explorar` falló 180 veces seguidas «sin suelo seco» en montaña, Alma pasó dos días en un túnel cerrado y Eco se ahogó. La navegación robusta (E0) es la primera puerta de todos los perfiles.

## Respuesta corta
Un perfil real es **una cadena de etapas con un objetivo medible cada una**, no un juego de pesos. El cuerpo actual se queda en la piedra, así que el trabajo es, por este orden: (1) un servidor propio 26.1.2 con RCON para medir; (2) las habilidades de la fundación común (carbón, horno, hierro, cama, cofre, cubo) y una navegación que no se atasque; (3) un **capataz** que lea las etapas del rol y elija el siguiente paso sin tokens; (4) una red pequeña que decida solo la **zona gris** (cuándo seguir, volver, abastecerse, bajar o pelear), clonada del guion por DAgger, como en F7.4. Casual es el primer rol completo porque recorre toda la fundación. Speedrunner es el último: el Nether y el End son lo más caro y lo más incierto.

## Decisiones del usuario (2026-10-23)
1. El roadmap llega **hasta el dragón**, por etapas con criterio medible; se ejecuta por fases y se para donde se llegue.
2. **La progresión la lleva un guion determinista por rol en JS (sin tokens); la red entrenada decide la zona gris.** Alma/Claude queda fuera del bucle: evalúa y propone.
3. La evaluación repetible se hace en un **servidor local propio** (recrear `servidor/` con 26.1.2 y RCON, y escribir `servidor/rcon.py`, que no está en disco). El server del compañero (`mundos/companero/`, sin RCON) es solo para jugar.
4. Los perfiles de apoyo son Granjero, Minero y Explorador/Cartógrafo.

## Restricciones que condicionan el plan
- **Versión**: mineflayer 4.39 llega hasta 26.1 (protocolo 775). El servidor local se monta en **26.1.2**, no en 26.2+.
- **RCON**: todos los bancos lo necesitan (`tp`, `give`, `clear`, `time set`, `setblock`, `fill`, `execute if block`, `summon`). Un solo lector por servidor, con cerrojo (pendiente h de F5).
- **RAM**: se aplica el procedimiento de `PLAN_F7_supervivencia.md` (ventanas A/B, nunca dos servidores con el cliente abierto, `-Xmx1536M`, parada si `MemAvailable` < 800 MB).
- **Mundo del usuario**: sus reglas no cambian (`Y_MIN` duro en `minar.js`, zonas protegidas). Lo nuevo (minería profunda, obras, mecanismos) solo corre fuera de él.
- **F2-F7 no cambian de comportamiento**: `perfiles/*.json` v1, `politica_*.json`, `guion_sv.js`, `reflejos.js`, `experimentos*.py` y `servidor-supervivencia/` quedan intactos o reciben solo cambios aditivos.
- Sin claves de API ni tokens en el bucle; trabajadores con Opus, criterios fijados antes de medir.

## Arquitectura: tres capas, tres relojes
- **Reflejos** (ms, `bot/reflejos.js`): intactos.
- **Rutinas** (segundos-minutos, nuevo `bot/rutinas.js`). Los perfiles v1 pasan a ser **estilos** de rutinas acotadas por objetivo y tiempo:
  - `rutina_madera N [max_s]`: estilo recolector, con el guion de F3 portado a JS en el nuevo `bot/guion_f3.js` ↔ `guion_lote`.
  - `rutina_noche`: estilo supervivencia, con `guion_sv.js`.
  - `rutina_acompanar`.
  - `rutina_reconocer`: `explorar` tres veces y anotar en el mapa.
  - `rutina_obra`: `construir` con presupuesto.

  El decisor interno es el guion por defecto (determinista y medible); con `red` se mantienen los experimentos de F5 y F7. `observacion.conPerfil()` pone el estilo y lo restaura al salir. `io.js ejecutarHabilidad` enruta los `rutina_*` sin pasar por el corte por amenaza de `index.js`.
- **Progresión** (minutos-días, nuevo `bot/capataz.js`). Un guion genérico lee las **etapas** de `perfiles/v2/<rol>.json` (catálogo común `perfiles/v2/_etapas.json`) y guarda la etapa actual en la memoria persistente. Elige el siguiente paso `hacer` (habilidad o rutina) y cede a `rutina_noche` según `reglas.noche` del rol. Los ganchos por rol (`bot/guiones/<rol>.js`) solo se escriben si el JSON no alcanza, p. ej. el redstoner y su «≤ 16 con antorchas». Las órdenes de chat interrumpen como en F4 (`tarea.cancelada`) y el capataz retoma la etapa al volver a libre.
- **Zona gris (la red)**: dentro de un tramo, decide *cuándo seguir, parar, volver, abastecerse, bajar, subir o pelear*.
  - Observación `obs_jornada` = `obs_sv` (47) + 10 entradas: `etapa_lista, dist_campamento, inventario_lleno, herramienta_gastada, antorchas_inv, profundidad, lava_vista, cofre_dist, pedido_pendiente, materiales_restantes`.
  - Acciones: las 11 de SV + 6 (`seguir_tarea, volver_al_campamento, abastecer, bajar, subir, iluminar`). Red **57→64→64→17**.
  - Piezas: guion de zona gris `bot/guion_jornada.js` ↔ `guion_jornada_lote` (solo lee el vector, así que se puede clonar); simulador `entrenamiento/entorno_jornada.py` (hermano de `entorno_supervivencia.py`, calibrado con `habilidades_medidas*.json` y `rutinas_medidas.json`); entrenador `entrenar_jornada_dagger.py` (receta de F7.4).
  - Una red compartida por los 7 roles; solo se abre una por rol si alguno baja del 95 % de fidelidad.
- **Decisores por personaje** (nuevo `bot/decisores.js`; hoy `IO_DECISOR` vale para todo el proceso): `red | guion | capataz`. Se eligen con un quinto campo de la CLI (`NOMBRE:PUERTO:ROL:MODO:DECISOR`) o con la orden `rol X`. `red.js` pasa a `Politica(ruta)` con caché y un tercer tipo `obs_jornada`; `red_numpy.configurar(no, na)` sustituye a sobreescribir las globales al importar.
- **Memoria persistente** (nuevo `bot/memoria_persistente.js`), con escritura atómica:
  - `mundos/<mundo>/memoria_<personaje>.json`: etapas, refugio, minas, muertes.
  - `mundos/<mundo>/base.json`: campamento, cofres por recurso, horno y mesa; lo escribe quien coloca.
  - `mundos/<mundo>/mapa.json`: puntos de agua, lava, vetas, animales y estructuras.
- **Equipo sin planificador central**. Funciona por estigmergia: los roles de apoyo mantienen `cofre_X ≥ N` y los base `sacan` de ahí. Se añade un protocolo mínimo bot a bot por chat (`!pide RECURSO N` / `!tengo`), que se atiende antes del filtro `esBot` por la misma vía que `!zona`. Los bots siguen sin darse órdenes en lenguaje natural.
- **Alma**: fuera del bucle. `mente.py evaluar` lee diarios, memorias y `ejecuciones/*.jsonl` y escribe `propuestas.md`; `meta rol --rol X` sirve para sesiones manuales.

### Perfil v2 (`perfiles/v2/<rol>.json`)
Esquema: `{v:2, nombre, identidad, sirve_a[], estilos{madera, noche}, pesos{madera, seguridad, tiempo, supervivencia, progreso, riesgo}, reglas{noche, y_min, cofre}, etapas[{id, pre, objetivo, hacer[], max_s, repetir}]}`. `objetivo` y `pre` son predicados sobre `progresion.estado(bot)` (inventario por categoría, memoria, hitos). La validación en seco se hace en JS y en Python (`bot/perfil_v2.js`, `entrenamiento/perfiles_v2.py`) y comprueba que el esquema es correcto, que cada `hacer` existe, que la cadena cierra (orden topológico sin ciclos) y que JS y Python dan lo mismo. Los v1 no se mueven, porque los leen `cargar_perfiles()` (un glob sin subcarpetas) y tres políticas entrenadas; solo ganan `"v":1, "rutina":"…"`. Ejemplo:

```json
{ "v": 2, "nombre": "speedrunner", "identidad": "Pasarse el juego lo antes posible; lo justo de cada cosa.",
  "sirve_a": [], "estilos": { "madera": "recolector", "noche": "supervivencia" },
  "pesos": { "madera": 0.5, "seguridad": 0.5, "tiempo": 0.01, "supervivencia": 0.5, "progreso": 5, "riesgo": 0.8 },
  "reglas": { "noche": "aprovechar_con_luz", "y_min": -59, "cofre": "no" },
  "etapas": [
    { "id": "madera",      "objetivo": { "inv": { "troncos": 6 } } },
    { "id": "herr_piedra", "pre": { "inv": { "troncos": 4 } }, "objetivo": { "inv": { "pico": 0.66, "espada": 1 } } },
    { "id": "hierro",      "objetivo": { "inv": { "hierro": 7 } }, "hacer": ["minar iron_ore", "fundir iron"], "max_s": 1800 },
    { "id": "portal",      "pre": { "inv": { "hierro": 3 } }, "objetivo": { "memoria": { "portal": true } } },
    { "id": "nether",      "objetivo": { "inv": { "blaze_rod": 7 } }, "hito": "nether" },
    { "id": "end",         "objetivo": { "hito": "dragon_muerto" } } ] }
```

## Árbol de etapas por rol
Dificultad: **fácil** (API directa de mineflayer, ≤ 1 día de trabajador), **media** (lógica propia, pruebas en arena), **difícil** (física, navegación o combate reales; varias sesiones), **investigación** (mineflayer no lo tiene resuelto: prototipo ≤ 6 h con criterio de abandono escrito antes y alternativa).

### Fundación común C0-C7 (todos)
| etapa | objetivo medible | habilidades nuevas | dificultad | nota |
|---|---|---|---|---|
| C0 cuerpo 26.1.2 | `probar_supervivencia.py` 13/13 con los criterios de F7.2 en 26.1.2; taxonomía por nombre (`hostil`, `neutral`, `ignorar`, `nunca_atacar`: creaking, creeper, ghast) | — (cambios en `sv.js`, `observacion.js`) | fácil | ghast/slime/phantom son `mob`; piglin/enderman, `hostile` |
| C1 madera → mesa → herramientas de madera | espada, pico y hacha de madera, y mesa | — (ya hay `fabricar`) | — | ya medido 10/10 |
| C2 piedra | herramientas de piedra, ≥ 8 cobblestone | — (`minar`, `fabricar`) | — | F7.7 lo consigue en ≤ 1 día |
| C3 carbón y antorchas | ≥ 8 carbón, ≥ 8 antorchas, 4 puestas | `iluminar [radio] → {puestas, luz_min}` | fácil-media | el servidor no manda cambios de luz al bot (F7.1): llevar un registro propio de las antorchas puestas |
| C4 horno y hierro | horno puesto, ≥ 7 lingotes, pico y espada de hierro | `fundir ENTRADA [n] [combustible]`, `cavar_escalera [y_meta] [rumbo]`, `subir_a_superficie`; `minar` con `y=` libre fuera del mundo del usuario | media (fundir) / **difícil** (escalera: lava y acuíferos bajo y=10, grava) | en 26.1 el hierro abunda en y 15-70: C4 no exige bajar de y=0 |
| C5 cama | cama en el inventario; `dormir` ✓ y reaparición fijada | `cazar ANIMAL [n]` (lana, carne); `fabricar cama` | fácil | la cama fija el respawn: es la mitigación principal de «muerte = perderlo todo» |
| C6 cofre, puerta, escalera | cofre puesto y registrado; sacar 1 pila | `poner BLOQUE [pos] → {pos, facing}`, `sacar_del_cofre OBJETO [n]`, `fabricar` **genérico** (cualquier receta de minecraft-data, con su cadena de ingredientes) | fácil / media | el navegador no abre puertas: `abrir_puerta` con `activateBlock` |
| C7 cubo y agua | cubo de hierro; `recoger_agua` y `verter` 10/10 | `recoger_agua`, `verter agua\|lava x y z` | media | base del portal del speedrunner y del cultivo con dispensador |

Fundación mínima para medir cualquier rol: **C1 → C3 → C4 → C5**. C6-C7 las necesitan Casual, Builder y Speedrunner.

### Casual K1-K6 (rol de referencia)
| etapa | objetivo medible | habilidades nuevas | dificultad |
|---|---|---|---|
| K1 = C1-C3 | herramientas de piedra y 8 antorchas antes del primer anochecer | — | — |
| K2 = C4-C5 | pico de hierro y cama en ≤ 2 días | — | — |
| K3 casa | plano `casa_basica` (cabaña techada con puerta, 2 antorchas, cofre y horno dentro); duerme dentro | `poner`, `abrir_puerta`; plano en `bot/planos.js` | fácil |
| K4 comida estable | ≥ 16 de comida cocinada en el cofre; el hambre nunca baja de 6 en 3 días | `cocinar` (= `fundir` carne) | fácil |
| K5 armadura | las 4 piezas de hierro puestas (24 lingotes) | — (`equipar` existe) | fácil |
| K6 aventura | visitar 1 estructura (aldea o portal en ruinas) y volver a casa sin morir | `ir_a_punto`, `buscar_estructura` (de F8.4) | media |

### Minero M1-M6 (apoyo)
| etapa | objetivo medible | habilidades nuevas | dificultad |
|---|---|---|---|
| M1 carbón | 32 carbón en el cofre del campamento en 1 día | `minar_veta TIPO [n]` (sigue la veta por adyacencia) | fácil |
| M2 pozo iluminado | escalera 1×2 hasta y=0 con una antorcha cada 8 y vuelta arriba; 0 muertes por lava en 10 bajadas | `cavar_escalera`, `subir_a_superficie`, `iluminar` | difícil |
| M3 hierro y cobre | 32 hierro crudo + 16 cobre en el cofre en 2 días | — | media |
| M4 deepslate | 16 de deepslate (y < 8) con pico de hierro, 0 muertes | — (tiempo de picado ×1,5) | media |
| M5 diamante | 3 diamantes (y −58) y pico de diamante | `cavar_tunel rumbo n` | media-difícil |
| M6 redstone | 32 de polvo de redstone (y < 16) para el Redstoner | — | media |

### Granjero G1-G6 (apoyo)
| etapa | objetivo medible | habilidades nuevas | dificultad |
|---|---|---|---|
| G1 semillas y azada | azada de madera, ≥ 8 semillas | `recoger_semillas [n]`, `fabricar azada` | fácil |
| G2 huerto | 9 bloques arados a ≤ 4 del agua, 9 sembrados | `arar [n]`, `sembrar SEMILLA [n]`, `verter agua` | media |
| G3 cosecha | 9 de trigo cosechados y replantados; 3 panes | `cosechar [cultivo]` (lee `age=7`), `abonar [n]` | fácil |
| G4 cría | 2 crías nacidas | `criar ANIMAL` (`useOn` sobre dos adultos), `cercar` (valla de 5×5 con puerta) | media |
| G5 cocina | 16 de comida cocinada en el cofre; un pedido del equipo atendido | `cocinar`, pedidos | fácil |
| G6 huerto grande | 2 huertos de 9×9 con agua en el centro, cercados | plano `huerto_9x9` | media |

### Explorador / Cartógrafo E0-E5 (apoyo)
| etapa | objetivo medible | habilidades nuevas | dificultad |
|---|---|---|---|
| E0 explorar robusto | 10/10 salidas de 60 bloques en 4 terrenos (llano, montaña, río, cueva) sin «sin suelo seco» ni atascos; salir de un túnel cerrado | `explorar` arreglado (desvíos por altura, cavar escalón, nadar), `desatascarse` | difícil (**puerta de todos los roles**) |
| E1 mapa en memoria | `mapa.json` con ≥ 20 puntos tras 1 día | `anotar_punto TIPO [nombre]`, `ir_a_punto` | fácil-media |
| E2 estructuras de superficie | aldea, portal en ruinas, avanzada o templo encontrados sin `/locate` | `buscar_estructura TIPO [radio]` (por firma de bloques: `bell`, `crying_obsidian`…) | media |
| E3 viajes largos | ir a un punto a 500 bloques y volver en 1 día | `viajar x z` | media-difícil (océanos: investigación) |
| E4 lava y portal en ruinas | lava de superficie u obsidiana del portal en ruinas localizadas para el Speedrunner | `buscar lava` | fácil |
| E5 estructuras subterráneas | mina abandonada y fortaleza | — | difícil / investigación |

### Builder B1-B6
| etapa | objetivo medible | habilidades nuevas | dificultad |
|---|---|---|---|
| B1 planos JSON | plano de 150 bloques (casa de 7×7 con puerta, ventanas y techo de escaleras) 100 % correcto | `construir_json RUTA [x z] → {puestos, incorrectos}`, `poner` con orientación | media |
| B2 materiales | abastecerse del cofre según el presupuesto; fabricar escaleras, losas y cristal | `abastecer PLANO`, `fabricar` genérico, `fundir sand` | fácil |
| B3 nivelar | parcela de 9×9 nivelada desde un desnivel ≤ 4 | `nivelar x z ancho largo [y]` | media |
| B4 altura | muro de 8 de alto con andamio que luego quita | `andamiar hasta_y`, `desandamiar` | media-difícil |
| B5 obra grande | 400 bloques en ≤ 1 h, ≥ 95 % correctos, 0 muertes | — | difícil |
| B6 granja y espacios | huerto cercado y corral del Granjero | planos `huerto_9x9`, `corral` | fácil |

### Redstoner R1-R7
| etapa | objetivo medible | habilidades nuevas | dificultad |
|---|---|---|---|
| R1 materiales | 32 de redstone (de M6) + 16 hierro + antorchas de redstone | — | media |
| R2 componentes | palanca, repetidor, pistón, dispensador y puerta de hierro fabricados | `fabricar` genérico | fácil (pegajoso: slime → investigación; observador: cuarzo → Nether) |
| R3 colocar orientado | `colocar_redstone PLANO` 10/10 con el `facing` correcto | `colocar_redstone`, `accionar x y z`, `leer_bloque x y z` | media |
| R4 mecanismo 1 | puerta de hierro con palanca que abre y cierra | — | fácil |
| R5 mecanismo 2 | cultivo de 9×9 cosechado por un dispensador de agua con palanca | — | media |
| R6 mecanismo 3 | puerta de pistón 2×2 | — | investigación (slime) |
| R7 mecanismo 4 | granja automática con observador | — | media, después del Nether (cuarzo) |

### Speedrunner S1-S10 (cada etapa se mide aislada)
| etapa | objetivo medible | habilidades nuevas | dificultad |
|---|---|---|---|
| S1 madera y piedra | herramientas de piedra en ≤ 4 min reales | — (guion agresivo, sin refugio de día) | — |
| S2 hierro rápido | 7 de hierro (cubo, pico y espada) en ≤ 20 min | `cavar_escalera` o cueva vista; `fundir` | media |
| S3 portal | portal encendido en ≤ 35 min por una de tres vías: (a) portal en ruinas + obsidiana, (b) lava de superficie + molde con cubo, (c) pico de diamante + 10 de obsidiana | `encender_portal`, `moldear_portal`, `cruzar_portal` | (a) media · (b) investigación · (c) media-lenta |
| S4 fortaleza del Nether | encontrada en ≤ 30 min desde el portal, 0 caídas en lava | `explorar` con los movimientos del Nether, `buscar_fortaleza`; ghast como amenaza y piglins neutrales con botas de oro | difícil / investigación |
| S5 blazes | 7 varas, ≤ 2 muertes | `cazar_blaze [n]` | difícil |
| S6 perlas | 12 perlas, por trueque con piglins o cazando endermen | `intercambiar [n_oro]`, `cazar_enderman` | media / investigación |
| S7 ojos y stronghold | 12 ojos; triangular con 2 lanzamientos a ≥ 200 bloques; llegar encima del stronghold | `lanzar_ojo → {rumbo}`, `triangular`, `viajar` | media / difícil |
| S8 sala del portal | 12 marcos activados | `buscar_sala_portal`, `activar_portal_end` | investigación / fácil |
| S9 cristales del End | 10 cristales destruidos | `subir_torre`, `romper_cristal` | difícil |
| S10 dragón | dragón muerto | `atacar_dragon` | investigación |

Elytra queda fuera.

## Fases
| fase | contenido | puerta (criterio fijado antes de medir) | servidor | trabajador / máquina |
|---|---|---|---|---|
| F8.0a infra | `servidor/` 26.1.2 + RCON (scripts copiados de `servidor-supervivencia/`); `servidor/rcon.py` que resuelve el servidor por `IO_SERVIDOR`, con cerrojo; mundo `local` en `mundo.js`/`mundo.py`; taxonomía C0; decisores; perfiles v2 con sus validadores; rutinas y `guion_f3.js`; memoria persistente; pruebas en seco | `rcon.py list` 10/10; `probar_supervivencia.py` 13/13 en 26.1.2; pruebas en seco en verde; `IO_SERVIDOR` vacío se comporta igual que hoy | sí | 8-10 h / 2 sesiones |
| F8.0b cuerpo base | E0 explorar robusto; C3-C7 (`fabricar` genérico, `fundir`, `poner`, `sacar_del_cofre`, `iluminar`, `cavar_escalera`, `subir`, `cazar`, `recoger_agua`, `verter`); banco H-hab | E0 10/10 en 4 terrenos; H-hab según la tabla de bancos | sí | 10-12 h / 3 sesiones |
| F8.1 Casual K1-K5 + capataz | primer rol completo; banco K | hierro + cama en ≤ 2 días en ≥ 6/8; muertes ≤ 1 cada 3 días | sí | 8 h / 2 sesiones |
| F8.2 Minero ∥ F8.3 Granjero | apoyo temprano, dos trabajadores en paralelo; bancos M y G | M: ≥ 24 de hierro en 6/8, 0 muertes por lava; G: huerto 7/8, cosecha 9/9, cría 6/8 | sí | 8 h + 8 h |
| F8.G jornada + DAgger | simulador, guion de zona gris, red 57→17 | fidelidad ≥ 95 % por rol; hitos y muertes no peores que el guion (IC95); JS = numpy 300/300 | no | 6 h / 2-4 h de CPU |
| F8.9 balance mínimo | Casual solo frente a Casual + Minero | Casual + Minero llega al hierro ≥ 25 % antes | sí | 4 h |
| F8.4 Explorador E1-E4 | mapa, estructuras, viajes; banco E | aldea ≥ 3/4, portal en ruinas ≥ 2/4 | sí | 8 h |
| F8.5 Builder B1-B5 | planos JSON, nivelar, altura; banco B | 150 bloques al 100 % 4/4; 400 bloques ≥ 95 % 3/4, ≥ 8 bloques/min | sí | 10 h |
| F8.6 Redstoner R1-R5 | sin Nether; banco R | R4 5/5, R5 ≥ 4/5 | sí | 8 h |
| F8.9 balance completo | `experimentos_equipos.py`: rol base solo, con un apoyo y con los tres; matriz corta de 40 ejecuciones | el apoyo «acelera» si la mediana es ≤ 0,75× la del base solo, con el mismo signo en ≥ 3/4 puntos y sin más muertes | sí (4 bots) | 4 h / 6-8 sesiones |
| F8.7 Speedrunner S1-S6 | Nether; banco S por etapa (kit de la etapa y `execute in the_nether run tp`) | S3 ≤ 35 min 5/8; S4 2/3; S5 ≤ 2 muertes 2/3 | sí | 16-20 h |
| F8.8 Speedrunner S7-S10 + R6-R7 | End; carrera completa, 3 réplicas | S7 3/3; S9 1/3; dragón informativo; ≥ 1/3 llega al End | sí | 16-24 h |

## Orden recomendado y coste
F8.0a → F8.0b → F8.1 Casual → (F8.2 Minero ∥ F8.3 Granjero) → F8.G (primera red) → F8.9 mínimo → F8.4 → F8.5 → F8.6 → F8.9 completo → F8.7 → F8.8. En total, ≈ 110-140 h de trabajador, 35-40 sesiones con servidor y ≈ 15-20 puntos de cupo. Cada fase se para donde llegue y se anota la decisión del usuario.

**Casual y Speedrunner.** Casual es la tercera fase (F8.1) y su red llega en F8.G. Speedrunner reutiliza toda la fundación y la red de zona gris; S1-S2 se pueden medir en cuanto F8.0b esté hecha, pero S3 y lo que sigue dependen de E4 (F8.4) y del Nether (F8.7).

**Entrenamiento y GPU.** La red de la zona gris es pequeña (57→64→64→17) y la receta es la de F7.4: DAgger con entropía cruzada, lotes de 512 y Adam en numpy, 4-6 min de CPU por semilla. En redes así, el coste lo pone el simulador y no el aprendiz. **Medido el 2026-10-24** (GTX 1650): con lotes de 512, numpy tarda 0,6 ms por paso y CUDA 1,1 ms, así que el aprendiz de F8.G se queda en numpy. CUDA solo gana con lotes ≥ 2048 o con redes de 256 de ancho. Lo que más tarda en DAgger es la recogida en el simulador, y para acelerar hay que paralelizar eso. Detalle en la nota del vault «CUDA frente a numpy en redes pequeñas».

## Bancos (criterios fijados antes de medir)
Todos en el servidor local 26.1.2, con 4 bots en cuadrado latino (plantilla `experimentos_sv.py`), `keep_inventory false`, `spawn_phantoms false` (nombres de las reglas en 26.1; se comprueban con `/gamerule` al montar el servidor), parada si `MemAvailable` < 800 MB, terreno repuesto y una copia tar.gz por hito.

| banco | preparación por RCON | N | principal | umbral |
|---|---|---|---|---|
| H-hab | arena de `probar_supervivencia.py` (y=150) o arena enterrada para minería (piedra con lava a 3) | 10 por habilidad | éxitos (s mediana → `habilidades_medidas_sv.json`) | fundir, sacar_del_cofre, poner, arar/sembrar/cosechar 10/10; iluminar, recoger_agua/verter, colocar_redstone, lanzar_ojo (±10°) ≥ 9; cavar_escalera ≥ 8 y **0 contactos con lava**; criar ≥ 7; cruzar_portal 10/10 |
| K Casual | inventario vacío, `time set 0` | 4 puntos × 2 rotaciones | día y hora de cada hito (carbón, antorchas, horno, hierro, cama, casa) | hierro + cama ≤ 2 días en ≥ 6/8; muertes ≤ 1 cada 3 días |
| M Minero | kit C3, `time set 1000` | 4×2 | hierro crudo en el cofre tras 2 días | ≥ 24 en ≥ 6/8; 0 muertes por lava |
| G Granjero | azada, cubo de agua, 8 semillas, 2 vacas | 4×2 | huerto sembrado + 2 crías en 1 día (el banco madura con `setblock wheat[age=7]`) | huertos ≥ 7/8; cosecha 9/9; ≥ 1 cría en 6/8 |
| E Explorador | el banco usa `/locate` y planta al bot a 150-250 bloques | 4 estructuras × 4 puntos | encontrada (sí/no) y minutos | aldea ≥ 3/4, portal ≥ 2/4 |
| B Builder | parcela con desnivel 3, cofre con los materiales exactos | 3 planos × 4 puntos | % de bloques correctos (`execute if block` por cada bloque del plano) | 150: 100 % 4/4; 400: ≥ 95 % 3/4 |
| R Redstoner | materiales por `give`; el banco acciona y lee `piston[extended]`, `door[open]`, el agua y los ítems | 5 por mecanismo | funciona (sí/no) | R4 5/5, R5 ≥ 4/5 |
| S carrera | S1-S3 en mundo limpio; S4+ con el kit de la etapa y tp a la dimensión | 4×2 (S1-S3), 3 (S4+) | **minutos reales hasta el hito** | S1 ≤ 4 min 8/8 · S2 ≤ 20 min 6/8 · S3 ≤ 35 min 5/8 · S4 2/3 · S5 2/3 · S6 2/3 · S7 3/3 · S9 1/3 · S10 informativo |

## Riesgos
- **Brecha sim→real mayor que en F7** (Nether, obras grandes). Los criterios H-hab por habilidad se cumplen antes de medir políticas, y cada muerte o fallo real se traslada al simulador (regla de `PLAN.md`). El Nether y el End no se simulan hasta tener muestras reales.
- **Taxonomía de 26.1 y creaking**: hostiles por nombre (C0); creaking en `nunca_atacar` y se evita su bioma.
- **Lava bajo y=10 y deepslate**: `cavar_escalera` mira el cubo de 3×7×3 antes de cada paso; nunca pica un bloque con líquido al lado; antorchas cada 8; sube por el mismo camino.
- **Navegación** (montaña, túneles, océanos): E0 es la puerta; los océanos sin barca quedan como investigación.
- **Creepers junto a obras y mecanismos**: `mob_griefing false` en los bancos de Builder y Redstoner (se anota).
- **Daño que no viene de un monstruo** (fuego, lava, bolas de ghast) no activa los reflejos: ampliar `vigilarGolpes` y añadir un reflejo `apagarse`.
- **RAM y RCON compartido**: un servidor cada vez; el cerrojo de `rcon.py` es obligatorio con 4 bots y el vigía.
- **Memoria persistente entre procesos**: un archivo por personaje, escritura atómica, y `base.json` lo escribe solo quien coloca.
- **Red compartida frente a red por rol**: si dos roles contradicen su guion en el mismo estado, `perfil_riesgo` y `reglas.noche` tienen que estar en la observación; la fidelidad se mide por rol.
- **Cupo y tokens**: cada medición con servidor cuesta ≈ 1 punto; bancos cortos y trabajadores ≤ 45 min. Alma no entra en el bucle.

## Ficheros que se crearán o tocarán (resumen)
- Nuevos: `servidor/{descargar,arrancar,parar,guardar}.sh`, `servidor/rcon.py`, `mundos/local/…`, `perfiles/v2/{_etapas,casual,speedrunner,redstoner,builder,granjero,minero,cartografo}.json`, `bot/{rutinas,guion_f3,capataz,decisores,progresion,memoria_persistente,perfil_v2,guion_jornada}.js`, `bot/guiones/<rol>.js` (solo si hacen falta), las habilidades nuevas en `bot/habilidades/`, `entrenamiento/{entorno_jornada,entrenar_jornada_dagger,perfiles_v2,probar_rutinas,experimentos_roles,experimentos_equipos}.py`, `entrenamiento/rutinas_medidas.json` y las pruebas en seco `bot/probar_*_seco.js`.
- Tocados: `bot/{io,libre,red,observacion,ordenes,registro,informe,mundo}.js`, `bot/habilidades/{index,fabricar,explorar,minar,sv}.js`, `entrenamiento/{mundo,red_numpy,probar_habilidades}.py`, `perfiles/*.json` y `_escala.json` (solo cambios aditivos), `mente/alma/mente.py`, `PLAN.md`, `bot/README.md`.
- Intactos: `entorno_habilidades.py`, `entorno_supervivencia.py`, `entrenar_*` existentes, `politica_*.json`, `guion_sv.js`, `reflejos.js`, `experimentos*.py`, `servidor-supervivencia/`.

## Cómo se verifica en Minecraft (resumen de puertas)
G0 (F8.0): `probar_supervivencia.py` 13/13 en 26.1.2 y E0 10/10 en 4 terrenos → G1 Casual: hierro + cama ≤ 2 días en ≥ 6/8 → G2 apoyo: Minero y Granjero pasan los bancos M y G → G3 balance mínimo: Casual + Minero acelera el hierro ≥ 25 % → G4 Builder: 400 bloques ≥ 95 % → G5 Redstoner: R4 y R5 funcionan → G6 Nether: S4 2/3 → G7 End: S9 1/3 (el dragón es informativo).

## Preguntas que el plan deja con valor por defecto
1. **Nombres por rol**: por defecto, los 4 personajes de siempre con el rol en la CLI (`Soma:3001:casual`); hasta 7 personajes cuando haga falta (los nombres nuevos, a elegir).
2. **Semilla del mundo local**: nueva y fija (la 20261015 de 1.21.11 no da el mismo terreno en 26.1).
3. **`mob_griefing` en el juego real** (no en los bancos): por defecto se deja activado.
