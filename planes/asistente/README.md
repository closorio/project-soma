# Fichas del asistente (F-asistente) · protocolo para Sonnet

Una sesión = una ficha. Cada ficha (`A1.md` … `A5.md`) dice qué existe, qué cambiar, cómo se prueba y cuándo está hecha. El
diseño ya está decidido en `PLAN_asistente.md` y aquí: **no se rediseña**. Las puertas son código en
`entrenamiento/banco_asistente.py`, con los criterios fijados antes de medir: no se tocan para que algo pase.

## Prompt para pegar tras `/clear` (cambia A1 por la fase que toque)

```
Ficha A1 del asistente. Lee planes/asistente/README.md, planes/asistente/TRAMPAS.md y planes/asistente/A1.md, y nada más
salvo los trozos de código que la ficha cite (grep -n y sed -n, nunca ficheros enteros). Sigue el protocolo.
```

## Protocolo
1. **Gasto.** Pide al usuario el % semanal de `/usage` y anótalo en `conocimiento/diario/seppuq/<fecha>.md`
   (`uso F-asistente: base N %`). La línea cabe en ≤ 5 % por semana (la semana empieza el sábado a las 6:00). Si ya se pasó,
   dilo y para.
2. **Leer** solo esta carpeta y lo que cite la ficha. Sin subagentes, sin modo plan, sin brainstorming: el diseño está hecho.
3. **Hacer** los pasos de la ficha en orden. Cada paso nombra el fichero, la función y la línea de partida. Si la línea ya no
   coincide, busca la función por su nombre con `grep -n`. Si no existe o hace otra cosa: **para y pregunta**.
4. **Probar**: la prueba en seco de la ficha y luego `make verify` (tiene que acabar en «verify: todo bien»; la parte A de
   `probar_libre_seco` falla siempre en este PC y no cuenta). Sin `make verify` en verde no hay commit.
5. **Puerta**: el comando de la ficha, en segundo plano, sin sondear. Lee solo la última línea y la nota que escribe en
   `conocimiento/experimentos/`. Rellena su «Conclusión» en 3-5 líneas.
6. **Commit** con el mensaje que da la ficha (inglés, conventional commits, **sin** Co-Authored-By ni mención a Claude), y push
   a `develop`. Solo los ficheros de la ficha y las notas del vault.
7. **Cerrar**: en `conocimiento/roadmap/Asistente personal.md`, `siguiente` y `actualizado`; en el diario, qué se hizo y
   `uso F-asistente: +N %` (pide otra vez `/usage`). Si el hub responde: `python3 compartido/cliente.py estado "…"`.

## Cuándo parar y escalar a Opus/Fable
- La puerta falla en dos sesiones seguidas.
- La ficha no encaja con el código (una función que no existe, un contrato distinto).
- Algo pide cambiar un criterio de una puerta o una regla del mundo del usuario.
Di qué pasó en tres líneas y deja el trabajo en un punto estable (pruebas en verde), sin commit a medias.

## Orden
A1 → A2 → A4 → A5 → A3. A3 es la más difícil (cuevas y lava de verdad): si falla dos veces, se escala.

## Cómo se arranca cada mundo
- Banco (26.1.2): `make server-start`, y Soma solo, en modo órdenes:
  `make bots WORLD=local BOTS=Soma MODE=ordenes BOT_DECIDER=guion`. Parar: `make bots-stop WORLD=local server-stop`.
- Mundo del usuario (26.3): `make user-server-start proxy-start assistant`. Parar: `make bots-stop WORLD=usuario proxy-stop user-server-stop`.
- Nunca dos servidores a la vez con el cliente del usuario abierto (RAM). Para saber qué pasó: `make report`.
