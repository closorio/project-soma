// conseguir MATERIAL [n] (2026-11-02, pedido del usuario: «el recolector avanzado», F8.2 Minero ampliado): «Oqva, consigue 5
// diamantes» y que haga todo lo que se interponga, sin tokens. Un bucle de «¿qué me falta para el siguiente paso?»:
//   1. lo urgente: poca vida → subir y dejarlo con lo que lleve; hambre → comer (o buscar comida arriba); inventario lleno → tirar
//      la basura de piedra (tierra, grava, granito…);
//   2. el pico del nivel (el oro, la redstone, el diamante y la esmeralda piden hierro): sin pico de piedra, «ármate»; para el de
//      hierro, conseguir 3 de hierro (por este mismo bucle), fundirlo y fabricarlo;
//   3. antorchas, si va a bajar a la oscuridad (cota < 30): con carbón, fabricarlas; sin él, conseguir 2 de carbón;
//   4. buscar: ir_a_mena (va cavando hasta la mena a la vista); si no ve ninguna, bajar a la cota del mineral (cavar_escalera, con
//      otro rumbo si topa con lava o agua) y, ya allí, abrir túneles (cavar_tunel, que tapa la lava en vez de pararse);
//   5. al acabar (o rendirse): subir, fundir lo que se funde y entregarlo a quien lo pidió (dar) o, si no está, al cofre (depositar).
// La netherite no: hace falta el Nether (F8.7). siguiente() es puro (lo prueba probar_conseguir_seco.js); ejecutar() lo recorre
// con el `paso` de io.js (las habilidades con su corte por amenaza) y las órdenes compuestas que le pase (armate).
const progresion = require('./progresion')
const { nodo, usosPico } = require('./habilidades/comun')

// Cotas de 1.18+: donde más hay. pico: el nivel de progresion.NIVEL que pide la mena (madera 0,33 · piedra 0,66 · hierro 1).
const MATERIALES = {
  carbon: { mena: 'coal_ore', suelta: ['coal'], pico: 0.33, y: 40 },
  cobre: { mena: 'copper_ore', suelta: ['raw_copper', 'copper_ingot'], pico: 0.66, y: 48, funde: 'cobre' },
  hierro: { mena: 'iron_ore', suelta: ['raw_iron', 'iron_ingot'], pico: 0.66, y: 16, funde: 'hierro' },
  lapis: { mena: 'lapis_ore', suelta: ['lapis_lazuli'], pico: 0.66, y: 0 },
  oro: { mena: 'gold_ore', suelta: ['raw_gold', 'gold_ingot'], pico: 1, y: -16, funde: 'oro' },
  redstone: { mena: 'redstone_ore', suelta: ['redstone'], pico: 1, y: -58 },
  diamante: { mena: 'diamond_ore', suelta: ['diamond'], pico: 1, y: -58 },
  esmeralda: { mena: 'emerald_ore', suelta: ['emerald'], pico: 1, y: null }, // solo en montañas: la que se vea, sin bajar
  netherite: { nether: true },
}
// nombres que se dicen por el chat (sin tildes, como llegan a ordenes.js)
const ALIAS = { carbon: 'carbon', carbones: 'carbon', cobre: 'cobre', hierro: 'hierro', hierros: 'hierro', lapis: 'lapis',
  lapislazuli: 'lapis', oro: 'oro', redstone: 'redstone', 'piedra roja': 'redstone', diamante: 'diamante', diamantes: 'diamante',
  esmeralda: 'esmeralda', esmeraldas: 'esmeralda', netherite: 'netherite', netherita: 'netherite', escombros: 'netherite' }

const BASURA = /^(dirt|gravel|granite|diorite|andesite|tuff|calcite|cobbled_deepslate|flint|rotten_flesh|sand|coarse_dirt)$/
const RELLENO = 16, ANTORCHAS = 4, COTA_OSCURA = 30, HAMBRE = 12, VIDA_SUBIR = 6, HUECOS = 3, MAX_N = 64
const RUMBOS = ['norte', 'este', 'sur', 'oeste']
// 2026-11-03, banco: sin madera abajo no se rehace el pico (ármate 3 troncos, el de hierro 1,5 con palos y mesa): antes de bajar, 5.
// Y con el pico a punto de romperse y sin madera, arriba antes de que se rompa (sin pico no sube en pilar: «sin herramienta»)
const RESERVA = 5, MADERA_PICO = 1.5, USOS_MIN = 24
const MAX_REANUDAR = 8, MAX_BAJADAS = 4, MAX_TUNELES = 6, LARGO_TUNEL = 32, MAX_MS = 30 * 60 * 1000, MAX_PASOS = 120

// Lo que mira siguiente(): un objeto plano, para que la prueba en seco no necesite un bot.
function estado(bot, yInicio) {
  const items = bot.inventory.items(), e = progresion.estado(bot)
  const cuenta = (nombres) => items.filter(i => nombres.includes(i.name)).reduce((a, i) => a + i.count, 0)
  const tiene = {}
  for (const [k, m] of Object.entries(MATERIALES)) if (m.suelta) tiene[k] = cuenta(m.suelta)
  return { tiene, crudo_hierro: cuenta(['raw_iron']), lingotes_hierro: cuenta(['iron_ingot']), pico: e.inv.pico,
    antorchas: e.inv.antorchas, carbon: e.inv.carbon, comida: e.inv.comida, y: nodo(bot).y,
    // la madera en troncos (un tronco = 4 tablones = 8 palos) y lo que le queda al mejor pico
    madera: cuenta(['stick']) / 8 + items.filter(i => /_planks$/.test(i.name)).reduce((a, i) => a + i.count, 0) / 4 + items.filter(i => /_log$/.test(i.name)).reduce((a, i) => a + i.count, 0),
    usosPico: usosPico(bot), repuesto: items.filter(i => /_pickaxe$/.test(i.name)).length > 1,
    // bajar por una ladera no es estar bajo tierra (2026-11-03, banco: subió en pilar al aire libre y se quedó sin poder bajar a talar)
    bajo: yInicio != null && nodo(bot).y < yInicio - 4 && !((bot.blockAt(bot.entity.position) || {}).skyLight >= 14), vida: bot.health, hambre: bot.food,
    huecos: bot.inventory.emptySlotCount(), basura: items.some(i => BASURA.test(i.name)),
    enAgua: !!bot.entity.isInWater || /water/.test((bot.blockAt(bot.entity.position.offset(0, 1.6, 0)) || {}).name || '') }
}

// El siguiente paso para tener n de `material`, o { fin, causa }. s: lo que el bucle lleva apuntado
// ({ noVeo, bajadas, tuneles, rumbo, comidaBuscada, antorchasNo, picoNo }). Devuelve { habilidad, args, motivo } (una habilidad),
// { orden } (una orden compuesta de io.js), { tirar: true } o { sub: { material, n } } (antes, otro material).
function siguiente(e, material, n, s) {
  const m = MATERIALES[material]
  if (!m) return { fin: true, exito: false, causa: `no sé conseguir ${material}` }
  if (m.nether) return { fin: true, exito: false, causa: 'la netherite está en el Nether, y aún no sé ir' }
  if (e.tiene[material] >= n) return { fin: true, exito: true, causa: 'hecho' }
  if (e.vida < VIDA_SUBIR) return { fin: true, exito: false, causa: 'poca vida' }
  // 2026-11-02, banco: empezó en agua honda y ir_a_mena se puso a cavar bajo el agua hasta ahogarse: primero, a tierra
  if (e.enAgua && (s.salirAgua || 0) < 2) return { habilidad: 'explorar', args: ['-', '24', '40'], motivo: 'salir del agua', marca: 'salirAgua' }
  if (e.hambre < HAMBRE && e.comida > 0) return { habilidad: 'comer', args: [], motivo: 'hambre' }
  if (e.hambre < HAMBRE && !s.comidaBuscada) return { habilidad: 'recoger_comida', args: [], motivo: 'hambre sin comida', marca: 'comidaBuscada' }
  if (e.huecos < HUECOS && e.basura && !s.noTirar) return { tirar: true, motivo: 'inventario lleno' }
  // el pico
  if (e.pico < m.pico) {
    if (s.picoNo) return { fin: true, exito: false, causa: `no tengo el pico que hace falta (${s.picoNo})` }
    // 2026-11-03, banco: el pico de piedra se gastó a y≈0 y ármate, que empieza talando, no encontró árboles: arriba, primero
    if (e.pico < 0.66 && e.bajo && e.madera < RESERVA - MADERA_PICO && !s.subidoPico) return { habilidad: 'subir_a_superficie', args: [], motivo: 'reponer el pico', marca: 'subidoPico' }
    if (e.pico < 0.66) return { orden: 'armate', motivo: 'pico de piedra' }
    // 2026-11-03, banco: ármate gasta la madera en las herramientas de piedra y el pico de hierro no tuvo palos (abajo no hay árboles)
    if (e.madera < MADERA_PICO) {
      if (s.maderaNo && s.maderaBuscada) return { fin: true, exito: false, causa: 'no tengo madera para los palos del pico de hierro' }
      // 2026-11-03, banco: «bloqueado» en 4 árboles seguidos desde un mal sitio y se rindió: de otro sitio, una vez más
      if (s.maderaNo) return { habilidad: 'explorar', args: ['-', '24', '40'], motivo: 'buscar árboles', marca: 'maderaBuscada' }
      if (e.bajo && !s.subidoPico) return { habilidad: 'subir_a_superficie', args: [], motivo: 'madera para el pico', marca: 'subidoPico' }
      return { orden: 'tala', n: 2, motivo: 'madera para el pico' }
    }
    if (e.lingotes_hierro >= 3) return { habilidad: 'fabricar', args: ['pico_hierro'], motivo: 'pico de hierro' }
    // 2026-11-03, banco: sin piedra para el horno, fundir fallaba al instante 100 veces seguidas (demasiados pasos): picar piedra, una vez
    if (e.crudo_hierro + e.lingotes_hierro >= 3 && (s.fundirNo || 0) >= 2) return { fin: true, exito: false, causa: `no pude fundir el hierro del pico (${s.fundirCausa})` }
    if (e.crudo_hierro + e.lingotes_hierro >= 3 && s.fundirNo && !s.piedraHorno) return { habilidad: 'minar', args: ['stone', '8', '6', 'y=-64'], motivo: 'piedra para el horno', marca: 'piedraHorno' }
    if (e.crudo_hierro + e.lingotes_hierro >= 3) return { habilidad: 'fundir', args: ['hierro', String(3 - e.lingotes_hierro)], motivo: 'hierro para el pico' }
    return { sub: { material: 'hierro', n: 3 }, motivo: 'hierro para el pico' }
  }
  // antorchas, si va a la oscuridad
  if (m.y !== null && m.y < COTA_OSCURA && e.antorchas < ANTORCHAS && !s.antorchasNo) {
    if (e.carbon > 0) return { habilidad: 'fabricar', args: ['antorcha'], motivo: 'antorchas', marca: 'antorchasIntento' }
    if (material !== 'carbon') return { sub: { material: 'carbon', n: 2 }, motivo: 'carbón para antorchas' }
  }
  // con madera, el de repuesto se hace abajo mientras el viejo aún pica (sin pico no hay hueco para la mesa: 2026-11-03)
  if (e.bajo && e.usosPico < USOS_MIN && !e.repuesto && e.madera >= RESERVA - MADERA_PICO && !s.repuestoHecho)
    return { orden: 'armate', motivo: 'pico de repuesto', marca: 'repuestoHecho' }
  if (e.bajo && e.usosPico < USOS_MIN && e.madera < RESERVA - MADERA_PICO && !s.subidoPico)
    return { habilidad: 'subir_a_superficie', args: [], motivo: 'el pico se va a romper', marca: 'subidoPico' }
  if (m.y !== null && e.y > m.y + 4 && !e.bajo && e.madera < RESERVA && !s.reservaNo)
    return { orden: 'tala', n: Math.ceil(RESERVA - e.madera), motivo: 'madera de reserva antes de bajar' }
  const falta = n - e.tiene[material]
  // buscar: primero la que se vea; luego bajar; luego túneles
  if (!s.noVeo) return { habilidad: 'ir_a_mena', args: [m.mena, '32', String(Math.min(16, falta))], motivo: 'a la mena', marca: 'buscando' }
  const rumbo = RUMBOS[(s.rumbo || 0) % 4]
  if (m.y !== null && e.y > m.y + 4 && (s.bajadas || 0) < MAX_BAJADAS) return { habilidad: 'cavar_escalera', args: [String(m.y), rumbo], motivo: `bajo a y=${m.y}` }
  if (m.y !== null && (s.tuneles || 0) < MAX_TUNELES) return { habilidad: 'cavar_tunel', args: [rumbo, String(LARGO_TUNEL), m.mena], motivo: 'túnel' }
  return { fin: true, exito: false, causa: m.y === null ? `no veo ${material} cerca (está en las montañas)` : `no encontré más ${material}` }
}

// Apunta en s lo que ha pasado con el paso p (resultado r), para que siguiente() elija otro camino.
function apuntar(s, p, r) {
  if (p.marca === 'comidaBuscada') s.comidaBuscada = true
  if (p.marca === 'subidoPico') s.subidoPico = true
  if (p.marca === 'salirAgua') s.salirAgua = (s.salirAgua || 0) + 1
  if (p.habilidad === 'ir_a_mena') s.noVeo = !r.exito || !(r.picadas > 0)
  if (p.habilidad === 'cavar_escalera') {
    s.bajadas = (s.bajadas || 0) + 1; s.noVeo = false // abajo hay otras menas a la vista
    if (!r.exito && r.causa !== 'pico gastado') s.rumbo = (s.rumbo || 0) + 1 // lava, agua o algo protegido: otro rumbo
  }
  if (p.habilidad === 'cavar_tunel') {
    s.tuneles = (s.tuneles || 0) + 1; s.noVeo = false
    if (r.causa !== 'veo mena' && r.causa !== 'pico gastado') s.rumbo = (s.rumbo || 0) + 1 // el siguiente tramo gira: no repite la misma roca
  }
  if (p.motivo === 'antorchas' && !r.exito) s.antorchasNo = true
  if (p.orden === 'armate' && !r.exito && p.motivo !== 'pico de repuesto') s.picoNo = 'de piedra'
  if (p.motivo === 'madera de reserva antes de bajar') { s.reservas = (s.reservas || 0) + 1; if (!r.exito || s.reservas >= 2) s.reservaNo = true }
  else if (p.orden === 'tala' && !r.exito) s.maderaNo = true
  if (p.marca === 'maderaBuscada') { s.maderaBuscada = true; s.maderaNo = false }
  if (p.marca === 'piedraHorno') s.piedraHorno = true
  if (p.marca === 'repuestoHecho') s.repuestoHecho = true
  if (p.habilidad === 'fundir' && !r.exito) { s.fundirNo = (s.fundirNo || 0) + 1; s.fundirCausa = r.causa }
  if (p.motivo === 'pico de hierro' && !r.exito) s.picoNo = 'de hierro: ' + r.causa
}

// Tira la basura de piedra hasta dejar HUECOS libres (sin habilidad: es un instante).
async function tirarBasura(bot) {
  let n = 0
  for (const i of bot.inventory.items().filter(i => BASURA.test(i.name))) {
    if (bot.inventory.emptySlotCount() >= HUECOS + 2) break
    try { await bot.tossStack(i); n += i.count } catch (_) {}
  }
  return n
}

// ctx: { paso(habilidad, args) → [r, d], orden(nombre, n) → r, reanudar() → bool (tras un golpe), decir(texto), quien, tarea, entregar (false: se lo queda) }. Devuelve { exito, causa, conseguidos, pasos }.
async function ejecutar(bot, material, n0, ctx) {
  const n = Math.min(MAX_N, Math.max(1, n0 || 1)), t0 = Date.now(), y0 = nodo(bot).y, pasos = []
  const pila = [{ material, n, s: {} }] // la petición y, encima, lo que haga falta antes (el hierro del pico, el carbón)
  let fin = null, avisado = '', reanudadas = 0
  const decir = (t) => { if (t !== avisado) { avisado = t; ctx.decir(t) } }
  while (!fin) {
    if (ctx.tarea.cancelada) {
      // 2026-11-03: un golpe (io.js alGolpear) corta lo que esté haciendo para defenderse; después, sigue donde iba
      if (ctx.reanudar && reanudadas < MAX_REANUDAR && (await ctx.reanudar())) { reanudadas++; continue }
      fin = { exito: false, causa: 'cancelado' }; break
    }
    if (Date.now() - t0 > MAX_MS) { fin = { exito: false, causa: 'se acabó el tiempo' }; break }
    if (pasos.length >= MAX_PASOS) { fin = { exito: false, causa: 'demasiados pasos' }; break }
    const cima = pila[pila.length - 1], e = estado(bot, y0)
    const p = siguiente(e, cima.material, cima.n, cima.s)
    if (p.fin) {
      if (!p.exito && pila.length > 1) { fin = { ...p, causa: `antes necesitaba ${cima.material}: ${p.causa}` }; break }
      if (pila.length === 1) { fin = p; break }
      pila.pop(); continue
    }
    if (p.sub) {
      if (pila.some(x => x.material === p.sub.material)) { fin = { exito: false, causa: `me falta ${p.sub.material}` }; break }
      decir(`Antes necesito ${p.sub.n} de ${p.sub.material} (${p.motivo}).`)
      pila.push({ ...p.sub, s: {} }); continue
    }
    if (p.tirar) { const k = await tirarBasura(bot); pasos.push({ habilidad: 'tirar', exito: k > 0, causa: `${k} de basura` }); if (!k) cima.s.noTirar = true; continue }
    if (p.orden) {
      decir(p.motivo === 'pico de repuesto' ? 'Me hago un pico de repuesto antes de que se rompa este.' : p.orden === 'armate' ? 'Primero me hago un pico de piedra.' : `Primero, ${p.motivo}.`)
      const r = await ctx.orden(p.orden, p.n)
      pasos.push(...(r.pasos || []), { habilidad: 'orden ' + p.orden, exito: !!r.exito, causa: r.causa || '' }) // cuenta para MAX_PASOS
      if (!ctx.tarea.cancelada) apuntar(cima.s, p, r) // cortada por un golpe: no es un fallo, se repite al reanudar
      continue
    }
    if (/^(cavar_escalera|cavar_tunel)$/.test(p.habilidad)) decir(`Busco ${cima.material}: ${p.motivo}.`)
    let [r, d] = await ctx.paso(p.habilidad, p.args)
    pasos.push(d)
    // lo que se cruza: un monstruo corta la habilidad; defenderse y seguir
    if (/^(amenaza|golpe)$/.test(r.causa || '') && !ctx.tarea.cancelada) {
      const [, da] = await ctx.paso('atacar', []); pasos.push(da)
      continue // sin apuntar el fallo: el paso se repite
    }
    if (ctx.tarea.cancelada) {
      // ídem, pero salir del agua cortado por falta de aire es un intento: nadando sin salir, 8 cortes acabaron el encargo
      if (p.marca === 'salirAgua') cima.s.salirAgua = (cima.s.salirAgua || 0) + 1
      continue
    }
    apuntar(cima.s, p, r)
    const tengo = estado(bot).tiene[material]
    if (tengo > 0 && pila.length === 1 && p.habilidad !== 'comer') decir(`Tengo ${tengo}/${n} de ${material}.`)
  }
  // volver, fundir y entregar
  const m = MATERIALES[material] || {}
  if (!ctx.tarea.cancelada && nodo(bot).y < y0 - 4) { const [, d] = await ctx.paso('subir_a_superficie', []); pasos.push(d) }
  if (!ctx.tarea.cancelada && m.funde && bot.inventory.items().some(i => i.name === m.suelta[0])) {
    const crudo = bot.inventory.items().filter(i => i.name === m.suelta[0]).reduce((a, i) => a + i.count, 0)
    const [, d] = await ctx.paso('fundir', [m.funde, String(crudo)]); pasos.push(d)
  }
  const conseguidos = m.suelta ? estado(bot).tiene[material] : 0
  let entrega = null
  if (!ctx.tarea.cancelada && conseguidos > 0 && ctx.entregar !== false) { // el capataz no entrega: sus etapas miran el inventario
    const objeto = m.suelta.find(nombre => bot.inventory.items().some(i => i.name === nombre && nombre !== m.suelta[0])) || m.suelta.find(nombre => bot.inventory.items().some(i => i.name === nombre))
    if (ctx.quien && bot.players[ctx.quien] && bot.players[ctx.quien].entity) {
      const [r, d] = await ctx.paso('dar', [ctx.quien, objeto]); pasos.push(d); entrega = r.exito ? 'dado' : null
    }
    if (!entrega) { const [r, d] = await ctx.paso('depositar', []); pasos.push(d); entrega = r.exito ? 'cofre' : 'lo llevo' }
  }
  return { exito: !!fin.exito, causa: fin.causa, conseguidos, pedidos: n, entrega, pasos, s: +((Date.now() - t0) / 1000).toFixed(1) }
}

module.exports = { MATERIALES, ALIAS, siguiente, apuntar, estado, ejecutar }
