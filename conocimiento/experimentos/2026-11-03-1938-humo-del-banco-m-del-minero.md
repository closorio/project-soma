---
tipo: experimento
fecha: "2026-11-03 19:38"
autor: seppuq
titulo: Humo del banco M del Minero
entorno: minecraft
politica: "capataz@minero"
N: 4
semilla: ""
metrica: pruebas que pasan
valor: 2/4
base: todas
veredicto: dudoso
fuente: servidor-supervivencia/logs/rol-minero-20261103-1938.json
---
# Humo del banco M del Minero

Puerta bench-m-smoke: no pasa (2/4 pruebas).

| prueba | pasa | detalle |
|---|---|---|
| kit y etapas previas | sí | empieza con el kit; la primera etapa pendiente es m_carbon |
| resumen M en el JSON | sí | hierro_final, hierro_max y criterio M |
| sin muertes | no | ahogado a los 90 s, con 19/32 de carbón, y=51 |
| sigue tras morir | no | 8,5 min sin ningún paso del capataz: modo órdenes y bucle de respirar |

Fuente: `servidor-supervivencia/logs/rol-minero-20261103-1938.json`

## Conclusión

El montaje del banco funciona (kit, etapas, resumen), pero el humo saca dos fallos que hacen inútil medir el banco completo todavía. Sin base con la que comparar; un solo bot y un solo punto.

1. **Se ahogó con `e0afbc7`.** Cavando a por carbón llegó a agua en y≈53; `respirar` estuvo 25 s sin salir (2 bloques picados) y murió en y=51. Es el primer «sigo en el agua» del reflejo nuevo. Causa exacta sin aislar.
2. **Tras morir no vuelve a trabajar.** Al ir a recuperar sus cosas pasa a modo órdenes («orden directa del puerto») y el capataz no da ni un paso más en 8,5 min. Mientras, flota en un bucle: `respirar` sale cada 3 s y `apartarse` falla con «sin camino» en milisegundos, de modo que nunca llega a la orilla. El mecanismo exacto del cambio de modo no está trazado. Los registros de Casual de octubre no tienen ninguna recuperación, así que este camino no se había medido con el capataz.

El segundo afecta a cualquier rol con capataz, también al banco K. Siguiente paso: arreglar los dos y repetir el humo antes del banco completo.
