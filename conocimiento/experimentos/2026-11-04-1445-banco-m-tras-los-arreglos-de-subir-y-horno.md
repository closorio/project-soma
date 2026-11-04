---
tipo: experimento
fecha: "2026-11-04 14:45"
autor: seppuq
titulo: Banco M tras los arreglos de subir y horno
entorno: minecraft
politica: "perfil minero v2, capataz en modo libre, sin red; 4 bots × 2 rotaciones, monstruos activos; con los arreglos de subir y horno"
N: 2
semilla: ""
metrica: pruebas que pasan
valor: 1/2
base: todas
veredicto: dudoso
fuente: servidor-supervivencia/logs/rol-minero-20261104-1324.json
---
# Banco M tras los arreglos de subir y horno

Puerta banco M del Minero: hierro crudo + lingotes en el inventario al acabar 2 días ≥ 24 en ≥ 6/8, y 0 muertes por lava: no pasa (1/2 pruebas).

| prueba | pasa | detalle |
|---|---|---|
| hierro ≥ 24 en ≥ 6/8 | no | 3/8; finales 0, 0, 0, 0, 4, 32, 32, 33; mediana 4; máximos 0, 1, 7, 32, 32, 32, 33, 33 |
| 0 muertes por lava | sí | 0 por lava; 6 muertes en total: 2 esqueleto, 2 ahogado, 1 creeper, 1 drowned |

Fuente: `servidor-supervivencia/logs/rol-minero-20261104-1324.json`

## Conclusión

No pasa: 3/8 y 6 muertes, frente a 6/8 y 0 del banco anterior. **No es una comparación válida:** las zonas son otras (x≈4276 y 15036, frente a 40660 y 51580) y este terreno tiene más agua. Tampoco se atribuye a los arreglos: en los registros no aparecen «al descubierto», «horno ocupado» ni «me faltan», aunque no se ha medido el código viejo en este terreno. La conclusión segura es que el 6/8 anterior no era tan sólido como parecía.

Los 5 fallos:
- **M2 y M4, rotación 1 (llegaron a 33 y 32, acaban en 0):** murieron y **no recuperaron sus cosas**; M4 llevaba 477 objetos. Al reaparecer, la agenda «recuperar mis cosas» se abandona con «Dejo … por la orden nueva» cuando entra una rutina de noche (`rutina_noche` interrumpida), y el bot vuelve a libre, como si la hubiera terminado. Es el fallo que más pesa, sin arreglar.
- **M4, rotación 2 (máximo 1):** al morir reapareció en el spawn del mundo (26, 70, 37), a unos 21 000 bloques del trabajo, pese a `spawnpoint`. Causa sin mirar.
- **M3, rotación 2 (0):** mucho tiempo perdido en agua: 36 `ir_a_mena` de carbón cancelados y `respirar` repetido. Acabó `m_carbon` tarde y se le acabaron los días en la etapa `hierro`.
- **M1, rotación 2 (4, máximo 7):** se queda en `m_pozo`, sin mirar más.

Antes del horno, dos bots se quedaron sin sitio para ponerlo («no pude poner el horno: sin sitio» y «sin sitio para la mesa»), lo que ya salió en el banco anterior.

Siguiente: el usuario decide. Propuesta: arreglar que la recuperación se abandone y medir con las mismas zonas para poder comparar.
