---
tipo: experimento
fecha: "2026-11-03 23:09"
autor: seppuq
titulo: Banco M del Minero
entorno: minecraft
politica: "perfil minero v2, capataz en modo libre, sin red; 4 bots × 2 rotaciones, monstruos activos"
N: 2
semilla: ""
metrica: pruebas que pasan
valor: 2/2
base: todas
veredicto: mejora
fuente: servidor-supervivencia/logs/rol-minero-20261103-2147.json
---
# Banco M del Minero

Puerta banco M del Minero: hierro crudo + lingotes en el inventario al acabar 2 días ≥ 24 en ≥ 6/8, y 0 muertes por lava: pasa (2/2 pruebas).

| prueba | pasa | detalle |
|---|---|---|
| hierro ≥ 24 en ≥ 6/8 | sí | 6/8; finales 0, 15, 32, 33, 33, 34, 34, 52; mediana 33 |
| 0 muertes por lava | sí | 0 muertes por lava y 0 muertes en total |

Fuente: `servidor-supervivencia/logs/rol-minero-20261103-2147.json`

## Conclusión

Pasa justo, 6/8 sin ninguna muerte en 2 días con noches y monstruos, y sin margen: un bot menos y no pasaría. Es la primera medida completa del Minero; no se ha comparado con una base. Los dos fallos:

- **M3, rotación 1 (0 de hierro, máximo 3).** Gastó sus 3 de hierro en el pico, se encontró agua bajando por `m_pozo` y, tras varios `subir_a_superficie` fallidos, acabó en y≈318, junto al techo del mundo. Allí repitió `hueco`, «sin suelo seco» y «suelo peligroso» (426 veces) hasta el final. El registro muestra la subida desde y≈70 con recolocaciones del servidor, pero no por qué no paró: causa sin confirmar. Solo le pasó a este bot.
- **M2, rotación 2 (15 de hierro, máximo 32).** Llevaba 14 lingotes y 18 de hierro crudo; `fundir hierro 18` acabó en «tiempo agotado» y el crudo dejó de contar. Hipótesis sin comprobar: se quedó en el horno. `conseguir` lo dio además por «éxito: hecho (14/32)».

`fundir` cortado («amenaza» o «tiempo agotado») salió también en M1 (rotación 2) y M4 (rotación 2, cobre), sin dejarlos bajo el criterio. Se confirma lo ya conocido: `m_pico_diamante` se marca con el pico de hierro.

Siguiente: el usuario decide si se arreglan estos dos fallos o se pasa a F8.1 Casual. No se ha repetido nada.
