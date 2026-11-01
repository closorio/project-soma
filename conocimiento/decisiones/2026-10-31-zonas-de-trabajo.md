---
tipo: decision
fecha: "2026-10-31"
autor: "seppuq"
estado: vigente
fases: []
---
# Zonas de trabajo

## Contexto
El usuario quería marcar dónde trabajan los bots, no solo dónde no pueden entrar. El rectángulo de obras (`obras.json → permitido`)
no sirve para eso. No se marca desde el chat, solo limita picar y poner, y no se aplica en los mundos con reglas libres:
compañero, local y el 26.3 del usuario.

## Decisión
Se añade un modo nuevo en `zonas.json`, `modo: "trabajo"`, que se marca con `!zona fin NOMBRE trabajo` o con
`zona rect NOMBRE x1 z1 x2 z2 trabajo`. Si hay alguna zona de trabajo:
- talar, minar, picar, poner y construir solo se hacen dentro de alguna de ellas;
- andar sigue libre;
- las zonas vedadas y `no_talar` mandan también dentro.

Si no hay ninguna, todo funciona igual que antes. Va en `bot/zonas.js`: fuera de las zonas de trabajo, `protegidoPor` devuelve
«fuera de la zona de trabajo». Así lo respetan `talaProtegida`, `sv.puedeTocar` y el navegador sin tocar las habilidades.

## Alternativas descartadas
- Encerrarlos del todo, también al andar: no podrían venir al jugador ni ir a un cofre de fuera, y se atascarían más.
- Encerrarlos solo en modo libre: el usuario eligió limitar solo las acciones.
- Reutilizar `obras.json → permitido`: depende de las reglas duras y no tiene orden de chat.

## Consecuencias
- `zonas.json` tiene un modo más. El código anterior al cambio leería una zona de trabajo como vedada, porque solo distinguía `no_talar`.
- Prueba en seco: `bot/probar_zona_trabajo_seco.js`. No se ha probado en juego todavía.
- El rectángulo de obras sigue igual para las reglas duras.
