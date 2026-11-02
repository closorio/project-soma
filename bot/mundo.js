// Mundo de Minecraft de este proceso (F7.0): un solo punto de resolución para el servidor y los datos de cada mundo.
// IO_SERVIDOR (la misma variable que servidor/rcon.py y entrenamiento/mundo.py): sin valor o «usuario», el mundo pacífico del
// usuario (localhost:25565); «supervivencia», el mundo de pruebas aparte (../servidor-supervivencia, 25566); «companero», el
// server Java de un compañero por wifi (2026-10-23); «local», el servidor propio de F8 (servidor-local/, 26.1.2, 25567). En los
// dos, host, puerto y versión de Minecraft salen de mundos/<nombre>/mundo.json
// (`servidor: {host, puerto, version}`); IO_HOST, IO_PORT_SERVIDOR e IO_VERSION (io.js) los sobreescriben. mineflayer 4.39 llega
// hasta la 26.1 (protocolo 775): el server del compañero tiene que estar en 26.1.x.
// A0 del asistente (PLAN_asistente.md, 2026-10-31): el mundo del usuario es vanilla 26.3 (servidor/, 25565) y el bot entra por
// ViaProxy (servidor/proxy/, 25568), que traduce de 26.1 a 26.3. Si mundos/usuario/mundo.json tiene `servidor`, manda él;
// si no, quedan los valores de siempre (1.21.11, 25565). `servidor.tick_end: true` enciende bot/tick_end.js (lo exige 26.3).
// Los datos de cada mundo están en ../mundos/<nombre>/: zonas.json, cofres.json, obras.json, diario.md (y mundo.json en el de
// supervivencia). En mundos/usuario/ son enlaces a los archivos de siempre (../zonas.json…, ../mente/diario.md): cada ruta se
// resuelve al archivo real, para que escribir no rompa el enlace. Si falta el enlace, el mundo del usuario vuelve a su archivo
// de siempre (así nunca se queda sin zonas protegidas); el de supervivencia nunca lee ni escribe nada del usuario.
const fs = require('fs')
const path = require('path')

const RAIZ = path.join(__dirname, '..')
const MUNDOS = {
  usuario: { host: 'localhost', puertoMc: 25565, version: '1.21.11', desdeMundoJsonSiHay: true },
  supervivencia: { host: 'localhost', puertoMc: 25566, version: '1.21.11' },
  companero: { desdeMundoJson: true }, // host, puerto y versión en mundos/companero/mundo.json
  local: { desdeMundoJson: true }, // F8: servidor-local/ (26.1.2, 25567; RCON 25577), en mundos/local/mundo.json
  paper: { desdeMundoJson: true }, // 2026-11-01: servidor-paper/ (Paper 26.3 local, 25570; RCON 25580), por ViaProxy en 25571
}
const HEREDADOS = { // solo para el mundo del usuario
  'zonas.json': path.join(RAIZ, 'zonas.json'), 'cofres.json': path.join(RAIZ, 'cofres.json'),
  'obras.json': path.join(RAIZ, 'obras.json'), 'diario.md': path.join(RAIZ, 'mente', 'diario.md'),
}
const nombre = process.env.IO_SERVIDOR || 'usuario'
if (!MUNDOS[nombre]) throw new Error(`IO_SERVIDOR desconocido: ${nombre} (usuario, supervivencia, companero, local o paper)`)
const carpetaDatos = path.join(RAIZ, 'mundos', nombre)

// Servidor de Minecraft de este mundo: fijo en MUNDOS o, en el del compañero, el `servidor` de su mundo.json.
function servidor() {
  const m = MUNDOS[nombre]
  const archivo = path.join(carpetaDatos, 'mundo.json')
  const fijo = { host: m.host, puertoMc: m.puertoMc, version: m.version, tickEnd: false }
  if (!m.desdeMundoJson && !(m.desdeMundoJsonSiHay && fs.existsSync(archivo))) return fijo
  let d
  try { d = JSON.parse(fs.readFileSync(archivo, 'utf8')) } catch (e) { throw new Error(`${archivo}: no se puede leer (${e.message})`) }
  const sv = d.servidor
  if (!sv && m.desdeMundoJsonSiHay) return fijo
  return { host: (sv || {}).host || null, puertoMc: parseInt((sv || {}).puerto) || 25565, version: (sv || {}).version || '26.1',
    tickEnd: (sv || {}).tick_end === true } // host null: io.js avisa
}
const SERVIDOR = servidor()
// Reglas del mundo (P2 del asistente, 2026-10-31): «libres» son las de supervivencia (cavar, minar hondo, memoria, reflejos,
// sin rectángulo de obras). Todos los mundos las tienen salvo el del usuario, que las tiene solo si su mundo.json dice
// `"reglas": "libre"` (el mundo 26.3, sin límites: el usuario los pone con !zona). Las zonas vedadas mandan siempre, y
// verter lava en el mundo del usuario sigue prohibido por nombre (habilidades/agua.js).
// IO_REGLAS=duras|libres las fuerza (las pruebas en seco miran así el mundo del usuario con las reglas de siempre).
function reglas() {
  if (process.env.IO_REGLAS === 'duras') return false
  if (process.env.IO_REGLAS === 'libres') return true
  if (nombre !== 'usuario') return true
  try { return JSON.parse(fs.readFileSync(path.join(carpetaDatos, 'mundo.json'), 'utf8')).reglas === 'libre' } catch (_) { return false }
}
const REGLAS_LIBRES = reglas()

// Ruta real de un archivo de datos de este mundo (sigue los enlaces). 2026-11-02: los datos de cada persona (zonas, cofres, obras, árboles,
// personajes, diario) se leen y escriben en su copia «.local» (zonas.local.json, diario.local.md), que no se versiona, como un .env: el
// versionado queda de plantilla y nadie lo vuelve a tocar (así un pull no trae los del compañero). Si falta la copia, se hace del versionado.
const PROPIOS = /^(zonas|cofres|obras|arboles|personajes)\.json$|^diario\.md$/
const local = (p) => p.replace(/(\.[a-z]+)$/, '.local$1')
function propio(p) {
  const l = local(p)
  if (!fs.existsSync(l) && fs.existsSync(p)) { try { fs.copyFileSync(p, l) } catch (_) {} }
  return l
}
function ruta(archivo) {
  const p = path.join(carpetaDatos, archivo)
  let real
  try { real = fs.realpathSync(p) } catch (_) { real = nombre === 'usuario' && HEREDADOS[archivo] ? HEREDADOS[archivo] : p }
  return PROPIOS.test(archivo) ? propio(real) : real
}

module.exports = {
  nombre, carpetaDatos, host: SERVIDOR.host, puertoMc: SERVIDOR.puertoMc, version: SERVIDOR.version, tickEnd: SERVIDOR.tickEnd, reglasLibres: REGLAS_LIBRES, ruta, propio,
  diario: ruta('diario.md'), zonas: ruta('zonas.json'), cofres: ruta('cofres.json'), obras: ruta('obras.json'),
  // el mundo del usuario conserva los nombres de siempre; los demás llevan su nombre (entrenamiento/ejecuciones/modos-supervivencia-…)
  sufijo: nombre === 'usuario' ? '' : '-' + nombre,
}
