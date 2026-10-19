// Mundo de Minecraft de este proceso (F7.0): un solo punto de resolución para el servidor y los datos de cada mundo.
// IO_SERVIDOR (la misma variable que servidor/rcon.py y entrenamiento/mundo.py): sin valor o «usuario», el mundo pacífico del
// usuario (localhost:25565); «supervivencia», el mundo de pruebas aparte (../servidor-supervivencia, 25566).
// Los datos de cada mundo están en ../mundos/<nombre>/: zonas.json, cofres.json, obras.json, diario.md (y mundo.json en el de
// supervivencia). En mundos/usuario/ son enlaces a los archivos de siempre (../zonas.json…, ../mente/diario.md): cada ruta se
// resuelve al archivo real, para que escribir no rompa el enlace. Si falta el enlace, el mundo del usuario vuelve a su archivo
// de siempre (así nunca se queda sin zonas protegidas); el de supervivencia nunca lee ni escribe nada del usuario.
const fs = require('fs')
const path = require('path')

const RAIZ = path.join(__dirname, '..')
const MUNDOS = { usuario: { puertoMc: 25565 }, supervivencia: { puertoMc: 25566 } }
const HEREDADOS = { // solo para el mundo del usuario
  'zonas.json': path.join(RAIZ, 'zonas.json'), 'cofres.json': path.join(RAIZ, 'cofres.json'),
  'obras.json': path.join(RAIZ, 'obras.json'), 'diario.md': path.join(RAIZ, 'mente', 'diario.md'),
}
const nombre = process.env.IO_SERVIDOR || 'usuario'
if (!MUNDOS[nombre]) throw new Error(`IO_SERVIDOR desconocido: ${nombre} (usuario o supervivencia)`)
const carpetaDatos = path.join(RAIZ, 'mundos', nombre)

// Ruta real de un archivo de datos de este mundo (sigue los enlaces).
function ruta(archivo) {
  const p = path.join(carpetaDatos, archivo)
  try { return fs.realpathSync(p) } catch (_) {}
  return nombre === 'usuario' && HEREDADOS[archivo] ? HEREDADOS[archivo] : p
}

module.exports = {
  nombre, carpetaDatos, puertoMc: MUNDOS[nombre].puertoMc, ruta,
  diario: ruta('diario.md'), zonas: ruta('zonas.json'), cofres: ruta('cofres.json'), obras: ruta('obras.json'),
  // el mundo del usuario conserva los nombres de siempre; los demás llevan su nombre (entrenamiento/ejecuciones/modos-supervivencia-…)
  sufijo: nombre === 'usuario' ? '' : '-' + nombre,
}
