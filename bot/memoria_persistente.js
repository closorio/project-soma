// Memoria persistente de cada personaje (F8.0a, PLAN_F8_perfiles.md): lo que debe sobrevivir a reiniciar el proceso (memoria.js
// es la RAM, `bot.yo`, y se pierde al cerrar). Un archivo por personaje y mundo, mundos/<mundo>/memoria_<personaje>.json, escrito
// de golpe (archivo temporal + rename: nunca queda a medias aunque se corte la luz). Esquema v1:
//   { v, personaje, mundo, base, refugio, cofres, horno, mesa, minas, muertes, etapas, actualizado }
// base y refugio salen de la RAM (campamento y refugio) tras cada habilidad; muertes, del evento de muerte; etapas las escribirá
// el capataz (F8.1); cofres, horno, mesa y minas, las habilidades de F8.0b. Al arrancar, base y refugio vuelven a la RAM si allí
// no hay nada. En el mundo del usuario no hace nada (ni lee ni escribe): allí manda lo de siempre.
const fs = require('fs')
const path = require('path')
const mundo = require('./mundo')
const memoria = require('./memoria')

const activo = () => mundo.reglasLibres
const ruta = (personaje) => path.join(mundo.carpetaDatos, `memoria_${personaje}.json`)
const MAX_MUERTES = 50
const vacia = (personaje) => ({ v: 1, personaje, mundo: mundo.nombre, base: null, refugio: null, cofres: [], horno: [], mesa: [],
  minas: [], muertes: [], etapas: {}, actualizado: null })

function cargar(personaje) {
  if (!activo()) return null
  try {
    const d = JSON.parse(fs.readFileSync(ruta(personaje), 'utf8'))
    return { ...vacia(personaje), ...d }
  } catch (e) {
    if (e.code !== 'ENOENT') console.error(`memoria de ${personaje} ilegible (${e.message}): empiezo de cero y guardo la vieja aparte`)
    if (e.code !== 'ENOENT') try { fs.renameSync(ruta(personaje), ruta(personaje) + '.rota') } catch (_) {}
    return vacia(personaje)
  }
}

function guardar(datos) {
  if (!activo() || !datos) return false
  datos.actualizado = new Date().toISOString()
  const f = ruta(datos.personaje), tmp = `${f}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(datos, null, 1) + '\n')
  fs.renameSync(tmp, f)
  return true
}

// La de este personaje (cargada al crearlo con alArrancar); null en el mundo del usuario.
const de = (bot) => (bot && bot.yo && bot.yo.persistente) || null

// Al crear el personaje: carga su memoria y devuelve a la RAM la base y el refugio si allí no hay nada.
function alArrancar(yo) {
  const d = cargar(yo.nombre)
  if (!d) return null
  yo.persistente = d
  if (d.base && !yo.campamento) yo.campamento = d.base
  if (d.refugio && !yo.refugio) yo.refugio = d.refugio
  return d
}

// Tras cada habilidad: copia de la RAM lo que haya cambiado y guarda si cambió algo.
function trasHabilidad(bot) {
  const d = de(bot)
  if (!d) return false
  const yo = memoria(bot), antes = JSON.stringify([d.base, d.refugio])
  d.base = yo.campamento || d.base
  d.refugio = yo.refugio || d.refugio
  return JSON.stringify([d.base, d.refugio]) !== antes ? guardar(d) : false
}

function anotarMuerte(bot, causa = null) {
  const d = de(bot)
  if (!d) return false
  const p = bot.entity && bot.entity.position ? bot.entity.position.floored().toArray() : null
  d.muertes.push({ t: new Date().toISOString(), pos: p, causa, hora: bot.time ? bot.time.timeOfDay : null })
  d.muertes = d.muertes.slice(-MAX_MUERTES)
  return guardar(d)
}

// F8.0b: un sitio que ha puesto el personaje (cofres, horno, mesa, minas): se apunta una vez y se guarda.
function anotarLugar(bot, clave, pos) {
  const d = de(bot)
  if (!d || !Array.isArray(d[clave])) return false
  if (d[clave].some(p => JSON.stringify(p) === JSON.stringify(pos))) return false
  d[clave].push(pos)
  return guardar(d)
}

module.exports = { anotarLugar, activo, ruta, vacia, cargar, guardar, de, alArrancar, trasHabilidad, anotarMuerte, MAX_MUERTES }
