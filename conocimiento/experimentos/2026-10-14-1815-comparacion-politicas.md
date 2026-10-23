---
tipo: experimento
fecha: "2026-10-14 18:15"
autor: seppuq
titulo: comparacion politicas
entorno: simulador
politica: rapida_s1
N: 300
semilla: ""
metrica: nota
valor: 553.45
base: actual
veredicto: pendiente
fuente: entrenamiento/comparacion_politicas.json
---
# comparacion politicas

Comparación en el simulador con `comparar_politicas.py`: 300 mundos emparejados por perfil y equipo; bases 100000, 200000.

| política | nota | fidelidad al guion % (media) | R frente a la referencia (perfiles) |
|---|---|---|---|
| actual | 551.04 | 98.7 | (referencia) |
| original_s0 | 549.61 | 98.2 | -0.17 ± 1.44 |
| rapida_s0 | 551.17 | 98.4 | +1.32 ± 1.12 |
| rapida_s1 | 553.45 | 98.7 | +2.08 ± 1.28 |
| rapida_s2 | 551.7 | 98.2 | +2.10 ± 1.27 |
| rapida_s3 | 549.35 | 98.1 | +1.50 ± 1.20 |

Fuente: `entrenamiento/comparacion_politicas.json`

## Conclusión

(Qué significa, si cambia algo del roadmap y qué se hace después.)
