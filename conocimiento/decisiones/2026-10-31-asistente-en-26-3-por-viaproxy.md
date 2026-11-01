---
tipo: decision
fecha: 2026-10-31
autor: seppuq
estado: vigente
fases: ["[[Asistente personal]]"]
---
# El asistente llega a 26.3 por ViaProxy

## Contexto
El asistente personal tiene que funcionar en el mundo propio del usuario en Minecraft Java 26.3. Hay tres obstáculos:
- mineflayer 4.39.0, node-minecraft-protocol y minecraft-data solo llegan hasta 26.1;
- el soporte de 26.3 está en ramas `pc26_3` sin publicar;
- un servidor 26.3 expulsa al bot a los 1,5 s si no manda `client_tick_end` (issue mineflayer #4189).

## Decisión
- El mundo del usuario (`servidor/`) se recrea con el jar **vanilla 26.3**.
- El bot sigue hablando **26.1** y entra por **ViaProxy ≥ 3.4.13** (127.0.0.1:25568 → 25565), que traduce a 26.3. El usuario entra directo al 25565.
- mineflayer se fija a un **commit de master** posterior al PR #4137, que ya manda `tick_end`. Si eso rompe `make test`, se usa un envoltorio en `io.js`.
- El banco local (`servidor-local/`, 26.1.2) y el server del compañero (26.1.x) no cambian.

## Alternativas descartadas
- **Ramas `pc26_3` de minecraft-data, protocol, mineflayer, physics y chunk.** Darían soporte nativo, pero no están publicadas ni probadas y se pueden romper en cada `npm ci`.
- **Desarrollar en 26.1.2 y portar después.** Es lo más barato, pero el usuario no jugaría con el asistente en 26.3 hasta que upstream lo publique.

## Consecuencias
- A0 mide primero lo dudoso con Via: los clics de ventana (cofre y mesa).
- Si fallan, hay un criterio de abandono: ≤ 6 h probando Paper 26.3 con ViaVersion, y después las ramas `pc26_3`, con una decisión nueva que sustituya a esta.
- Los bloques nuevos de 26.3 llegan al bot como sustitutos y no se usan en v1.
- El pin de mineflayer en `develop` también afecta al compañero.

Plan en `PLAN_asistente.md`.
