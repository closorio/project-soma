// ir_a_otro_arbol [pasos=80] (fase C): como ir_a_arbol, pero sin ir a un árbol que sea el objetivo de otro personaje de este
// proceso (el que va a talar o tiene delante; cerebro.objetivo). Sin compañeros es lo mismo que ir_a_arbol.
const cerebro = require('../cerebro')
const irAArbol = require('./ir_a_arbol')
const { companeros } = require('./comun')

module.exports = async function irAOtroArbol(bot, args, tarea) {
  const excluir = companeros(bot).map(cerebro.objetivo).filter(Boolean)
  return { ...(await irAArbol(bot, args, tarea, excluir)), excluidos: excluir.map(v => [v.x, v.y, v.z]) }
}
