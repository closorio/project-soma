---
tipo: decision
fecha: "2026-11-02"
autor: "seppuq"
estado: vigente
fases: []
---
# Órdenes con un LLM local, opcional

## Contexto
`bot/ordenes.js` entiende las órdenes con regex y diccionarios: pide casi la frase exacta. Plurales raros, sinónimos o erratas
(«quédense quietos», «acércate a mí», «sentinela») acababan en «No reconozco». seppuq tiene Ollama con `qwen3:4b` y lo usa
también para otras cosas, así que el cambio no podía tocar su configuración.

## Decisión
Respaldo opcional, **apagado por defecto**: solo si existe la variable `SOMA_OLLAMA_MODELO`. Cuando `interpretarVarias` devuelve
`null`, `Personaje.ordenar` (`bot/io.js`) pide a Ollama (`bot/interprete_llm.js`) que reescriba la frase como una orden canónica y esa
vuelve a pasar por el parser, que es quien valida. El LLM no ejecuta nada: si inventa una orden, sale el «No reconozco» de siempre.
Las órdenes que el parser ya entiende no llaman al modelo.

Sin la variable el comportamiento es idéntico al de antes (`activo()` es falso y no hay ninguna petición de red).

### Cómo activarlo (cada persona, en su máquina)
1. Tener Ollama corriendo con un modelo (probado con `qwen3:4b`).
2. Crear `local.env` en la raíz (está en `.gitignore`) con `SOMA_OLLAMA_MODELO=qwen3:4b`. `bot/conectar.sh` lo carga al lanzar
   los bots con `/connect`. Con `make bots`, `export SOMA_OLLAMA_MODELO = qwen3:4b` en `local.mk`.
3. Reconectar los bots: uno ya en marcha conserva el código y el entorno viejos.

Otras variables: `SOMA_OLLAMA_URL` (por defecto `http://127.0.0.1:11434`), `SOMA_OLLAMA_TIMEOUT_MS` (4000), `SOMA_OLLAMA_KEEP_ALIVE` (2m).
Para apagarlo, quitar la línea de `local.env`.

### Aislamiento de Ollama
No crea modelos, alias ni Modelfiles. Los parámetros (`think:false`, `temperature:0`, `num_ctx:2048`, `num_predict:80`, `keep_alive`,
`format:json`) viajan en cada petición, así que no afectan a otros usos del mismo modelo.

### Comprobar
- `node bot/probar_interprete_llm_seco.js`: en seco, con `fetch` simulado (lo recoge `make test`).
- `SOMA_OLLAMA_MODELO=qwen3:4b node bot/probar_interprete_llm_seco.js --vivo`: batería de frases libres contra Ollama (12/12 con `qwen3:4b`).
- Al añadir una orden nueva al parser, conviene añadir un ejemplo a `CANONICAS` en `bot/interprete_llm.js`; si no, el modelo no
  sabe que existe (así pasó con «sentinela» → `modo centinela`). La prueba en seco falla si una canónica no la entiende el parser.

## Alternativas descartadas
- Que el LLM decida y ejecute la acción directamente: sin validación, una alucinación se convertiría en acción en el juego.
- Pasar todas las órdenes por el LLM: añade 200-450 ms a las que ya funcionan y las vuelve no deterministas.
- Un Modelfile o alias propio del proyecto en Ollama: contamina el Ollama compartido con otros proyectos.
- Activarlo por defecto: obligaría a closorio a tener Ollama; es una decisión de cada persona.

## Consecuencias
- Cada persona decide si lo activa; sin Ollama o sin la variable, nada cambia.
- Latencia: ~200-450 ms con el modelo cargado y ~4 s la primera vez (carga en frío), solo en frases que el parser no entendía.
- La lista `CANONICAS` hay que mantenerla a mano junto a `ordenes.js`.
- Se revisaría si el modelo falla en frases frecuentes (ampliar los ejemplos del prompt) o si se quiere otro modelo (`SOMA_OLLAMA_MODELO`).
