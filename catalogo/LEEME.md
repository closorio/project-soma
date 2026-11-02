# Construir estructuras con los bots

Guía para que un bot construya una plantilla (`.litematic` o `.nbt`) donde tú digas, mirando hacia donde quieras y consiguiendo
él los materiales. Las órdenes se escriben en el chat del juego empezando por el nombre del bot («Oqva, …»).
Chuleta de una hoja con todos los comandos: [comandos_construccion.pdf](comandos_construccion.pdf) (se regenera con
`herramientas/comandos_construccion_pdf.py`).

## 1. Conseguir la plantilla

Vale cualquiera de estos dos formatos:

| Formato | De dónde sale |
|---|---|
| `.litematic` | Litematica (mod de cliente): selecciona la zona y guárdala. También las que se descargan de webs de esquemas. |
| `.schem` | WorldEdit (`//schem save`), y la mayoría de webs de esquemas. Versiones 2 y 3 del formato (Sponge). |
| `.nbt` | El **bloque de estructura** del juego (modo «Guardar»: quedan en `<mundo>/generated/minecraft/structures/`), o las de los datapacks y del propio juego (aldeas, etc.). |

Otros formatos (`.schematic` antiguo, `.mcstructure` de Bedrock) no se leen: ábrelos en Litematica y guárdalos como `.litematic`.

Webs donde descargar construcciones (busca las que den `.litematic` o `.nbt`):

| Web | Qué tiene |
|---|---|
| [Planet Minecraft](https://www.planetminecraft.com/) | La mayor comunidad: proyectos con descarga de esquemas, muchos en `.litematic`. Gratis. |
| [Minecraft Maps](https://www.minecraftmaps.com/schematics) | Esquemas en `.litematic`, `.schem`, `.nbt` y `.mcstructure`, con vista 3D y lista de materiales. Gratis. |
| [Donut Build](https://www.donut.build/how-to-use-litematic-files) | Construcciones en `.litematic`. |
| [Abfielder](https://store.abfielder.com/) | Granjas y construcciones en `.litematic` (de pago; la granja de piedra del catálogo es de aquí). |

Antes de importar, mira el tamaño: tiene que caber en tu zona de obras, y cuanto más grande, más materiales y más tiempo.

## 2. Ponerla en `catalogo/` e importarla

Copia el archivo a `catalogo/` (en la raíz del proyecto) y, desde la raíz:

```
make import-structure FILE=catalogo/casa_roble.litematic NAME=casa_roble ALIAS="casa de roble"
make import-structure FILE=catalogo/torre.nbt NAME=torre ALIAS="torre de vigilancia" FRONT=sur
make structures                       # la lista: id, tamaño, bloques, materiales y lo que no se puede conseguir
```

- `NAME`: el id, en minúsculas, números y `_`. Es como la llamarás en las órdenes.
- `ALIAS` (opcional): otros nombres para el chat, separados por comas.
- `FRONT` (opcional): hacia dónde da la **entrada** de la plantilla tal como está guardada (`norte`, `sur`, `este`, `oeste`). Si no
  lo pones, se deduce de la primera puerta; sin puerta, `sur`. El importador lo dice al terminar («entrada al oeste»): si no es
  así, repite con `FRONT=…`.
- Si sale «bloques que no existen en 1.21.11: …», la plantilla es de otra versión con bloques que ya no están: cámbialos en el juego
  y vuelve a guardarla.

Esto crea `bot/estructuras/<id>.json` (la plantilla) y `bot/materiales/<id>.json` (la lista de materiales). **El catálogo es de cada
uno**: `catalogo/` (salvo esta guía, el PDF y lo de las pruebas), `bot/estructuras/` y `bot/materiales/` no van a git. Para darle una
plantilla al otro, pásale el archivo y que la importe en su PC (puedes organizarlas en subcarpetas: `catalogo/schematic/…`).

**Ojo con el tamaño**: `make structures` dice cuántos bloques tiene. Una casa son cien o doscientos; una construcción con su terreno
puede tener más de cien mil (lo que el bot tardaría semanas en poner y no cabe en una zona de obras normal). Si el esquema trae la
colina o el suelo, recórtalo en Litematica o WorldEdit antes de importarlo.

## 3. Marcar dónde se puede construir (carteles)

En el mundo compartido, los bots solo construyen donde se les deja. Lo más cómodo es marcarlo con dos carteles:

1. Pon un cartel en una esquina del terreno y otro en la esquina **opuesta**. En los dos, primera línea `[obras]` y segunda línea un
   nombre, el mismo en los dos (por ejemplo `norte`).
2. Cerca de los carteles (a menos de 64 bloques del bot): **«Oqva, lee los carteles»**. Te dice la zona que ha entendido, con sus
   coordenadas, y los carteles sin pareja.
3. **«Oqva, acepta los carteles»**. Desde ahora solo construye dentro de esas zonas.
4. La zona vale mientras sigan los dos carteles: si quitas uno, deja de valer. **«Oqva, olvida los carteles»** las borra todas.

Dentro de una zona de carteles el bot puede andar y construir aunque esté dentro de una zona vedada (tu base, por ejemplo); lo de
alrededor sigue protegido. Las zonas de `!zona` no cambian.

## 4. Dejar los materiales

**Qué hace falta**: «Oqva, lista de estructuras» las enumera (`1. casita_prueba (5×5×5, 99 bloques) · 2. …`) y **«Oqva, recursos de
la 2»** (o «qué necesito para casita_prueba») dice los recursos primarios partiendo de cero (para la casita: 27 troncos de cualquier
madera, 2 de arena y 1 de carbón) y, aparte, las piezas ya hechas que también valen (tablones, losas, escaleras…).

**De dónde los saca**: con `export IO_ABASTO = cofres` en tu `local.mk`, o diciendo **«Oqva, solo de los cofres»**, el bot solo usa
lo que dejes en los cofres de tu base: saca, fabrica (tablones, escaleras, puertas…), funde (arena → cristal, con el carbón o los
troncos que haya) y construye; lo que no esté te lo pide. **«Oqva, consigue tú los materiales»** vuelve al modo en que también tala,
mina y caza lo que falte. Paso a paso:

1. Mira los **cofres de tu zona base** (la de `IO_BASE` en tu `local.mk`, o tu zona de hogar) y saca lo que haya.
2. Fabrica lo que se fabrica (tablones, losas, escaleras, puertas, antorchas…), con la mesa a su lado.
3. Solo si no está en «solo de los cofres»: tala, mina, funde y caza lo que falte (troncos, piedra, arena para cristal, lana…).
4. Lo que no puede conseguir te lo pide por el chat: «necesito que me traigas … (déjalo en un cofre de CASASOMA)».

Para que vaya rápido, deja todo en esos cofres. **La madera da igual**: si la plantilla pide roble y tienes abeto, usa abeto. Para
casas de más de 4 de alto deja también **tierra** (unos 10 bloques) para el andamio. **«Oqva, qué falta para casa_roble»** te dice lo
que falta mirando la mochila y los cofres.

## 5. Construir

```
Oqva, construye casa_roble en 300 64 -20
Oqva, construye casa_roble en 300 64 -20 mirando al este
Oqva, construye la casa de roble aquí con la puerta al norte
Oqva, construye casa_roble en 300 64 -20 girada 90
```

- **La posición** (`x y z`) es la esquina de abajo, la de x, y, z **más pequeños** (al noroeste), y la `y` es la del primer piso: la
  de tus pies estando de pie en el suelo. Con F3 la ves.
- **«aquí»**: la esquina queda a 2 bloques de tus pies (hacia el sureste).
- **La dirección**: «mirando al este», «con la entrada al este» o «con la puerta al este» giran la plantilla para que su entrada dé al
  este. «girada 90 | 180 | 270» la gira esos grados a la derecha (visto desde arriba), sin mirar dónde está la entrada.
- Al girar, la caja también gira: una casa de 7 de ancho (x) por 11 de largo (z) mirando al sur ocupa 11 × 7 mirando al este. La
  esquina que das sigue siendo la de x, y, z más pequeños de la caja **ya girada**:

```
                    norte (z más pequeña)
 esquina que das →  ●──────────┐
 (x, y, z mínimos)  │          │
  oeste             │   casa   │    este (x más grande)
  (x más pequeña)   │          │
                    └──────────┘
                    sur (z más grande)
```

  Hay que dejarle la caja vacía: la hierba, las flores y la nieve las quita él, pero cualquier otro bloque la para con «ocupado».
- Mientras construye: los bloques se ponen capa a capa y con su orientación (escaleras, losas, puertas, antorchas…). Si alguno sale
  con otra orientación lo rompe y lo prueba de otra forma una vez; si sigue mal, lo deja y lo apunta. Si la casa pasa de 4 de alto
  pone un andamio de tierra fuera y lo quita al acabar.

Otras órdenes:

| Orden | Qué hace |
|---|---|
| «Oqva, lista de estructuras» | las del catálogo, numeradas |
| «Oqva, recursos de la 2» | los recursos primarios de la número 2 (y las piezas que también valen) |
| «Oqva, solo de los cofres» / «Oqva, consigue tú los materiales» | solo usa lo de tus cofres / también tala, mina y caza |
| «Oqva, qué falta para casa_roble» | los materiales que faltan (mochila y cofres de tu base) |
| «Oqva, continúa» | retoma la última obra a medias, en el mismo sitio y con el mismo giro |
| «Oqva, deshaz casa_roble» | quita los bloques que puso él (y el andamio si quedó) |
| «Oqva, para» | corta la obra; «continúa» la retoma |

## 6. Si algo falla

| Dice | Qué pasa y qué hacer |
|---|---|
| «fuera de las zonas de obras de los carteles» | La caja (ya girada) se sale de la zona: muévela, o pon los carteles más lejos y «lee/acepta los carteles». |
| «ocupado: N bloques (x,y,z…)» | Hay bloques dentro de la caja: quítalos o elige otro sitio. No excava. |
| «sin suelo bajo …» | La primera capa queda en el aire más de 8 bloques: baja la `y`. |
| «necesito que me traigas …» / «no encuentro cerca con qué hacer …» | No puede conseguirlo solo (tintes, arena lejos…): déjalo en un cofre de tu base y «continúa». |
| «no pude colocar en x,y,z: sin apoyo» | Ese bloque no tiene nada en que apoyarse ni en la plantilla ni en el mundo (algo que flota). |
| Se para de noche o tras una pelea | Las peleas la ponen en pausa y la retoma sola; si murió, «continúa» cuando reaparezca. |

Detalle técnico: `bot/estructuras.js` (catálogo, giro y orden de colocación), `bot/habilidades/construir.js` y `orientar.js`
(colocar con su estado), `bot/abastecer.js` (materiales por tandas), `bot/carteles.js` (zonas de carteles) y
`herramientas/importar_estructura.js` (importador). Decisiones en el vault: `conocimiento/decisiones/2026-11-02-catalogo-de-estructuras.md`
y las que la siguen.
