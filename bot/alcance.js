// Alcance: de quién es cada cosa. Por ahora, el dueño de un personaje y los aliados de ese dueño (aliados_<dueno>.json por dueño,
// no por mundo: dos dueños en el mismo mundo no mezclan los suyos). Se relee del disco si cambió (otro proceso del mismo dueño) y se
// escribe de forma atómica (temporal + renombrado), así un proceso no pisa lo que guardó otro.
const fs = require('fs')
const path = require('path')

const clave = (x) => String(x == null ? '' : x).trim().toLowerCase()
// el nombre va en el de un archivo: solo letras, cifras y «_» (como un nombre de Minecraft); nada de «..» ni «/»
const seguro = (dueno) => clave(dueno).replace(/[^a-z0-9_]/g, '_') || 'mundo'

// El dueño de un personaje: el primero de sus amos (IO_AMOS), o '' si no tiene.
const duenoDe = (amos) => { for (const a of amos || []) return String(a); return '' }

const leerLista = (ruta) => { try { const l = JSON.parse(fs.readFileSync(ruta, 'utf8')).aliados; return Array.isArray(l) ? l.map(clave).filter(Boolean) : [] } catch (_) { return [] } }

function aliados(carpeta, dueno, { heredado } = {}) {
  const ruta = path.join(carpeta, `aliados_${seguro(dueno)}.json`)
  let marca = null, lista = []
  const cargar = () => {
    let st = null
    try { st = fs.statSync(ruta) } catch (_) {}
    const m = st ? `${st.mtimeMs}:${st.size}` : 'ninguno'
    if (m !== marca) {
      marca = m
      lista = st ? leerLista(ruta) : (heredado ? leerLista(heredado) : []) // sin archivo de dueño aún: el aliados.json de antes, una vez
    }
    return lista
  }
  const guardar = (nueva) => {
    const tmp = `${ruta}.${process.pid}.tmp`
    try { fs.writeFileSync(tmp, JSON.stringify({ aliados: nueva }, null, 1) + '\n'); fs.renameSync(tmp, ruta); marca = null } catch (_) { try { fs.rmSync(tmp, { force: true }) } catch (_e) {} }
  }
  return {
    ruta,
    tiene: (n) => cargar().includes(clave(n)),
    lista: () => [...cargar()],
    // pone (valor=true) o quita (false) a uno o varios; lee, cambia y escribe de una vez
    poner(nombres, valor) {
      const s = new Set(cargar())
      for (const n of [].concat(nombres)) { if (valor) s.add(clave(n)); else s.delete(clave(n)) }
      guardar([...s]); return [...s]
    },
  }
}

module.exports = { aliados, duenoDe, seguro }
