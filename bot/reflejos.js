// Reflejos de supervivencia del cuerpo (F7.2, PLAN_F7_supervivencia.md): reglas duras que no decide la red (no puede
// desaprenderlas) ni la mente, como el reflejo de guardar en el cofre. io.js los mira tras cada habilidad y cada 2 s en reposo
// (y enseguida si le golpea un monstruo), con el interruptor `reflejos si|no` (por defecto, sí fuera del mundo del usuario y no en
// él; IO_REFLEJOS=si|no lo fuerza). Esta función solo decide; io.js ejecuta.
// Por orden de urgencia (fuera del refugio; dentro no hace falta nada salvo comer):
//   1 creeper a ≤ 6                         → huir de él (a 12). Nunca se pelea con un creeper.
//   2 le ha golpeado un monstruo o un jugador no aliado (≤ 3 s)    → regla del usuario (2026-10-15): huir si hay MÁS DE 2 hostiles a la vista (≤ 16) o la
//                                             salud es < 8, o si no lleva arma (atacar se niega sin ella); si no, defenderse:
//                                             atacar a quien le golpeó. El daño que no viene de un monstruo (caída, fuego, lava,
//                                             hambre) no cuenta (sv.vigilarGolpes ni lo apunta); tampoco un dueño ni otro personaje.
//   3 salud < 8 con un hostil a ≤ 8         → huir (el reflejo duro del plan)
//   (tras huir por 2 o 3, de noche: refugiarse; refugiarse no empieza con un hostil a ≤ 4)
//   acorralado: si huir ha fallado (en esta ronda o hace < 15 s: no perder otros 2 s buscando salida mientras le pegan) y un
//                hostil (no un creeper) sigue a ≤ 4 → defenderse de él aunque sean más de 2
//                o tenga poca salud (decisión de F7.2: quedarse quieto es peor; en la arena cercada de las pruebas, con 3 zombis,
//                el bot se dejaba matar). Pendiente de confirmar por el usuario.
//   4 lava, borde con caída > 3 o agua honda a ≤ 3 → apartarse (no más de una vez cada 20 s en el mismo sitio)
//   5 hambre ≤ 6 y lleva comida buena       → comer
//   6 un hostil a la vista y un arma mejor que la de la mano → equipar
// Nunca atacar por reflejo salvo para defenderse de un golpe (regla 2).
const { dist, encerrado, hostiles, nodo } = require('./habilidades/comun')
const { hayCaida, liquidos } = require('./observacion')
const sv = require('./habilidades/sv')

const RADIO_CREEPER = 6, SALUD_HUIR = 8, MAS_DE = 2, RADIO_HUIR = 8, HAMBRE = 6, GOLPE_MS = 3000, APARTADO_MS = 20000, ACORRALADO = 4,
  HUIDA_MS = 15000

function peligroTerreno(bot) {
  const b = nodo(bot), { lava, honda } = liquidos(bot, b)
  return lava ? 'lava' : honda ? 'agua honda' : hayCaida(bot, b) ? 'caída' : null
}

// El siguiente reflejo que toca, o null: { habilidad, args, motivo, luego? } (luego: otro reflejo detrás, p. ej. refugiarse tras
// huir de noche). h: la habilidad que acaba de terminar (no se repite lo que la red acaba de hacer: huir tras huir…); hechos: los
// reflejos de esta ronda (cada uno, una vez por ronda).
function siguiente(bot, { h = null, hechos = [] } = {}) {
  if (!bot.entity || !(bot.health > 0)) return null
  const ya = new Set(hechos.map(x => x.habilidad))
  const dentro = encerrado(bot)
  const vistos = sv.aLaVista(bot)
  const conRefugio = (r) => (sv.esNoche(bot) && !ya.has('refugiarse') ? { ...r, luego: { habilidad: 'refugiarse', args: [], motivo: 'de noche, tras huir' } } : r)
  if (!dentro) {
    const creeper = vistos.find(e => sv.tipoHostil(e) === 'creeper' && dist(bot, e) <= RADIO_CREEPER)
    if (creeper && !ya.has('huir')) return { habilidad: 'huir', args: ['creeper', '12', '15'], motivo: `creeper a ${dist(bot, creeper).toFixed(1)}` }
    const fallida = sv.estado(bot).huidaFallida
    const huida = hechos.find(x => x.habilidad === 'huir' && !x.exito) || (fallida && Date.now() - fallida.t < HUIDA_MS ? fallida : null)
    const pegado = vistos.find(e => dist(bot, e) <= ACORRALADO && sv.tipoHostil(e) !== 'creeper')
    if (huida && pegado && !ya.has('atacar') && sv.mejorArma(bot))
      return { habilidad: 'atacar', args: [`id:${pegado.id}`, '20', 'acorralado'], motivo: `acorralado: no pude huir (${huida.causa})` }
    const g = sv.golpeReciente(bot, GOLPE_MS)
    if (g && !ya.has('huir') && !ya.has('atacar')) {
      const atacante = bot.entities[g.id]
      const visible = !!atacante && atacante.isValid !== false && dist(bot, atacante) <= sv.RADIO_N
      const n = vistos.length, arma = sv.mejorArma(bot)
      if (g.tipo === 'creeper') return { habilidad: 'huir', args: ['creeper', '12', '15'], motivo: 'golpe de creeper', golpe: g }
      if (n > MAS_DE || bot.health < SALUD_HUIR || !arma || !visible) {
        const motivo = n > MAS_DE ? `golpe con ${n} hostiles a la vista` : bot.health < SALUD_HUIR ? `golpe con salud ${Math.round(bot.health)}`
          : !arma ? 'golpe sin arma' : 'golpe de alguien que no veo'
        return conRefugio({ habilidad: 'huir', args: ['-', '16', '20'], motivo, golpe: g })
      }
      return { habilidad: 'atacar', args: [`id:${g.id}`, '20'], motivo: `defensa: golpe de ${g.nombre}`, golpe: g }
    }
    const cerca = vistos.find(e => dist(bot, e) <= RADIO_HUIR)
    if (bot.health < SALUD_HUIR && cerca && !ya.has('huir') && h !== 'huir' && h !== 'refugiarse')
      return conRefugio({ habilidad: 'huir', args: ['-', '16', '20'], motivo: `salud ${Math.round(bot.health)} con ${cerca.name} a ${dist(bot, cerca).toFixed(1)}` })
    const peligro = peligroTerreno(bot)
    const ap = sv.estado(bot).apartado
    const reciente = ap && Date.now() - ap.t < APARTADO_MS && bot.entity.position.distanceTo(ap.pos) < 6
    if (peligro && !ya.has('apartarse') && !reciente) return { habilidad: 'apartarse', args: [], motivo: peligro }
  }
  if (bot.food <= HAMBRE && sv.comidas(bot).length && h !== 'comer' && !ya.has('comer'))
    return { habilidad: 'comer', args: [], motivo: `hambre ${bot.food}` }
  if (!dentro && vistos.length && !ya.has('equipar')) {
    const arma = sv.mejorArma(bot)
    if (arma && (!bot.heldItem || bot.heldItem.name !== arma.name)) return { habilidad: 'equipar', args: ['arma'], motivo: `${vistos[0].name} a ${dist(bot, vistos[0]).toFixed(1)}` }
  }
  return null
}

// Apuntar lo hecho (r: su resultado): un golpe respondido (huir, atacar o refugiarse ya son la respuesta), una huida fallida (para
// la regla de acorralado) y dónde se apartó. io.js lo llama tras cada reflejo y tras huir, atacar y refugiarse pedidos por la red.
function anotar(bot, habilidad, r = {}) {
  if (['huir', 'atacar', 'refugiarse'].includes(habilidad)) sv.atendido(bot)
  if (habilidad === 'huir') sv.estado(bot).huidaFallida = r.exito ? null : { t: Date.now(), causa: String(r.causa || '') }
  if (habilidad === 'apartarse') sv.estado(bot).apartado = { t: Date.now(), pos: bot.entity.position.clone() }
  const n = sv.estado(bot).n
  n[habilidad] = (n[habilidad] || 0) + 1
}

module.exports = { siguiente, anotar, peligroTerreno, RADIO_CREEPER, SALUD_HUIR, MAS_DE, RADIO_HUIR, HAMBRE, GOLPE_MS }
