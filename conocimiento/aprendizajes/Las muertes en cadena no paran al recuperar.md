---
tipo: aprendizaje
fecha: 2026-11-05
autor: seppuq
fuente: "bot/io.js:366-369, servidor-supervivencia/logs/rol-minero-20261105-1152-bots-0.log"
---
# Las muertes en cadena no paran al recuperar

El tope de 3 muertes seguidas recuperando no corta la cadena. `muertesRecuperando` vuelve a 0 en cuanto el bot muere sin estar recuperando, y tras un «no volveré» sigue en modo libre, recoge algo, muere y vuelve a intentarlo.

En el banco M, M3 murió 13 veces por Drowned en menos de 4 min, con un «no volveré» en la tercera. Reaparecía a unos 30 bloques y volvía sin equipo hacia los mismos monstruos, y acabó con 0 de hierro tras haber llegado a 32.

El contador mide intentos de recuperar, no muertes en poco tiempo ni en el mismo sitio.
