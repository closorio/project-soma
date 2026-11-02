// Prueba en seco del respaldo con LLM (bot/interprete_llm.js, 2026-11-02): con fetch simulado, sin Ollama.
//   node bot/probar_interprete_llm_seco.js          → en seco
//   node bot/probar_interprete_llm_seco.js --vivo   → batería de frases contra tu Ollama (SOMA_OLLAMA_MODELO=qwen3:4b)
const ordenes = require('./ordenes')
const llm = require('./interprete_llm')
let pruebas = 0, fallos = 0
const ok = (c, m) => { pruebas++; if (!c) { fallos++; console.log('FALLA: ' + m) } }

// Cada canónica debe ser entendida por el parser: si no, el LLM aprendería un ejemplo que luego se rechaza
for (const c of llm.CANONICAS) ok(ordenes.interpretarVarias(c), `canónica no entendida por el parser: «${c}»`)

// Frases libres → tipo esperado (para la batería viva)
const FRASES = {
  'talad unos cinco troncos': ['tala'], 'corta cinco árboles por favor': ['tala'], 'necesito que vengas conmigo': ['ven', 'sigueme'],
  'acércate a mí': ['ven', 'sigueme'], 'mata a los zombis de alrededor': ['ataca'], 'échate a dormir': ['duerme'],
  'ponte a salvo': ['refugiate'], 'construye una casita': ['construye'], 'dime cómo estás': ['estado'], 'quédense quietos': ['quedate'],
  'sígueme': ['sigueme'], 'vayan conmigo': ['sigueme'],
}

async function seco() {
  delete process.env.SOMA_OLLAMA_MODELO
  ok(!llm.activo() && await llm.reformular('talad') === null, 'sin SOMA_OLLAMA_MODELO está apagado y no llama a nadie')
  process.env.SOMA_OLLAMA_MODELO = 'modelo-de-prueba'
  const real = globalThis.fetch
  let llamadas = 0, ultimo = null
  const simular = (contenido, estado = 200) => { globalThis.fetch = async (u, o) => { llamadas++; ultimo = JSON.parse(o.body); return { ok: estado === 200, json: async () => ({ message: { content: contenido } }) } } }

  simular('{"orden": "tala 5 troncos"}')
  ok(await llm.reformular('talad cinco troncos') === 'tala 5 troncos', 'devuelve la orden del modelo')
  ok(ultimo.think === false && ultimo.options.temperature === 0 && ultimo.keep_alive && ultimo.model === 'modelo-de-prueba', 'los parámetros viajan en la petición (nada global)')
  await llm.reformular('talad cinco troncos')
  ok(llamadas === 1, 'la misma frase sale de la caché')
  simular('{"orden": null}'); ok(await llm.reformular('qué bonito día') === null, 'null del modelo → null')
  simular('esto no es json'); ok(await llm.reformular('frase uno') === null, 'JSON roto → null, sin lanzar')
  simular('{"orden": 5}'); ok(await llm.reformular('frase dos') === null, 'orden que no es texto → null')
  simular('{"orden":"x"}', 500); ok(await llm.reformular('frase tres') === null, 'HTTP de error → null')
  globalThis.fetch = async () => { throw new Error('ECONNREFUSED') }
  ok(await llm.reformular('frase cuatro') === null, 'Ollama caído → null, sin lanzar')
  // lo que el modelo invente lo rechaza el parser
  ok(ordenes.interpretarVarias('formatea el disco duro') === null, 'una orden inventada no pasa el parser')
  globalThis.fetch = real
  delete process.env.SOMA_OLLAMA_MODELO
}

async function vivo() {
  if (!llm.activo()) { console.log('Pon SOMA_OLLAMA_MODELO (p. ej. qwen3:4b)'); process.exit(1) }
  let bien = 0
  for (const [f, tipos] of Object.entries(FRASES)) {
    const t0 = Date.now(), r = await llm.reformular(f), l = r && ordenes.interpretarVarias(r)
    const acierto = l && tipos.includes(l[0].tipo)
    if (acierto) bien++
    console.log(`${acierto ? 'OK   ' : 'MAL  '} ${Date.now() - t0}ms «${f}» → «${r}» → ${l ? l[0].tipo : null} (esperaba ${tipos.join('|')})`)
  }
  console.log(`${bien}/${Object.keys(FRASES).length}`)
}

;(process.argv.includes('--vivo') ? vivo() : seco().then(() => {
  console.log(fallos ? `${fallos} fallos de ${pruebas}` : `${pruebas} pruebas, todas bien`)
  process.exit(fallos ? 1 : 0)
}))
