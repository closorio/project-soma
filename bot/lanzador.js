// Lanzador (2026-11-02): el /connect del servidor de otro PC lanza mis bots en este. El plugin (plugin-connect/) manda aquí la petición
// de un jugador cuyo jugadores/<jugador>.json trae «lanzador»: "IP:puerto" (la de este PC); esto comprueba la clave y que los bots son
// míos, y ejecuta mi bot/conectar.sh (mis ajustes de personajes.local.json, mi código). Sin dependencias: http de node.
//   POST /conectar   cabecera x-clave, cuerpo {"jugador": "seppuq", "nombres": ["bots"] | ["Oqva", …], "desconectar": false}
//                    → 200 {"lineas": [lo que dice conectar.sh]} · 403 clave mala o bots de otro · 400 petición mala
// Variables (local.mk): SOMA_LANZADOR_CLAVE (obligatoria; la misma en el config.yml del plugin del servidor), SOMA_LANZADOR_PUERTO
// (3150), IO_DUENOS (quién soy), IO_SERVIDOR (companero). Uso: make launcher-start | launcher-stop
const http = require('http')
const crypto = require('crypto')
const path = require('path')
const { execFile } = require('child_process')

const CLAVE = process.env.SOMA_LANZADOR_CLAVE || ''
const PUERTO = parseInt(process.env.SOMA_LANZADOR_PUERTO) || 3150
const YO = (process.env.IO_DUENOS || '').split(',')[0].trim()
const MUNDO = process.env.IO_SERVIDOR || 'companero'
const SCRIPT = path.join(__dirname, 'conectar.sh')
const NOMBRE = /^[A-Za-z0-9_]{1,16}$/

const igual = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y) }

// Pura: ¿se atiende esta petición? → { args } para conectar.sh o { estado, error }
function validar(clave, cuerpo, { claveBuena = CLAVE, yo = YO } = {}) {
  if (!claveBuena || !igual(clave || '', claveBuena)) return { estado: 403, error: 'clave mala' }
  const { jugador, nombres, desconectar } = cuerpo || {}
  if (!yo || String(jugador || '').toLowerCase() !== yo.toLowerCase()) return { estado: 403, error: `aquí solo se lanzan los bots de ${yo || '(nadie: falta IO_DUENOS)'}` }
  if (!Array.isArray(nombres) || !nombres.length || nombres.length > 16 || !nombres.every(n => NOMBRE.test(String(n)))) return { estado: 400, error: 'nombres no válidos' }
  return { args: [...(desconectar ? ['--desconectar'] : []), '--de', yo, ...nombres.map(String)] }
}

function atender(req, res) {
  const responder = (estado, o) => { res.writeHead(estado, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)) }
  if (req.method !== 'POST' || req.url !== '/conectar') return responder(404, { error: 'POST /conectar' })
  let cuerpo = ''
  req.on('data', (c) => { cuerpo += c; if (cuerpo.length > 4096) req.destroy() })
  req.on('end', () => {
    let o
    try { o = JSON.parse(cuerpo) } catch (_) { return responder(400, { error: 'JSON malo' }) }
    const v = validar(req.headers['x-clave'], o)
    if (v.error) { console.log(`[lanzador] ${req.socket.remoteAddress}: ${v.error}`); return responder(v.estado, { error: v.error }) }
    console.log(`[lanzador] ${req.socket.remoteAddress}: conectar.sh ${v.args.join(' ')}`)
    execFile('/usr/bin/bash', [SCRIPT, ...v.args], { env: { ...process.env, IO_SERVIDOR: MUNDO, IO_DUENOS: YO }, timeout: 30000 }, (err, stdout) => {
      const lineas = String(stdout || '').split('\n').filter(Boolean)
      if (err && !lineas.length) lineas.push('conectar.sh falló: ' + err.message)
      responder(200, { lineas })
    })
  })
}

module.exports = { validar }

if (require.main === module) {
  if (!CLAVE) { console.error('falta SOMA_LANZADOR_CLAVE (en local.mk: export SOMA_LANZADOR_CLAVE = …)'); process.exit(1) }
  if (!YO) { console.error('falta IO_DUENOS (en local.mk)'); process.exit(1) }
  http.createServer(atender).listen(PUERTO, '0.0.0.0', () => console.log(`[lanzador] bots de ${YO} en ${MUNDO}, escuchando en :${PUERTO}`))
}
