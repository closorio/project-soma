---
tipo: aprendizaje
fecha: 2026-10-25
autor: seppuq
fuente: "servidor-supervivencia/logs/bots-rol-casual-0.log (banco K, medida 8); bot/habilidades/atacar.js pelear; bot/habilidades/cazar.js; commit 304db16"
---
# Una presa que desaparece no está muerta

`pelear` (`atacar.js`) da la entidad por muerta si desaparece menos de 1,5 s después de un golpe, porque el aviso `entityDead` no siempre llega. Con monstruos vale. Con animales en ladera, no: la oveja golpeada sale despedida, cae fuera del alcance del cliente y **cuenta como cazada sin soltar nada**.

## Evidencia
- Banco K, medida 8, K1 en una ladera a y = 126: 13 «cazar sheep → éxito: cazado» seguidos y la cama nunca salió, con 2 de lana en el inventario.
- En la medida anterior, el fallo era otro y del mismo sitio: `cazar` buscaba ovejas a 128 bloques y `pelear` se rendía a más de 16 («huyó» en 2 ms).

## Qué hacer con ello
- El éxito de una habilidad de conseguir cosas se mide por **lo que entra en el inventario**, no por lo que dice la pelea. `cazar` cuenta un animal solo si entró lana, carne, cuero o plumas, y falla con «lo perdí sin botín» a la tercera seguida sin nada (`probar_cazar_seco.js`).
- Antes de pelear con algo lejano, acercarse hasta él: el radio de `pelear` (16) es para una pelea, no para una búsqueda.
- Las dos rondas salieron del registro, no de las pruebas en seco. Cuando una etapa no avanza, contar éxitos y fallos por habilidad en el registro (`grep … | sort | uniq -c`) antes de cambiar nada.
