---
tipo: decision
fecha: "2026-11-05"
autor: "seppuq"
estado: propuesta
fases: [F8]
---
# Arquitectura de roles y submodos

**Propuesta: count debe aceptarla, y sobre todo cerrar los puntos marcados con ⚠.** Al aceptarla, `estado: vigente`, y
[[2026-11-01-reparto-de-roles-f8]] pasa a `estado: sustituida`. Hasta entonces no se toca código.

## Contexto
Hoy hay tres conceptos sueltos:
- **Roles v2** (`casual`, `speedrunner`, `minero`): lista plana de etapas que sigue `bot/capataz.js`.
- **Encargos** (centinela, guardaespaldas, oficio): campos sueltos en `bot/io.js`, sin perfil ni banco.
- **Planes** (Builder, Redstoner, Granjero): solo existen en `PLAN_F8_perfiles.md`.

Un rol no puede incluir a otro, por eso las etapas se repiten con variaciones. `minero` es un rol completo, pero en realidad es
una pieza. Tampoco queda escrito quién es dueño de cada pieza ni si está probada.

## Decisión
Cuatro roles con dueño y una biblioteca común de **submodos**, piezas declarativas con dueño y contrato que se componen al cargar.
El capataz sigue recibiendo una lista plana, así que no cambia.

```
Rol        casual · speedrunner · builder · redstoner      a qué juega; pesos y reglas; tiene dueño
 └ Submodo minero · constructor · granjero · centinela…    pieza reutilizable; puede incluir otros submodos
    └ Etapa   perfiles/v2/_etapas.json                     objetivo medible, ya existe
       └ Habilidad  bot/habilidades/                       contrato {exito, causa, ms}, ya existe
```

- **Roles:** count lleva Builder y Redstoner; seppuq lleva Casual y Speedrunner.
- **Centinela y guardaespaldas** dejan de ser un rol y pasan a ser submodos. Sentinela ya no es un rol de count, aunque sigue
  siendo suyo como pieza.
- **Campesino = Granjero:** un solo submodo `granjero`; «campesino» es un alias del chat.
- **Vocabulario:** `modo` sigue significando `libre` u `órdenes`. Lo que seppuq llama «modo» (Builder, Casual…) es un **rol**. Frases
  como «modo guardaespaldas» siguen funcionando en el chat.

### Submodos
Un submodo puede tener dos partes:
- **`etapas`:** un trabajo con fin. Se compone dentro de un rol.
- **`servicio`:** un trabajo sin fin que se retoma tras otras órdenes. Es el «encargo» de [[2026-11-05-arquitectura-de-comandos]].

| Submodo | Etapas | Servicio | Dueño | Épica | Madurez hoy (estimada, por confirmar) |
|---|---|---|---|---|---|
| `fundacion` (C1-C7, tronco común) | sí | no | seppuq | E1 | medido a trozos |
| `minero` | sí | no | seppuq | E1 | medido, no aceptado (base 16/32) |
| `cartografo` | sí | no | seppuq | E1 | borrador |
| `constructor` | sí | no | count ⚠ | E3 | funciona |
| `granjero` | sí (huerto) | sí (cosechar) | count ⚠ | E4 | funciona a medias |
| `herrero` | no | sí | count ⚠ | E4 | funciona |
| `centinela` | no | sí | count | E2 | funciona |
| `guardaespaldas` | no | sí | count | E2 | funciona |

**Criterio para crear un submodo:** solo cuando lo usen dos roles o necesite banco propio. Las etapas R3-R7 de Redstoner y las del
Nether de Speedrunner siguen dentro de su rol hasta entonces.

**Componer no es servir:** incluir un submodo significa que el mismo bot hace ese trabajo. `sirve_a`, que ya existe, significa que
otro bot le lleva el resultado por cofre.

### Contrato
`perfiles/v2/submodos/<nombre>.json`:

```json
{ "v": 2, "nombre": "granjero", "dueno": "count", "epica": "E4", "madurez": "funciona",
  "identidad": "Mantiene el huerto y produce comida.",
  "etapas": [ { "submodo": "fundacion" }, { "id": "g_huerto" } ],
  "servicio": { "orden": "oficio cosechar", "grupo": "trabajo" },
  "banco": { "make": "bench-g", "criterio": "fijado antes de medir", "tiradas": 4 } }
```

`bench-g` y `g_huerto` son ejemplos: todavía no existen.

Un rol incluye un submodo y lo ajusta sin tocar el archivo del otro dueño:

```json
"etapas": [ { "submodo": "fundacion", "cambia": { "madera": { "objetivo": { "inv": { "troncos": 4 } }, "max_s": 120 } } },
            { "id": "portal" } ]
```

### Reglas de composición
Se aplican al cargar, en `resolver` y `validar` (`bot/perfil_v2.js` y su gemelo `entrenamiento/perfiles_v2.py`):

1. **Recursión:** un submodo puede incluir otros. Un ciclo o más de 4 niveles dan un error con la ruta.
2. **Precedencia:** catálogo < submodo < `cambia` del rol.
3. **Dependencias en diamante:** si una etapa llega dos veces igual, se queda la primera. Si llega distinta, da error y nombra a
   los dos orígenes.
4. **Lista plana:** se le aplican las comprobaciones de hoy (cadena de `pre`, acciones conocidas), y `cambia` solo vale sobre etapas
   que existen.
5. **Compatibilidad:** un submodo declara lo que `exige` (por ejemplo, `y_min: -58`), y un rol que no lo cumple no valida.

**En ejecución no hay pila de submodos.** Basta con lo que ya existe: el bucle de `conseguir` y `luego` del capataz. Una pila solo se
abre si un banco demuestra que hace falta.

### Control
- **Un rol no es un encargo.** Un rol es el modo base (`libre` con `capataz@rol`), y un servicio se superpone a él. Esto responde a la
  pregunta abierta de la nota de comandos.
- **Un encargo por grupo:** `guardia` (centinela, guardaespaldas) manda sobre `trabajo` (granjero, herrero). Es lo que ya pasa hoy.
- **La prioridad no cambia:** reflejos > defensa > urgencias > órdenes > encargo > modo base.
- **El mantenimiento sigue en el capataz** (noche, hambre, poca vida), para no repetirlo en cada submodo.

### Madurez
`borrador → funciona → medido → aceptado`

- **`aceptado`** exige banco con criterio fijado antes de medir y las tiradas por versión que pida el ruido de ese banco (el M pide
  4: [[2026-11-05-tiradas-del-banco-m]]).
- **Un rol no puede estar `aceptado` si incluye algo que no lo está.** Lo comprueba el validador.
- **Dos niveles de banco:** el del submodo aísla el fallo y el del rol mide la integración.
- **Hoy nada está `aceptado`.**

### ⚠ Por cerrar con count
1. **`granjero` y `herrero`:** ¿los lleva count dentro de E4? Es el punto Granjero de [[2026-11-05-epicas-y-duenos]], ampliado a
   `herrero`. El código de `cosechar` y `herrero` ya es suyo.
2. **`constructor`:** ¿lo lleva count, con el traspaso del catálogo de estructuras que propone esa misma nota?
3. **Madurez de lo tuyo:** ¿es correcta la columna de la tabla para `constructor`, `granjero`, `herrero`, `centinela` y
   `guardaespaldas`?

## Alternativas descartadas
- **Árbol de comportamiento o pila de submodos en ejecución:** riesgo alto, y los bancos dejarían de ser comparables.
- **Herencia entre roles** (Casual extiende Minero): arrastra pesos y reglas que no tocan; componer solo las etapas no lo hace.
- **Biblioteca sin dueños:** es el solape que [[2026-11-05-epicas-y-duenos]] intenta evitar.
- **Un submodo por cada grupo de etapas:** llenaría la biblioteca de piezas con un solo uso.
- **Campesino y granjero por separado:** dos submodos y dos bancos para lo mismo.

## Consecuencias
**Ajustes a las propuestas pendientes**, que se aplican si se aceptan las tres:
- [[2026-11-05-arquitectura-de-comandos]]: el glosario añade «submodo», y un encargo pasa a ser un submodo con `servicio` activo.
- [[2026-11-05-epicas-y-duenos]]: el Granjero se decide con el ⚠ 1. Sentinela es un submodo de E2, no un rol.

**Pasos después de aceptar, cada uno una PR corta:**
1. **Composición.** Guardar antes la salida de `perfiles_v2.py --json` como referencia. Pasar las etapas de `minero` a su submodo y
   dejar `perfiles/v2/minero.json` como rol fino, para que `capataz@minero` y `make bench-m` sigan igual. Extraer `fundacion` solo en
   la parte que los roles comparten en el mismo orden. **Requisito:** lista resuelta idéntica a la referencia; así no hace falta
   repetir bancos. No depende del refactor de `io.js`.
2. **Catálogo visible.** Manifiestos del resto de submodos, apuntando a las órdenes de hoy. `make roles` muestra el árbol con dueño y
   madurez. Alias «campesino» en `bot/ordenes.js`.
3. **Control unificado.** Último trozo del refactor E0: un encargo por grupo en `bot/control.js`. Es el único paso que puede cambiar
   el comportamiento; se compara con 4 tiradas del banco M contra `banco-m-base-20261105`.
4. **Cada dueño completa sus piezas.** count: plan y banco de `centinela`, luego `constructor` (B1) y Builder. seppuq: `minero` en el
   banco M y luego Casual.

**Lo que no cambia:** la red de zona gris (F8.G), porque los `pesos` siguen en el rol.

**Aviso de nombre:** `constructor` coincide con el estilo v1 `perfiles/constructor.json`, que no se puede renombrar. Hay que decir
siempre «submodo constructor» o «estilo constructor».

**Se revisa si** `cambia` acaba reescribiendo la mayor parte de un submodo, porque entonces esa pieza no se está reutilizando de verdad.
