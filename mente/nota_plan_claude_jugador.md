# Nota para el plan del agente «Claude» (añadida por Ío, 2026-10-15, a petición del usuario)

> Nota (2026-10-15): este personaje se llama ahora **Alma** (femenina, puerto 3004; carpeta mente/alma). Io = Soma, Claude = Alma.

Idea de fondo del usuario: **cuerpo y mente**. El modelo entrenado y las habilidades son el cuerpo (reflejos rápidos, gratis); Claude es la mente deliberativa (metas, estrategia, memoria, explicación). La red pequeña que estamos entrenando debe ser el **motor del cuerpo**, y Claude debe usarlo, no sustituirlo.

Qué incluir en el plan:
- Claude **no manda cada paso**: fija una meta con `perfil NOMBRE` + `modo libre` (la red decide sola durante N minutos) y revisa el resultado; usa `orden` solo para lo concreto (guardar, ir, tala N).
- **Informe periódico del cuerpo hacia la mente**: resumen compacto (qué ha hecho, qué ve, qué fallos tiene, inventario, salud, amenazas) cada N minutos o ante un evento (amenaza, cofres llenos, bloqueado). Puede ser un archivo en `mente/` o un comando del puerto (`resumen`).
- **Bucle mente-cuerpo**: percibir/resumen → decidir meta → fijar perfil/modo/orden → esperar → leer resultado → anotar aprendizaje en la memoria propia de Claude.
- Claude **aprende de los fallos del cuerpo** (qué habilidad falla dónde) y lo anota; si un fallo es recurrente, propone reentrenar o añadir una habilidad en vez de forzar a mano.
- Medir si la mente aporta: comparar un tramo solo con la red en modo libre frente al mismo tramo con Claude fijando metas.
- Mantener las reglas: zonas protegidas, cofres, no tocar la red ni `politica_habilidades.json`, no mezclar con el servidor de los experimentos hasta que acabe el trabajador 211318.
