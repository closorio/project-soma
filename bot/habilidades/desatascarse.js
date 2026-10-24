// desatascarse (F8.0b, E0): para cuando no hay camino a ningún lado (túnel cerrado, hoyo, cueva sin salida a la vista). Si ya ve el
// cielo y tiene sitio para andar, no hace nada («ya libre»). Si no, sube hasta el cielo: por escalera picada (subir_a_superficie) y,
// si eso no puede, en pilar. Lo usa explorar cuando falla en todos los rumbos; también por orden («desatáscate»).
// Devuelve { exito, causa, modo: 'ya libre'|'escalera'|'pilar', y, rotos, puestos }.
const { subirASuperficie, alCielo } = require('./escalera')
const { nodo } = require('./comun')

module.exports = async function desatascarse(bot, args, tarea) {
  if (alCielo(bot)) return { exito: true, causa: 'ya libre', modo: 'ya libre', y: nodo(bot).y, rotos: [], puestos: [] }
  const r = await subirASuperficie(bot, args || [], tarea)
  return { ...r, causa: r.exito ? 'fuera' : r.causa }
}
