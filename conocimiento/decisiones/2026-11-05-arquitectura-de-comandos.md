---
tipo: decision
fecha: "2026-11-05"
autor: "seppuq"
estado: vigente
fases: [F8]
---
# Arquitectura de comandos e interacción con los bots

**Vigente desde el 2026-11-05.** seppuq contestó los puntos por cerrar en nombre de count, que queda avisado y puede objetar con otra nota. El refactor de `io.js` sigue esperando a que count integre lo pendiente.

## Contexto
Añadir una orden obliga a tocar archivos comunes, y por eso los dos coincidimos siempre en ellos. Desde el 2026-10-20,
`bot/io.js` lleva 67 commits de seppuq y 39 de count, y `bot/ordenes.js` 22 y 11.

Cómo llega hoy una orden al bot:

```
chat «Eco, …» ─────────────┐
puerto HTTP, c=orden ──────┴─► ordenes.js (+ LLM opcional) ─► agenda.js ─► io.js hacer() ─► habilidades/
chat «!zona …» ──────────────► io.js ordenZona()
puerto HTTP, otros c= ───────► io.js crearOrdenes()
plugin /connect, /bo ────────► lanzador.js, procesos · canal soma:duenos
```

Problemas:
1. **Una orden está repartida:** regex en `interpretar()`, `case` en `hacer()` (≈ 750 líneas) o en `ordenInmediata()`, texto
   en `AYUDA` y `bot/README.md`.
2. **Hay tres caminos de entrada** con reglas distintas: lenguaje, `!zona` y la tabla del puerto. Los permisos se miran en
   el manejador del chat, no por orden. Por el puerto no se miran (solo escucha en local).
3. **El control no tiene un estado único:** `modo`, `decisor`, `centinela`, `guardaespaldas` y `oficio` son campos sueltos,
   con condiciones como `!this.centinela && !this.guardaespaldas && !this.oficio`.
4. **El vocabulario se solapa** (ver el glosario).

## Decisión
Ordenar en cinco capas, sin cambiar de protocolo ni reescribir. El texto sigue siendo la interfaz, y quien usa el puerto
(`make`, Ío, la mente, los bancos) no se entera.

| Capa | Qué hace | Dónde |
|---|---|---|
| Entradas | Chat, puerto y `!zona` llegan a una sola puerta con su origen | `bot/io.js` reducido |
| Catálogo | Cada comando declara frases, permiso, clase, ayuda y `ejecutar` | `bot/comandos/<dominio>.js` |
| Agenda | Cola, repeticiones y urgencias, como hoy | `bot/agenda.js` |
| Control | Modo base + un encargo persistente, con prioridad explícita | `bot/control.js` |
| Cuerpo | Habilidades con contrato `{exito, causa, ms}`, como hoy | `bot/habilidades/` |

Clases de comando: **inmediata** (responde sin hacer cola: `estado`), **encolable** (pasa por la agenda: `tala`) y
**encargo** (persiste y se retoma tras otras órdenes: `centinela`).

### Dominios del catálogo
Cada archivo tiene dueño (ver [[2026-11-05-epicas-y-duenos]]).

| Archivo | Órdenes de hoy | Épica |
|---|---|---|
| `control.js` | `modo`, `decisor`, `rol`, `perfil`, `despues`, `agenda`, `salta`, `para_todo`, `estado`, `ayuda` | E0 |
| `movimiento.js` | `ven`, `sigueme`, `quedate`, `portal`, `sube`, `baja`, `apartate`, `desatascate`, `dame`, `foto` | E0 |
| `recursos.js` | `tala`, `recoge`, `guarda`, `mina`, `consigue`, `recupera`, `caza`, `fabrica`, `funde`, `saca`, `abasto`, `recursos`, `agua`, `vierte`, `pon`, `ilumina`, `explora`, `campamento` | E1 |
| `supervivencia.js` | `come`, `duerme`, `refugiate`, `sal`, `huye`, `armate`, `equipate` | E7 |
| `guardia.js` | `centinela`, `guardaespaldas`, `escolta`, `aliado`, `ataca` | E2 |
| `obras.js` | `construye`, `deshaz`, `materiales`, `estructuras`, `carteles` | E3 |
| `oficios.js` | `oficio` (`cosechar`, `herrero`) | E4 |
| `zonas.js` | `!zona` | E5 |

### Glosario

| Término | Significa | Ejemplos |
|---|---|---|
| **Orden** | Lo que alguien le pide a un bot | «tala 5 troncos» |
| **Modo** | Qué hace cuando nadie le pide nada | `libre`, `órdenes` (quieto) |
| **Decisor** | Quién elige la siguiente acción en modo libre | `red`, `guion`, `capataz` |
| **Rol** | Perfil v2 con etapas, que sigue el decisor `capataz` | `casual`, `minero`, `speedrunner` |
| **Estilo** | Perfil v1: sesgo de comportamiento. En la orden sigue llamándose `perfil` | `recolector`, `explorador` |
| **Submodo** (nuevo) | Pieza reutilizable con dueño, que un rol compone: [[2026-11-05-arquitectura-de-roles]] | `minero`, `granjero`, `centinela` |
| **Encargo** (nuevo) | Submodo con `servicio` activo: trabajo persistente que se retoma tras otras órdenes | centinela, guardaespaldas, oficio |
| **Oficio** | Encargo de una tarea repetitiva | `cosechar`, `herrero` |

### Prioridad del control
De mayor a menor. **Hay que comprobarla contra el comportamiento actual** en el último trozo del refactor, porque hoy está
repartida por el código:

1. Reflejos: respirar, comer con poca vida, huir.
2. Defensa en curso.
3. Urgencias de la agenda: recuperar tras morir.
4. Órdenes de la cola.
5. Encargo persistente.
6. Modo base: libre con su decisor, o quieto.

### Preguntas abiertas
- ~~¿Un rol es un encargo?~~ Resuelta en [[2026-11-05-arquitectura-de-roles]]: no; un rol es el modo base y el encargo se superpone.
- `dame` y `foto` son sociales, no de movimiento. No merecen archivo propio mientras sean dos.

## Alternativas descartadas
- **Solo partir `io.js` por tamaño:** abarata la lectura, pero añadir una orden seguiría tocando tres sitios.
- **Reescribir sobre un framework de comandos o un árbol de comportamiento:** riesgo alto sobre un sistema que ya funciona,
  y los bancos dejarían de ser comparables.
- **Cambiar el protocolo del puerto a JSON:** rompería `make`, Ío, la mente y los bancos sin resolver el reparto.

## Consecuencias
- **Orden del refactor:** tabla de frases como red de seguridad → mover `hacer()` → catálogo → una sola puerta → control.
  Cada trozo es una PR corta y solo el último puede cambiar comportamiento.
- **Coordinación:** antes de empezar, count integra lo pendiente y se acuerda una ventana sin cambios en `io.js`.
- **Línea base:** el refactor se compara con el banco M de la etiqueta `banco-m-base-20261105`.
- **Fuera del repo:** la skill `io-minecraft` del plugin de Ío apunta a una ruta que ya no existe y a nombres antiguos.
- **Se revisa si** el coste de mover `hacer()` resulta mayor que el de los conflictos que evita.
