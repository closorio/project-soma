// Listas de materiales de las construcciones grandes (bot/materiales/*.json, sacadas de .litematic): qué objetos hacen falta en total.
// «haz una granja de piedra» compara la lista con el inventario y los cofres de HOGAR (habilidad revisar_cofres) y dice qué falta.
const fs = require('fs')
const path = require('path')

const DIR = path.join(__dirname, 'materiales')
const cargar = (nombre) => {
  try { return JSON.parse(fs.readFileSync(path.join(DIR, nombre + '.json'), 'utf8')) } catch (_) { return null }
}
const nombres = () => { try { return fs.readdirSync(DIR).filter(f => f.endsWith('.json')).map(f => f.slice(0, -5)) } catch (_) { return [] } }

// Lo que falta: [{ item, necesito, tengo, falta }] solo de lo que no llega. `stock`: { item: cantidad }.
function faltan(plan, stock) {
  return Object.entries(plan.materiales).map(([item, necesito]) => ({ item, necesito, tengo: stock[item] || 0, falta: Math.max(0, necesito - (stock[item] || 0)) }))
    .filter(x => x.falta > 0)
}
const bonito = (n) => n.replace(/_/g, ' ')
// Frases cortas para el chat (un mensaje del juego admite ~256 caracteres)
function frases(lista, max = 200) {
  const r = []
  let cur = ''
  for (const x of lista.map(x => `${x.falta} ${bonito(x.item)}`)) {
    if (cur && (cur + ', ' + x).length > max) { r.push(cur); cur = x } else cur = cur ? cur + ', ' + x : x
  }
  if (cur) r.push(cur)
  return r
}
module.exports = { cargar, nombres, faltan, frases }
