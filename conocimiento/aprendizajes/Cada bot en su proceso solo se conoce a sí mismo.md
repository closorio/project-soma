---
tipo: aprendizaje
fecha: 2026-11-05
autor: seppuq
fuente: servidor-supervivencia/logs/bots-companero.log
---
# Cada bot en su proceso solo se conoce a sí mismo

## Evidencia
Con Oqva y Soma conectadas desde procesos distintos, a «soma armate» contestaron las dos. `VIVOS` solo tiene los personajes del proceso, así que el de Oqva no veía a Soma y aplicaba el alias `soma → Oqva`. `IO_PROPIOS` tampoco sirve: Oqva lo tenía vacío por haber arrancado antes que Soma.

## Qué hacer con ello
Para saber quién está en el mundo, usar la lista del servidor (`bot.players`), no `VIVOS` ni `IO_PROPIOS`. Vale para cualquier lógica de «¿existe otro bot que…?».
