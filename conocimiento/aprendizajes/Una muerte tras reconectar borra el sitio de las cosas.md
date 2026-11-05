---
tipo: aprendizaje
fecha: 2026-11-05
autor: seppuq
fuente: "bot/io.js:366-369, servidor-supervivencia/logs/rol-minero-20261105-1152-bots-1.log"
---
# Una muerte tras reconectar borra el sitio de las cosas

Si el bot muere y se desconecta antes de recuperar, puede perder la pista de sus cosas. Al reconectar se registró otra muerte en el mismo punto y con 0 objetos. Como no estaba recuperando, `sitiosMuerte` se quedó solo con esa entrada y `recuperarPendiente` salió falso.

En el banco M, M2 murió con 205 objetos en (15003, 87, 15082) a las 12:55:55. A las 12:56:16 el servidor lo echó por tiempo agotado, junto a los otros tres. Al volver anotó «muerto con 0 objetos (no volveré)» en ese mismo punto y empezó desde cero.

La secuencia está en los registros; el mecanismo se deduce del código y no se ha reproducido. Falta saber por qué se agotó el tiempo de los cuatro a la vez.
