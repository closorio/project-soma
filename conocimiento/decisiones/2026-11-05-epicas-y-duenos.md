---
tipo: decision
fecha: "2026-11-05"
autor: "seppuq"
estado: propuesta
fases: [F8]
---
# Épicas con dueño para no pisarnos

**Propuesta: count debe aceptarla, y sobre todo cerrar los dos puntos marcados con ⚠.** Al aceptarla, `estado: vigente`.

## Contexto
[[2026-11-01-reparto-de-roles-f8]] repartió roles, pero el trabajo real no siguió esa división:
- **El roadmap decía que los roles de count estaban sin empezar,** y mientras tanto count hizo centinela, guardaespaldas,
  aliados, oficios (`cosechar`, `herrero`), zonas por dueño y el plugin (`/connect`, `/bo`, colores, inventario).
- **Hay alcance repetido:** `cosechar` es del Granjero, asignado a seppuq. El catálogo de estructuras (seppuq) y Builder
  (count) son el mismo dominio. Sentinela «sin plan» ya existe como modo, aunque sin perfil v2 ni banco.
- **Se toca lo mismo:** desde el 2026-10-20, 24 archivos llevan commits de los dos.

## Decisión
El trabajo se organiza en épicas con un dueño. Se mantiene el reparto de roles del 2026-11-01, salvo lo que se acuerde en ⚠.

| Épica | Contiene | Código principal | Dueño |
|---|---|---|---|
| **E0 Plataforma de comandos** | Entradas, catálogo, control, partir `io.js` ([[2026-11-05-arquitectura-de-comandos]]) | `bot/io.js`, `ordenes.js`, `agenda.js`, `comandos/control.js`, `comandos/movimiento.js` | seppuq; revisa count |
| **E1 Recursos y progresión** | `conseguir`, Minero, Casual, Speedrunner, primera red (F8.G) | `conseguir.js`, `capataz.js`, `perfiles/v2/`, `comandos/recursos.js` | seppuq |
| **E2 Guardia** | Sentinela, guardaespaldas, aliados, combate | `habilidades/atacar.js`, `huir.js`, `comandos/guardia.js` | count |
| **E3 Obras** | Builder, Redstoner, catálogo de estructuras | `habilidades/construir.js`, `estructuras.js`, `obras.js`, `catalogo/`, `comandos/obras.js` | count; ⚠ traspaso de seppuq |
| **E4 Oficios y base** | `cosechar`, `herrero`, Granjero, hogar | `habilidades/cosechar.js`, `comandos/oficios.js` | ⚠ count, si acepta |
| **E5 Operación multijugador** | Plugin, `/connect`, lanzador, plantel, zonas por dueño | `plugin-connect/`, `lanzador.js`, `plantel.js`, `zonas.js` | count |
| **E6 Asistente personal** | Plan A1-A5, voz, mundo del usuario | `planes/asistente/` | seppuq |
| **E7 Autonomía a largo plazo** | F7 activo; F6 Alma y Varios personajes aparcados | `entrenamiento/`, `mente/`, `comandos/supervivencia.js` | seppuq |

### ⚠ Por cerrar con count
1. **Catálogo de estructuras.** Propuesta: seppuq termina la torre y el castillo, que están a medias, y luego E3 pasa entera
   a count. Hasta entonces, count no toca `estructuras.js` ni `catalogo/`.
2. **Granjero.** Propuesta: pasa a count dentro de E4, porque ya hizo `cosechar`. El plan lo pone como apoyo temprano junto al
   Minero (F8.3) y antes de la primera red (F8.G). Si count no puede llevarlo pronto, seppuq lo conserva, o F8.G se hace sin
   él.

### Reglas de trabajo
- **Historias:** cada una es una nota del vault con `epica`, `responsable` y `estado`, y se toma antes de empezar.
- **Dominio ajeno:** se avisa con una línea en el vault y el dueño revisa la PR.
- **Capa común (E0):** cambios cortos y que se integren pronto.
- **Trabajo ya hecho sin banco:** centinela, guardaespaldas y oficios cuentan como funcionando, no como roles terminados.
  Para ser un rol les falta perfil v2 y banco.

## Alternativas descartadas
- **Seguir repartiendo por roles:** es lo que ya falló, porque los roles comparten órdenes, habilidades e `io.js`.
- **Repartir por capas (uno el cuerpo, otro los roles):** cada función nueva dependería de los dos.
- **Volver a encender el hub para avisar de los solapes:** detecta el choque cuando ya está ocurriendo y no resuelve de quién
  es cada cosa.

## Consecuencias
- Hay que añadir `epica` a la plantilla y a las notas de `roadmap/` cuando esto sea vigente.
- `PLAN_F8_perfiles.md` necesita la sección de Sentinela con sus etapas y su banco (dueño: count).
- Solapes que siguen hasta terminar el refactor: los dominios solo existirán como archivos al acabar el catálogo. Mientras
  tanto, `io.js` y `ordenes.js` siguen siendo comunes.
- Se revisa si a las dos semanas sigue habiendo commits de los dos en los mismos archivos de un dominio.
