// cavar_escalera [y_meta] [rumbo] y subir_a_superficie (F8.0b, C4): una escalera de 1×2 picada en la roca, escalón a escalón, hacia
// abajo (y_meta por debajo; por defecto 16 más abajo) o hacia arriba (y_meta por encima). Rumbo: norte, este, sur, oeste (o n, e, s, o;
// por defecto hacia donde mira). Antes de cada escalón mira las casillas que va a abrir y sus vecinas: con lava o agua al lado para
// («lava delante», «agua delante»): nunca abre un hueco junto a un líquido. Bajo el escalón nuevo tiene que haber suelo (si es aire,
// pone un bloque; si no tiene, para con «hueco»). Grava o arena encima: la pica hasta que deje de caer. Nunca pica lo protegido
// (sv.puedeTocar, sv.NO_PICAR). Pone una antorcha cada 8 escalones si lleva. Apunta los escalones en la memoria del personaje (para
// desandarlos) y lo roto/puesto en la respuesta (el banco repone el terreno).
// subir_a_superficie: sube por escalera (al revés de la última que bajó, o hacia donde mira) hasta ver el cielo (nada sólido en 32
// encima de la cabeza); si no puede picar hacia arriba, hace pilar (salir_del_refugio.subirPozo).
// Devuelven { exito, causa, y, pasos, antorchas, peligros, rotos, puestos }.
const { Vec3 } = require('vec3')
const { goals } = require('mineflayer-pathfinder')
const memoria = require('../memoria')
const persistente = require('../memoria_persistente')
const { conLimite, esperar, nodo, moverHasta, prudentes, usosPico } = require('./comun')
const { picar } = require('./picar_tronco')
const { colocar } = require('./colocar')
const sv = require('./sv')

const DIRS = { norte: [0, -1], n: [0, -1], sur: [0, 1], s: [0, 1], este: [1, 0], e: [1, 0], oeste: [-1, 0], o: [-1, 0] }
const MAX_PASOS = 64, MAX_MS = 300000, ANTORCHA_CADA = 8, MAX_PICAR_MS = 8000, CIELO = 32, USOS_PARAR = 12
const LADOS6 = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]
const CAE = /^(sand|red_sand|gravel|suspicious_sand|suspicious_gravel)$/

// El rumbo pedido o, sin él, el punto cardinal hacia el que mira (yaw 0 = norte, -z; π/2 = oeste en mineflayer).
function dirDe(bot, rumbo) {
  if (rumbo && DIRS[rumbo.toLowerCase()]) return DIRS[rumbo.toLowerCase()]
  const yaw = bot.entity.yaw, x = -Math.sin(yaw), z = -Math.cos(yaw)
  return Math.abs(x) > Math.abs(z) ? [Math.sign(x), 0] : [0, Math.sign(z) || -1]
}
// ¿Ve el cielo? Nada sólido (ni líquido) en las CIELO casillas encima de la cabeza; las hojas no cuentan (bajo un árbol no se
// está encerrado: en el banco, bajo un manglar, desatascarse intentaba subir por la copa).
function alCielo(bot) {
  const b = nodo(bot)
  for (let dy = 2; dy <= CIELO; dy++) {
    const k = bot.blockAt(b.offset(0, dy, 0))
    if (k && /_leaves$/.test(k.name)) continue
    if (k && (sv.solido(k) || sv.esLiquido(k))) return false
  }
  return true
}
// ¿Puede salir andando? Una casilla de al lado libre (y libre encima), con suelo firme. Con el cielo a la vista pero en el fondo de
// la zanja de su escalera, todavía no (F8.0b: en el banco paraba 2 bloques por debajo del suelo y no salía).
function salidaLibre(bot) {
  const b = nodo(bot)
  return Object.values({ n: [0, -1], s: [0, 1], e: [1, 0], o: [-1, 0] }).some(([dx, dz]) => {
    const v = b.offset(dx, 0, dz), a = bot.blockAt(v), c = bot.blockAt(v.offset(0, 1, 0)), s = bot.blockAt(v.offset(0, -1, 0))
    return a && a.boundingBox === 'empty' && !sv.esLiquido(a) && c && c.boundingBox === 'empty' && sv.solido(s)
  })
}
const fuera = (bot) => alCielo(bot) && salidaLibre(bot)
const liquidoJunto = (bot, v) => {
  for (const [dx, dy, dz] of [[0, 0, 0], ...LADOS6]) {
    const k = bot.blockAt(v.offset(dx, dy, dz))
    if (k && k.name === 'lava') return 'lava'
    if (k && sv.esLiquido(k)) return 'agua'
  }
  return null
}

// Pica una casilla (con la mejor herramienta), y la grava que caiga encima. Apunta lo roto en ctx.rotos.
async function abrir(bot, v, ctx, tarea) {
  for (let k = 0; k < 8; k++) {
    const b = bot.blockAt(v)
    if (!b || b.boundingBox === 'empty') return true
    if (sv.NO_PICAR.test(b.name) || !sv.puedeTocar(v.x, v.y, v.z)) return 'protegido'
    const { item, ms } = sv.mejorHerramienta(bot, b)
    if (ms > MAX_PICAR_MS) return 'sin herramienta'
    try { if (item && (!bot.heldItem || bot.heldItem.name !== item.name)) await conLimite(bot.equip(item, 'hand'), 3000) } catch (_) {}
    const r = await picar(bot, b, {}, tarea, 0)
    if (!r.exito) return 'no se rompió'
    ctx.rotos.push([v.x, v.y, v.z, b.name])
    if (!CAE.test((bot.blockAt(v.offset(0, 1, 0)) || {}).name || '')) return true
    await esperar(400) // la grava de encima cae a la casilla: otra vez
  }
  return 'no deja de caer'
}

// Un escalón: abre las casillas del siguiente (y las de la cabeza), pone suelo si hace falta y se mueve. Devuelve true o la causa.
async function paso(bot, [dx, dz], sube, ctx, tarea) {
  const b = nodo(bot), sig = b.offset(dx, sube ? 1 : -1, dz)
  // lo que hay que abrir: al bajar, las 3 de delante (cabeza, pies y los pies nuevos); al subir, la de encima de la cabeza y las 2 nuevas
  const abrirLista = sube ? [b.offset(0, 2, 0), sig, sig.offset(0, 1, 0)] : [b.offset(dx, 1, dz), b.offset(dx, 0, dz), sig]
  for (const v of [...abrirLista, sig.offset(0, -1, 0)]) {
    const l = liquidoJunto(bot, v)
    if (l) { ctx.peligros.push({ tipo: l, pos: [v.x, v.y, v.z] }); return l + ' delante' }
  }
  for (const v of abrirLista) {
    if (tarea && tarea.cancelada) return 'cancelado'
    const r = await abrir(bot, v, ctx, tarea)
    if (r !== true) return r
  }
  const suelo = sig.offset(0, -1, 0)
  if (!sv.solido(bot.blockAt(suelo))) {
    const it = sv.colocables(bot)[0]
    if (!it) return 'hueco'
    const r = await colocar(bot, suelo, it.name)
    if (!r.exito) return 'hueco'
    ctx.puestos.push([suelo.x, suelo.y, suelo.z, it.name])
  }
  const m = await moverHasta(bot, new goals.GoalBlock(sig.x, sig.y, sig.z), () => nodo(bot).equals(sig), { ms: 6000, tarea, mov: prudentes(bot) })
  if (m !== 'listo') return 'atasco: ' + m
  ctx.pasos.push([sig.x, sig.y, sig.z])
  if (ctx.pasos.length % ANTORCHA_CADA === 0 && bot.inventory.items().some(i => i.name === 'torch')) {
    const r = await colocar(bot, b, 'torch') // en el escalón de atrás, en el suelo
    if (r.exito) { ctx.antorchas++; ctx.puestos.push([b.x, b.y, b.z, 'torch']) }
  }
  return true
}

async function escalera(bot, { yMeta, dir, hasta }, tarea) {
  const t0 = Date.now(), y0 = nodo(bot).y
  const ctx = { pasos: [], rotos: [], puestos: [], peligros: [], antorchas: 0 }
  const sube = yMeta > y0
  let causa = null
  while (!causa) {
    const y = nodo(bot).y
    if (hasta && hasta()) { causa = 'llegué'; break }
    if (!hasta && (sube ? y >= yMeta : y <= yMeta)) { causa = 'llegué'; break }
    if (tarea && tarea.cancelada) { causa = 'cancelado'; break }
    if (ctx.pasos.length >= MAX_PASOS) { causa = 'pasos agotados'; break }
    // 2026-11-03, banco: el pico se rompía a mitad y, sin él, no hay sitio para la mesa ni se sube: parar antes (conseguir hace otro)
    if (!sube && bot.inventory.items().some(i => /_pickaxe$/.test(i.name)) && usosPico(bot) < USOS_PARAR) { causa = 'pico gastado'; break } // subiendo, nunca: es la salida
    if (Date.now() - t0 > MAX_MS) { causa = 'tiempo agotado'; break }
    const r = await paso(bot, dir, sube, ctx, tarea)
    if (r !== true) causa = r
  }
  const yo = memoria(bot)
  if (ctx.pasos.length) {
    yo.escalera = { dir, sube, pasos: ctx.pasos, t: Date.now() }
    if (!sube) persistente.anotarLugar(bot, 'minas', [...ctx.pasos[0], nodo(bot).y])
  }
  return { exito: causa === 'llegué', causa, y: nodo(bot).y, pasos: ctx.pasos.length, antorchas: ctx.antorchas, peligros: ctx.peligros,
    rotos: ctx.rotos, puestos: ctx.puestos, s: +((Date.now() - t0) / 1000).toFixed(1) }
}

async function cavarEscalera(bot, [yArg, rumbo], tarea) {
  const y0 = nodo(bot).y
  const yMeta = yArg !== undefined && yArg !== '-' && !isNaN(parseInt(yArg)) ? parseInt(yArg) : y0 - 16
  if (yMeta === y0) return { exito: true, causa: 'llegué', y: y0, pasos: 0, antorchas: 0, peligros: [], rotos: [], puestos: [] }
  if (yMeta < bot.game.minY + 1) return { exito: false, causa: 'por debajo del mundo' }
  return escalera(bot, { yMeta, dir: dirDe(bot, rumbo) }, tarea)
}

async function subirASuperficie(bot, [rumbo], tarea) {
  if (fuera(bot)) return { exito: true, causa: 'ya fuera', y: nodo(bot).y, pasos: 0, antorchas: 0, peligros: [], rotos: [], puestos: [] }
  const ultima = memoria(bot).escalera
  const dir = rumbo ? dirDe(bot, rumbo) : ultima && !ultima.sube ? [-ultima.dir[0], -ultima.dir[1]] : dirDe(bot)
  const r = await escalera(bot, { yMeta: Infinity, dir, hasta: () => fuera(bot) }, tarea)
  if (r.exito || r.causa === 'cancelado') return { ...r, modo: 'escalera' }
  // sin escalera (líquido delante, protegido…): pilar recto hacia arriba
  const { subirPozo, paraSubir } = require('./salir_del_refugio')
  if (!paraSubir(bot).length) return { ...r, modo: 'escalera' }
  for (let k = 0; k < 4 && !fuera(bot) && !(tarea && tarea.cancelada) && paraSubir(bot).length; k++) { // subirPozo: ≤ 8 por vez
    const y = nodo(bot).y
    await subirPozo(bot, nodo(bot).offset(0, CIELO, 0), tarea)
    if (nodo(bot).y === y) break
  }
  return { ...r, exito: fuera(bot), causa: fuera(bot) ? 'fuera' : 'pilar: ' + r.causa, modo: 'pilar', y: nodo(bot).y }
}

module.exports = { cavarEscalera, subirASuperficie, alCielo, salidaLibre, fuera, dirDe, paso, escalera, abrir, liquidoJunto, DIRS }
