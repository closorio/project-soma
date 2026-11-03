// cavar_tunel [rumbo] [largo=32] [mena] (2026-11-02, el recolector avanzado: bot/conseguir.js): un túnel recto de 1×2 a la altura de
// los pies, hacia el rumbo (norte, este, sur, oeste; por defecto hacia donde mira), hasta `largo` casillas (≤ 64). Al revés que
// cavar_escalera, la lava y el agua no lo paran: antes de abrir una casilla tapa con un bloque de relleno (sv.colocables) cada líquido
// que la toque, y solo para («lava delante») si no puede taparlo. Sin suelo delante, lo pone. Grava encima: la pica hasta que deje de
// caer (escalera.abrir). Antorcha cada 8. Con `mena` (diamond_ore…; vale su deepslate_), para en cuanto ve una a ≤ 5 que se pueda
// tocar (causa «veo mena»): la pica ir_a_mena, que sigue la veta.
// Éxito: llegué al largo o veo la mena. Fallos: lava/agua delante (sin relleno) · protegido · sin herramienta · hueco · atasco · cancelado.
// Devuelve { exito, causa, largo, tapados, antorchas, peligros, rotos, puestos, s }.
const { goals } = require('mineflayer-pathfinder')
const { nodo, moverHasta, prudentes } = require('./comun')
const { colocar } = require('./colocar')
const { abrir, liquidoJunto, dirDe } = require('./escalera')
const sv = require('./sv')

const MAX_LARGO = 64, MAX_MS = 300000, ANTORCHA_CADA = 8, VISTA = 5
const LADOS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]

// Tapa los líquidos que tocan la casilla v (y la propia v). Devuelve true o el líquido que no pudo tapar.
async function tapar(bot, v, ctx) {
  for (let vuelta = 0; vuelta < 3; vuelta++) {
    const l = liquidoJunto(bot, v)
    if (!l) return true
    for (const [dx, dy, dz] of [[0, 0, 0], ...LADOS6]) {
      const w = v.offset(dx, dy, dz), k = bot.blockAt(w)
      if (!k || !sv.esLiquido(k)) continue
      const it = sv.colocables(bot).filter(i => !/_planks$/.test(i.name)).pop() || sv.colocables(bot)[0] // la piedra antes que la tierra
      if (!it) { ctx.peligros.push({ tipo: l, pos: [w.x, w.y, w.z] }); return l }
      const r = await colocar(bot, w, it.name)
      if (r.exito) { ctx.tapados++; ctx.puestos.push([w.x, w.y, w.z, it.name]) } else ctx.peligros.push({ tipo: l, pos: [w.x, w.y, w.z], causa: r.causa })
    }
  }
  const l = liquidoJunto(bot, v)
  return l || true
}

function veoMena(bot, mena) {
  if (!mena) return null
  const base = mena.replace(/^deepslate_/, '')
  return bot.findBlock({ matching: (b) => b && (b.name === base || b.name === 'deepslate_' + base), maxDistance: VISTA,
    useExtraInfo: true }) || null
}

async function cavarTunel(bot, [rumbo, largo0, mena], tarea) {
  const t0 = Date.now(), largo = Math.min(MAX_LARGO, parseInt(largo0) || 32), [dx, dz] = dirDe(bot, rumbo === '-' ? null : rumbo)
  const ctx = { pasos: [], rotos: [], puestos: [], peligros: [], antorchas: 0, tapados: 0 }
  let causa = null
  while (!causa) {
    if (tarea && tarea.cancelada) { causa = 'cancelado'; break }
    const m = veoMena(bot, mena)
    if (m && sv.puedeTocar(m.position.x, m.position.y, m.position.z)) { causa = 'veo mena'; break }
    if (ctx.pasos.length >= largo) { causa = 'llegué'; break }
    if (Date.now() - t0 > MAX_MS) { causa = 'tiempo agotado'; break }
    const b = nodo(bot), sig = b.offset(dx, 0, dz), cabeza = sig.offset(0, 1, 0), suelo = sig.offset(0, -1, 0)
    for (const v of [cabeza, sig, suelo]) {
      const r = await tapar(bot, v, ctx)
      if (r !== true) { causa = r + ' delante'; break }
    }
    if (causa) break
    for (const v of [cabeza, sig]) {
      const r = await abrir(bot, v, ctx, tarea)
      if (r !== true) { causa = r; break }
    }
    if (causa) break
    if (!sv.solido(bot.blockAt(suelo))) {
      const it = sv.colocables(bot)[0]
      const r = it ? await colocar(bot, suelo, it.name) : { exito: false }
      if (!r.exito) { causa = 'hueco'; break }
      ctx.puestos.push([suelo.x, suelo.y, suelo.z, it.name])
    }
    const mv = await moverHasta(bot, new goals.GoalBlock(sig.x, sig.y, sig.z), () => nodo(bot).equals(sig), { ms: 6000, tarea, mov: prudentes(bot) })
    if (mv !== 'listo') { causa = 'atasco: ' + mv; break }
    ctx.pasos.push([sig.x, sig.y, sig.z])
    if (ctx.pasos.length % ANTORCHA_CADA === 0 && bot.inventory.items().some(i => i.name === 'torch')) {
      const r = await colocar(bot, b, 'torch')
      if (r.exito) { ctx.antorchas++; ctx.puestos.push([b.x, b.y, b.z, 'torch']) }
    }
  }
  return { exito: causa === 'llegué' || causa === 'veo mena', causa, largo: ctx.pasos.length, tapados: ctx.tapados, antorchas: ctx.antorchas,
    peligros: ctx.peligros, rotos: ctx.rotos, puestos: ctx.puestos, s: +((Date.now() - t0) / 1000).toFixed(1) }
}

module.exports = { cavarTunel, tapar, veoMena }
