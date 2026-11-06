---
tipo: aprendizaje
fecha: "2026-11-06"
autor: "seppuq"
fuente: "prueba de «todos ármense» en el servidor local"
---
# Un bloque encima de un cofre impide abrirlo

Es una regla de Minecraft: con un bloque sólido encima, el cofre no se abre. Para un bot, `openContainer` no falla enseguida, sino que agota el tiempo, así que parece un cofre vacío o un fallo de red. El barril no tiene este problema.

## Evidencia
Una mesa que había puesto Iris en (37, 70, 31) tapó el cofre de abajo. Los dos bots respondieron «Solo hay 0 de 34» con 40 lingotes dentro, y el diagnóstico dio `37,69,31: tiempo agotado`.

## Qué hacer con ello
- Al colocar, usar `sv.tapaCofre`; ya lo hacen `sitiosAlLado` y `ponerMesa`. Otras habilidades que colocan sin pasar por ahí no lo comprueban.
- Si un cofre da `tiempo agotado`, mirar primero qué tiene encima.
