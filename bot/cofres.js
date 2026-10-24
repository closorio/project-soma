// Cofres donde los personajes guardan lo recogido (habilidad depositar). Se leen de cofres.json de los datos del mundo
// (bot/mundo.js: ../cofres.json en el del usuario) y se releen solos cuando cambia.
//   { cofres: [{ nombre, bloques: [[x, y, z], …] }] }   (un contenedor por entrada: un cofre doble son 2 bloques; se abre por el primero)
const fs = require('fs')
const RUTA = require('./mundo').cofres
let cache = { mtime: -1, lista: [] }

function lista() {
  try {
    const st = fs.statSync(RUTA)
    if (st.mtimeMs !== cache.mtime) cache = { mtime: st.mtimeMs, lista: JSON.parse(fs.readFileSync(RUTA, 'utf8')).cofres || [] }
  } catch (_) { cache = { mtime: -1, lista: [] } }
  return cache.lista
}
const esCofre = (x, y, z) => lista().some(c => c.bloques.some(([a, b, d]) => a === x && b === y && d === z))

// F8.0b: apunta un cofre que ha puesto un personaje (habilidad poner); no repite uno que ya esté. Escritura de golpe (tmp + rename).
function registrar(nombre, bloques) {
  if (bloques.some(([x, y, z]) => esCofre(x, y, z))) return false
  let datos = { cofres: [] }
  try { datos = JSON.parse(fs.readFileSync(RUTA, 'utf8')) } catch (_) {}
  datos.cofres = [...(datos.cofres || []), { nombre, bloques }]
  const tmp = `${RUTA}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(datos, null, 1) + '\n')
  fs.renameSync(tmp, RUTA)
  cache = { mtime: -1, lista: [] }
  return true
}

module.exports = { lista, esCofre, registrar, RUTA }
