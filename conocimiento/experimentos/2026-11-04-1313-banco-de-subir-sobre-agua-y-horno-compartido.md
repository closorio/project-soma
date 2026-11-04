---
tipo: experimento
fecha: "2026-11-04 13:13"
autor: seppuq
titulo: Banco de subir sobre agua y horno compartido
entorno: minecraft
politica: "subir_a_superficie y fundir, sin red, sin monstruos"
N: 3
semilla: ""
metrica: pruebas que pasan
valor: 3/3
base: todas
veredicto: mejora
fuente: servidor-supervivencia/logs/subir-horno-20261104-1313.json
---
# Banco de subir sobre agua y horno compartido

Puerta banco de subir y horno, 3/3 por caso: a ≤ 8 bloques sobre el agua al acabar; cada bot con sus 6 y nada del otro: pasa (3/3 pruebas).

| prueba | pasa | detalle |
|---|---|---|
| lago | sí | 3/3, se queda a 0 sobre el agua; sin arreglar 0/3, a 32 por llamada |
| techo | sí | 3/3, pica el bloque y para a 2; caso añadido tras el arreglo, sin medida previa |
| horno | sí | 3/3, cada bot con sus 6; sin arreglar 0/3, cada uno con lo del otro |

Fuente: `servidor-supervivencia/logs/subir-horno-20261104-1313.json`

## Conclusión

Confirma las dos causas de los fallos de [[2026-11-03-2309-banco-m-del-minero]], reproducidas antes de arreglar (`subir-horno-20261104-1301.json` para el horno y `-1302.json` para el lago). Corrige la nota anterior: lo del horno ya no es hipótesis, y el hierro no se quedó dentro, se lo llevó otro bot. Ver [[Un horno compartido se vacía entre bots]].

El primer montaje del lago, con los pies en el agua, daba 3/3 sin arreglo porque ahí el pilar no llega a subir: se descartó. No se ha medido que el bot salga andando del pilar una vez parado.
