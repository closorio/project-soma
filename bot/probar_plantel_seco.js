// Prueba en seco del plantel de los mundos compartidos (2026-11-02): jugadores/<jugador>.json de dos jugadores en un mundo temporal;
// bots de cada uno, zonas de todos (las de trabajo, solo las mías), !zona escribe solo el mío, conectar.sh con el plantel (los del otro
// con lanzador no se lanzan aquí) y el lanzador (clave, dueño, nombres). No lanza ningún bot. Uso: node bot/probar_plantel_seco.js
const fs = require('fs'), path = require('path'), { execFileSync } = require('child_process')
const M = '_prueba_plantel', RAIZ = path.join(__dirname, '..'), CARPETA = path.join(RAIZ, 'mundos', M)
process.env.IO_SERVIDOR = 'supervivencia' // para cargar mundo.js; las rutas del plantel y de zonas se cambian abajo
process.env.IO_DUENOS = 'seppuq'
fs.rmSync(CARPETA, { recursive: true, force: true })
fs.mkdirSync(path.join(CARPETA, 'jugadores'), { recursive: true })
const escribir = (j, d) => fs.writeFileSync(path.join(CARPETA, 'jugadores', j + '.json'), JSON.stringify(d))
escribir('seppuq', { bots: [{ nombre: 'Oqva' }, { nombre: 'Iris' }], zonas: [{ nombre: 'CASA', x1: 0, z1: 0, x2: 10, z2: 10, modo: 'vedada' },
  { nombre: 'TALLER', x1: 20, z1: 20, x2: 30, z2: 30, modo: 'trabajo' }], arboles: [], lanzador: '127.0.0.1:3999' })
escribir('__Count', { bots: [{ nombre: 'Trivino', skin: 'trivino' }], zonas: [{ nombre: 'HOGAR', x1: 100, z1: 100, x2: 110, z2: 110, modo: 'vedada' },
  { nombre: 'MINA', x1: 200, z1: 200, x2: 210, z2: 210, modo: 'trabajo' }], arboles: [{ nombre: 'ROBLE', x: 50, y: 64, z: 50 }] })
escribir('EJEMPLO', { bots: [{ nombre: 'MiBot' }] })

const plantel = require('./plantel')
plantel.DIR = path.join(CARPETA, 'jugadores')
const zonas = require('./zonas')

let pruebas = 0, fallos = 0
const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }

try {
  // 1. bots de cada uno
  ok(plantel.compartido() && plantel.jugadores().sort().join() === '__Count,seppuq', `jugadores (sin EJEMPLO): ${plantel.jugadores()}`)
  ok(plantel.mios().join() === 'Oqva,Iris' && plantel.botsDe('__count').join() === 'Trivino', 'bots de cada uno, sin mayúsculas')
  ok(plantel.duenoDe('trivino') === '__Count' && plantel.duenoDe('Nadie') === null, 'dueño de un bot')
  ok(plantel.lanzadorDe('seppuq') === '127.0.0.1:3999' && plantel.lanzadorDe('__Count') === null, 'lanzador')
  console.log('  plantel: bots, dueños y lanzador de cada jugador')

  // 2. zonas: las de todos, salvo las de trabajo del otro
  ok(zonas.compartido(), 'mundo compartido')
  ok(zonas.pasoVedado(5, 64, 5) && zonas.pasoVedado(105, 64, 105), 'las vedadas de los dos se respetan')
  ok(zonas.talaProtegida(50, 64, 50), 'el árbol protegido del otro también')
  ok(!zonas.fueraDeTrabajo(25, 64, 25) && zonas.fueraDeTrabajo(205, 64, 205), 'su zona de trabajo no me deja trabajar en ella; la mía, sí')
  ok(zonas.lista().some(l => l.startsWith('HOGAR') && l.endsWith('(de __Count)')), 'la lista dice de quién es')
  console.log('  zonas: vedadas y árboles de todos; las de trabajo, solo las mías')

  // 3. !zona escribe solo el mío
  const suyoAntes = fs.readFileSync(path.join(CARPETA, 'jugadores', '__Count.json'), 'utf8')
  zonas.zonaNueva('HUERTO', 40, 40, 45, 45, 'no_talar')
  ok(zonas.borrar('HOGAR') === 0, 'no se borra una zona del otro')
  const mio = JSON.parse(fs.readFileSync(path.join(CARPETA, 'jugadores', 'seppuq.json'), 'utf8'))
  ok(mio.zonas.some(z => z.nombre === 'HUERTO') && mio.zonas.every(z => !z.dueno) && mio.lanzador === '127.0.0.1:3999' && mio.bots.length === 2, `mi archivo: ${JSON.stringify(mio)}`)
  ok(fs.readFileSync(path.join(CARPETA, 'jugadores', '__Count.json'), 'utf8') === suyoAntes, 'el del otro no se toca')
  ok(zonas.borrar('HUERTO') === 1 && !zonas.lista().some(l => l.startsWith('HUERTO')), 'borro la mía')
  console.log('  !zona: escribe y borra solo en mi jugadores/<yo>.json')

  // 4. conectar.sh con el plantel: lista de todos; los del otro con lanzador no se lanzan aquí
  const sh = (args, env) => execFileSync('/usr/bin/bash', [path.join(__dirname, 'conectar.sh'), ...args], { env: { ...process.env, IO_SERVIDOR: M, ...env }, encoding: 'utf8' })
  ok(sh(['--listar']).trim().split('\n').sort().join() === 'Iris,Oqva,Trivino', 'conectar.sh --listar: los bots del plantel')
  ok(sh(['--listar', '--de', 'seppuq']).trim().split('\n').join() === 'Oqva,Iris', 'conectar.sh --de seppuq: los míos')
  ok(/Oqva: es de seppuq y se lanza en su PC/.test(sh(['Oqva'], { IO_DUENOS: '__Count' })), 'en el PC de otro, mis bots con lanzador no se lanzan')
  ok(/Trivino: no es tuyo/.test(sh(['--de', 'seppuq', 'Trivino'])), 'pedir uno ajeno: no es tuyo')
  console.log('  conectar.sh: plantel, --de y lanzador remoto')

  // 5. el lanzador
  const { validar } = require('./lanzador')
  const v = (clave, cuerpo) => validar(clave, cuerpo, { claveBuena: 'secreta', yo: 'seppuq' })
  ok(v('mala', { jugador: 'seppuq', nombres: ['bots'] }).estado === 403 && v('', { jugador: 'seppuq', nombres: ['bots'] }).estado === 403, 'clave mala o vacía: 403')
  ok(v('secreta', { jugador: '__Count', nombres: ['Trivino'] }).estado === 403, 'bots de otro jugador: 403')
  ok(v('secreta', { jugador: 'seppuq', nombres: ['Oqva; rm -rf /'] }).estado === 400 && v('secreta', { jugador: 'seppuq', nombres: [] }).estado === 400, 'nombres malos: 400')
  ok(v('secreta', { jugador: 'SEPPUQ', nombres: ['bots'], desconectar: true }).args.join(' ') === '--desconectar --de seppuq bots', 'bien: los argumentos de conectar.sh')
  ok(validar('x', { jugador: 'seppuq', nombres: ['bots'] }, { claveBuena: '', yo: 'seppuq' }).estado === 403, 'sin clave configurada no atiende a nadie')
  console.log('  lanzador: clave, dueño y nombres')
} finally {
  fs.rmSync(CARPETA, { recursive: true, force: true })
}

console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
