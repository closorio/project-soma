// Mundo de Minecraft de este proceso (F7.0): un solo punto de resolución para el servidor y los datos de cada mundo.
// IO_SERVIDOR (la misma variable que servidor/rcon.py y entrenamiento/mundo.py): sin valor o «usuario», el mundo pacífico del
// usuario (localhost:25565); «supervivencia», el mundo de pruebas aparte (../servidor-supervivencia, 25566); «companero», el
// server Java de un compañero por wifi (2026-10-23); «local», el servidor propio de F8 (servidor-local/, 26.1.2, 25567). En los
// dos, host, puerto y versión de Minecraft salen de mundos/<nombre>/mundo.json
// (`servidor: {host, puerto, version}`); IO_HOST, IO_PORT_SERVIDOR e IO_VERSION (io.js) los sobreescriben. mineflayer 4.39 llega
// hasta la 26.1 (protocolo 775): el server del compañero tiene que estar en 26.1.x.
// Los datos de cada mundo están en ../mundos/<nombre>/: zonas.json, cofres.json, obras.json, diario.md (y mundo.json en el de
// supervivencia). En mundos/usuario/ son enlaces a los archivos de siempre (../zonas.json…, ../mente/diario.md): cada ruta se
// resuelve al archivo real, para que escribir no rompa el enlace. Si falta el enlace, el mundo del usuario vuelve a su archivo
// de siempre (así nunca se queda sin zonas protegidas); el de supervivencia nunca lee ni escribe nada del usuario.
const fs = require('fs')
const path = require('path')

const RAIZ = path.join(__dirname, '..')
const MUNDOS = {
  usuario: { host: 'localhost', puertoMc: 25565, version: '1.21.11' },
  supervivencia: { host: 'localhost', puertoMc: 25566, version: '1.21.11' },
  companero: { desdeMundoJson: true }, // host, puerto y versión en mundos/companero/mundo.json
  local: { desdeMundoJson: true }, // F8: servidor-local/ (26.1.2, 25567; RCON 25577), en mundos/local/mundo.json
}
const HEREDADOS = { // solo para el mundo del usuario
  'zonas.json': path.join(RAIZ, 'zonas.json'), 'cofres.json': path.join(RAIZ, 'cofres.json'),
  'obras.json': path.join(RAIZ, 'obras.json'), 'diario.md': path.join(RAIZ, 'mente', 'diario.md'),
}
const nombre = process.env.IO_SERVIDOR || 'usuario'
if (!MUNDOS[nombre]) throw new Error(`IO_SERVIDOR desconocido: ${nombre} (usuario, supervivencia, companero o local)`)
const carpetaDatos = path.join(RAIZ, 'mundos', nombre)

// Servidor de Minecraft de este mundo: fijo en MUNDOS o, en el del compañero, el `servidor` de su mundo.json.
function servidor() {
  const m = MUNDOS[nombre]
  if (!m.desdeMundoJson) return { host: m.host, puertoMc: m.puertoMc, version: m.version }
  const archivo = path.join(carpetaDatos, 'mundo.json')
  let d
  try { d = JSON.parse(fs.readFileSync(archivo, 'utf8')) } catch (e) { throw new Error(`${archivo}: no se puede leer (${e.message})`) }
  const sv = d.servidor || {}
  return { host: sv.host || null, puertoMc: parseInt(sv.puerto) || 25565, version: sv.version || '26.1' } // host null: io.js avisa
}
const SERVIDOR = servidor()

// Ruta real de un archivo de datos de este mundo (sigue los enlaces).
function ruta(archivo) {
  const p = path.join(carpetaDatos, archivo)
  try { return fs.realpathSync(p) } catch (_) {}
  return nombre === 'usuario' && HEREDADOS[archivo] ? HEREDADOS[archivo] : p
}

module.exports = {
  nombre, carpetaDatos, host: SERVIDOR.host, puertoMc: SERVIDOR.puertoMc, version: SERVIDOR.version, ruta,
  diario: ruta('diario.md'), zonas: ruta('zonas.json'), cofres: ruta('cofres.json'), obras: ruta('obras.json'),
  // el mundo del usuario conserva los nombres de siempre; los demás llevan su nombre (entrenamiento/ejecuciones/modos-supervivencia-…)
  sufijo: nombre === 'usuario' ? '' : '-' + nombre,
}
