---
tipo: aprendizaje
fecha: 2026-11-04
autor: seppuq
fuente: "bot/capataz.js, servidor-supervivencia/logs/bots-rol-minero-{0,1}.log"
---
# Un paso que siempre acierta tapa al que falla

La etapa `m_pozo` tiene dos pasos: `cavar_escalera 0 -` y `subir_a_superficie`. Si cavar falla dos veces (`FALLOS_PASO`; causas vistas: «agua delante», «hueco», «amenaza»), `decidir` en `bot/capataz.js` solo elige subir. En la superficie, subir acaba al momento con «ya fuera» y cuenta como éxito.

`st.fallos` solo se vacía cuando todos los pasos han agotado sus fallos, y eso ya no ocurre. Así, ni se vuelve a intentar cavar ni se llega a `alternativa`. El bot sigue vivo y repite el paso hasta el final, salvo cuando la noche o una amenaza lo interrumpen.

En el banco M [[2026-11-04-1657-banco-m-con-terreno-limpio-tras-recuperar-y-subir]] pasó a 3 de 8 bots (414, 503 y 695 repeticiones; acabaron con 3, 6 y 5 de hierro). Puede pasar en cualquier etapa con un paso que acierte sin hacer nada.

Al mirar un banco, las etapas en `ultima.falta` y un recuento de líneas repetidas por bot lo delatan enseguida.
