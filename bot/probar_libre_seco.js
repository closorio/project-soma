// Prueba en seco de F7.5 (el ejecutor de supervivencia del modo libre: bot/libre.js, que usa io.js), sin servidor ni bots.
// A · usuario: la política del mundo del usuario (politica_habilidades.json, 25 entradas; sin IO_POLITICA ni IO_SERVIDOR) da
//     exactamente las mismas decisiones que antes de F7.5: (1) las decisiones registradas del modo libre del mundo del usuario
//     (entrenamiento/ejecuciones/modos-AAAAMMDD.jsonl) pasadas por libre.decidir dan la misma habilidad, los mismos valores Q y los
//     argumentos de la tabla de antes, sin salir del refugio; (2) en el mundo de mentira de probar_sentidos_seco.js, libre.decidir
//     es observar + red.decidir + los argumentos de antes, también encerrado; (3) tramos de 300 s y nunca llama a observarSv.
// C · decisores por personaje (F8.0a, bot/decisores.js), en un solo proceso sin IO_POLITICA ni IO_DECISOR: uno con la red del
//     usuario (25 entradas, tramos de 300 s), otro con la red de supervivencia y otro con el guion de supervivencia (47, 1200 s);
//     cada uno decide con lo suyo en los mismos mundos de mentira, el capataz casual se prepara (un rol que no existe, no) y «guion@RUTA»
//     de la línea de órdenes vale.
// B · supervivencia (IO_SERVIDOR=supervivencia, IO_POLITICA=entrenamiento/politica_supervivencia_dagger.json): observa con
//     observarSv (47 entradas), tramos de 1200 s, todas las acciones con argumentos, fabricar sin objeto (siguienteFabricacion),
//     y la salida del refugio de _necesita_salir() del simulador (solo dentro, y solo si la habilidad haría algo fuera).
// Uso: node bot/probar_libre_seco.js   (cada parte en su proceso: red.js lee IO_POLITICA al cargar; sale con 1 si falla algo)
const path = require('path')
const fs = require('fs')
const { spawnSync } = require('child_process')

const RAIZ = path.join(__dirname, '..')
const DAGGER = path.join(RAIZ, 'entrenamiento', 'politica_supervivencia_dagger.json')
// La tabla de argumentos de io.js antes de F7.5 (la de las 6 habilidades del mundo del usuario).
const ARGS_ANTES = { ir_a_arbol: '80', picar_tronco: '', recoger: '8 _log', ir_a_jugador: '', huir: '-', ir_a_otro_arbol: '80' }

let fallos = 0, pruebas = 0
const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }
const igual = (a, b) => JSON.stringify(a) === JSON.stringify(b)
const fin = () => { console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`); process.exit(fallos ? 1 : 0) }

const parte = process.argv[2]
if (!parte) {
  const env = { ...process.env }
  delete env.IO_POLITICA; delete env.IO_SERVIDOR
  const a = spawnSync(process.execPath, [__filename, 'usuario'], { env, stdio: 'inherit' })
  const b = spawnSync(process.execPath, [__filename, 'supervivencia'], { env: { ...env, IO_SERVIDOR: 'supervivencia', IO_POLITICA: DAGGER }, stdio: 'inherit' })
  const c = spawnSync(process.execPath, [__filename, 'decisores'], { env: { ...env, IO_SERVIDOR: 'supervivencia' }, stdio: 'inherit' })
  const todo = a.status === 0 && b.status === 0 && c.status === 0
  console.log(todo ? 'probar_libre_seco: todo bien' : 'probar_libre_seco: HAY FALLOS')
  process.exit(todo ? 0 : 1)
}

const { mundoFalso, celda } = require('./probar_sentidos_seco')
const red = require('./red')
const observacion = require('./observacion')
const libre = require('./libre')

if (parte === 'usuario') {
  console.log(`A · usuario (${path.basename(red.RUTA)})`)
  ok(path.basename(red.RUTA) === 'politica_habilidades.json', 'sin IO_POLITICA la red no es politica_habilidades.json')
  ok(red.observacion() === 'obs' && libre.tramo() === 300, `observación ${red.observacion()}, tramo ${libre.tramo()} (esperaba obs y 300)`)
  for (const [h, a] of Object.entries(ARGS_ANTES)) ok(libre.ARGS[h] === a, `argumentos de ${h}: «${libre.ARGS[h]}», antes «${a}»`)

  // 1 · las decisiones registradas, por libre.decidir (observar devuelve lo registrado; observarSv no se debe llamar)
  const orig = { observar: observacion.observar, observarSv: observacion.observarSv }
  let llamadasSv = 0
  observacion.observarSv = (...x) => { llamadasSv++; return orig.observarSv(...x) }
  const dir = path.join(RAIZ, 'entrenamiento', 'ejecuciones')
  const archivos = fs.readdirSync(dir).filter(f => /^modos-\d{8}\.jsonl$/.test(f)).sort()
  let n = 0, distintas = 0
  const usos = {}
  for (const f of archivos) {
    for (const linea of fs.readFileSync(path.join(dir, f), 'utf8').split('\n')) {
      if (!linea.includes('"tipo":"decision"')) continue
      const rec = JSON.parse(linea)
      if (!Array.isArray(rec.obs) || rec.obs.length !== 25) continue
      observacion.observar = () => ({ obs: rec.obs, datos: rec.datos })
      const x = libre.decidir({}) // un bot vacío: con obs no mira nada más del bot (ni si está encerrado)
      n++
      usos[x.d.habilidad] = (usos[x.d.habilidad] || 0) + 1
      const bien = x.tipo === 'obs' && x.d.habilidad === rec.habilidad && igual(x.d.q, rec.q) && x.args === ARGS_ANTES[rec.habilidad] && x.salir === false
      if (!bien && distintas++ < 3) console.log(`  distinta (${f}, ${rec.t}): ${rec.habilidad} ${JSON.stringify(rec.q)} → ${x.d.habilidad} ${JSON.stringify(x.d.q)} args «${x.args}» salir ${x.salir}`)
    }
  }
  observacion.observar = orig.observar
  ok(n >= 1000, `solo ${n} decisiones registradas del mundo del usuario`)
  ok(distintas === 0, `${distintas} de ${n} decisiones registradas cambian`)
  console.log(`  1 · ${n} decisiones registradas (${archivos.join(', ')}): ${n - distintas} iguales (habilidad, valores Q y argumentos) · ${JSON.stringify(usos)}`)

  // 2 · en el mundo de mentira: libre.decidir = observar + red.decidir + argumentos de antes
  const escenarios = {
    'día con un árbol a 5': mundoFalso({ bloques: { '5,64,0': 'oak_log', '5,65,0': 'oak_log' } }),
    'noche con un zombi a 4': mundoFalso({ hora: 18000, salud: 12, entidades: [{ name: 'zombie', pos: [4.5, 64, 0.5] }], bloques: { '9,64,0': 'birch_log' } }),
    'troncos en el suelo y un jugador': mundoFalso({ entidades: [{ name: 'item', type: 'object', pos: [3.5, 64, 0.5] }, { name: 'player', username: 'Seppuq', pos: [10.5, 64, 2.5] }] }),
    'encerrado en una celda, con árbol': mundoFalso({ bloques: { ...celda(0, 64, 0), '6,64,1': 'oak_log' } }),
    'sin nada': mundoFalso({ hora: 13000, salud: 6 }),
  }
  for (const [t, bot] of Object.entries(escenarios)) {
    const x = libre.decidir(bot)
    const { obs } = orig.observar(bot), d = red.decidir(obs)
    ok(x.tipo === 'obs' && igual(x.obs, obs) && igual(x.d, d) && x.args === ARGS_ANTES[d.habilidad] && x.salir === false,
      `${t}: ${JSON.stringify({ tipo: x.tipo, h: x.d.habilidad, args: x.args, salir: x.salir })} frente a ${d.habilidad}`)
    console.log(`  2 · ${t}: ${x.d.habilidad} «${x.args}»`)
  }
  ok(llamadasSv === 0, `observarSv llamada ${llamadasSv} veces con la política del usuario`)
  fin()
}

if (parte === 'decisores') {
  const decisores = require('./decisores')
  const guion = require('./guion_sv')
  console.log('C · decisores por personaje')
  const usuario = decisores.crear(), redSv = decisores.crear('red', DAGGER), guionSv = decisores.deTexto('guion@' + DAGGER)
  ok(usuario.nombre === 'red' && path.basename(usuario.ruta) === 'politica_habilidades.json', `por defecto: ${usuario.nombre} ${usuario.ruta}`)
  ok(guionSv.nombre === 'guion' && guionSv.ruta === DAGGER, `guion@RUTA: ${guionSv.nombre} ${guionSv.ruta}`)
  ok(libre.tramo(usuario) === 300 && libre.tramo(redSv) === 1200 && libre.tramo(guionSv) === 1200,
    `tramos ${libre.tramo(usuario)}, ${libre.tramo(redSv)}, ${libre.tramo(guionSv)} (esperaba 300, 1200, 1200)`)
  ok(redSv.politica === guionSv.politica, 'la misma política no se carga dos veces')
  // F8.1: el capataz ya existe; con un rol que no existe se niega
  const capataz = decisores.crear('capataz')
  let negado = null
  try { capataz.preparar() } catch (e) { negado = e.message }
  ok(negado === null && capataz.rol === 'casual' && libre.tramo(capataz) === 1200, `el capataz casual no se prepara (${negado})`)
  let sinRol = ''
  try { decisores.crear('capataz', 'astronauta').preparar() } catch (e) { sinRol = e.message }
  ok(/ENOENT|no vale|astronauta/.test(sinRol), `un rol que no existe no se niega (${sinRol})`)
  let mal = ''
  try { decisores.crear('oraculo') } catch (e) { mal = e.message }
  ok(/desconocido/.test(mal), 'un decisor desconocido se rechaza')
  const mundos = {
    'día con un árbol a 5': mundoFalso({ bloques: { '5,64,0': 'oak_log', '5,65,0': 'oak_log' } }),
    'noche con un zombi a 6 y espada': mundoFalso({ hora: 18000, entidades: [{ name: 'zombie', pos: [6.5, 64, 0.5] }], inventario: [['wooden_sword', 1], ['dirt', 4]] }),
    'atardecer con tierra': mundoFalso({ hora: 12600, inventario: [['dirt', 4], ['bread', 2]] }),
    'hambre y una vaca': mundoFalso({ comida: 8, entidades: [{ name: 'cow', pos: [8.5, 64, 0.5] }] }),
    'creeper a 4': mundoFalso({ hora: 18000, entidades: [{ name: 'creeper', pos: [4.5, 64, 0.5] }] }),
    'noche sin nada y salud 6': mundoFalso({ hora: 13000, salud: 6 }),
  }
  let distintas = 0
  for (const [t, bot] of Object.entries(mundos)) {
    const u = libre.decidir(bot, usuario), r = libre.decidir(bot, redSv), g = libre.decidir(bot, guionSv)
    ok(u.tipo === 'obs' && u.obs.length === 25 && igual(u.d, red.politica().decidir(u.obs)), `${t}: el del usuario no decide con su red de 25`)
    ok(r.tipo === 'obs_sv' && igual(r.d, red.politica(DAGGER).decidir(r.obs)), `${t}: la red de supervivencia no decide con su política`)
    ok(g.tipo === 'obs_sv' && igual(g.d, guion.decidir(g.obs)), `${t}: el guion no decide con guion_sv`)
    if (r.d.habilidad !== g.d.habilidad) distintas++
    console.log(`  ${t}: usuario ${u.d.habilidad} · red sv ${r.d.habilidad} · guion sv ${g.d.habilidad}`)
  }
  console.log(`  la red y el guion de supervivencia difieren en ${distintas} de ${Object.keys(mundos).length} mundos (informativo)`)
  fin()
}

if (parte === 'supervivencia') {
  const { ACCIONES_SV } = observacion
  const sv = require('./habilidades/sv')
  const fabricar = require('./habilidades/fabricar')
  console.log(`B · supervivencia (${path.basename(red.RUTA)})`)
  ok(red.observacion() === 'obs_sv' && libre.tramo() === 1200, `observación ${red.observacion()}, tramo ${libre.tramo()} (esperaba obs_sv y 1200)`)
  for (const h of ACCIONES_SV) ok(typeof libre.ARGS[h] === 'string', `${h} no tiene argumentos en libre.ARGS`)
  ok(libre.ARGS.fabricar === '' && libre.ARGS.atacar === '-' && libre.ARGS.huir === '-' && libre.ARGS.refugiarse === '', `argumentos: ${JSON.stringify(libre.ARGS)}`)
  const sim = require('child_process').execFileSync('python3', ['-c',
    'import json, entorno_supervivencia as e; print(json.dumps({"salen": sorted(e.SALEN), "deteccion": e.DETECCION, "radio": e.CAL_SV["recoger_comida"]["radio"]}))'],
  { cwd: path.join(RAIZ, 'entrenamiento') })
  const s = JSON.parse(sim)
  ok(igual(s.salen, [...libre.SALEN].sort()) && s.deteccion === 16 && s.radio === 24, `SALEN/DETECCION/radio de caza distintos del simulador: ${sim}`)

  // fabricar sin objeto: la cadena de siguiente_fabricacion()
  ok(fabricar.siguienteFabricacion(fabricar.estado(mundoFalso({ inventario: [['oak_log', 3]] }))) === 'espada_madera', 'con 3 troncos y sin arma, no toca la espada de madera')
  ok(fabricar.siguienteFabricacion(fabricar.estado(mundoFalso({ inventario: [['wooden_sword', 1], ['oak_log', 1]] }))) === 'tablones', 'con espada y sin bloques, no tocan tablones')

  // 1 · libre.decidir = observarSv + red.decidir, fuera y dentro del refugio
  const T = { cancelada: false }
  const fuera = {
    'día con un árbol a 5': mundoFalso({ bloques: { '5,64,0': 'oak_log', '5,65,0': 'oak_log' } }),
    'noche con un zombi a 6 y espada': mundoFalso({ hora: 18000, entidades: [{ name: 'zombie', pos: [6.5, 64, 0.5] }], inventario: [['wooden_sword', 1], ['dirt', 4]] }),
    'atardecer con tierra': mundoFalso({ hora: 12600, inventario: [['dirt', 4], ['bread', 2]] }),
    'hambre y una vaca': mundoFalso({ comida: 8, entidades: [{ name: 'cow', pos: [8.5, 64, 0.5] }] }),
    'creeper a 4': mundoFalso({ hora: 18000, entidades: [{ name: 'creeper', pos: [4.5, 64, 0.5] }] }),
  }
  for (const [t, bot] of Object.entries(fuera)) {
    const x = libre.decidir(bot), { obs } = observacion.observarSv(bot), d = red.decidir(obs)
    ok(x.tipo === 'obs_sv' && x.obs.length === 47 && igual(x.obs, obs) && igual(x.d, d) && x.args === libre.ARGS[d.habilidad] && x.salir === false,
      `${t}: ${JSON.stringify({ tipo: x.tipo, n: x.obs.length, h: x.d.habilidad, salir: x.salir })} frente a ${d.habilidad}`)
    console.log(`  1 · fuera, ${t}: ${x.d.habilidad} «${x.args}»`)
  }

  // 2 · dentro del refugio: _necesita_salir() por habilidad
  const dentro = (o = {}) => mundoFalso({ ...o, bloques: { ...celda(0, 64, 0), ...(o.bloques || {}) } })
  const casos = [
    ['nada a la vista', dentro(), { explorar: true }],
    ['árbol a 6', dentro({ bloques: { '6,64,1': 'oak_log' } }), { ir_a_arbol: true, explorar: true }],
    ['troncos en el suelo a 3', dentro({ entidades: [{ name: 'item', type: 'object', pos: [3.5, 64, 0.5] }] }), { recoger: true, explorar: true }],
    ['zombi a 10', dentro({ hora: 18000, entidades: [{ name: 'zombie', pos: [10.5, 64, 0.5] }] }), { huir: true, atacar: true, explorar: true }],
    ['zombi a 20', dentro({ hora: 18000, entidades: [{ name: 'zombie', pos: [20.5, 64, 0.5] }] }), { explorar: true }],
    ['hambre 10 y vaca a 10, de día', dentro({ comida: 10, entidades: [{ name: 'cow', pos: [10.5, 64, 0.5] }] }), { recoger_comida: true, explorar: true }],
    ['hambre 10 y vaca a 10, de noche', dentro({ comida: 10, hora: 18000, entidades: [{ name: 'cow', pos: [10.5, 64, 0.5] }] }), { explorar: true }],
    ['hambre 15 y vaca a 10', dentro({ comida: 15, entidades: [{ name: 'cow', pos: [10.5, 64, 0.5] }] }), { explorar: true }],
  ]
  for (const [t, bot, esperado] of casos) {
    ok(require('./habilidades/comun').encerrado(bot), `${t}: la celda no está cerrada`)
    const { datos } = observacion.observarSv(bot)
    const salen = ACCIONES_SV.filter(h => libre.necesitaSalir(bot, h, datos))
    ok(igual(salen, ACCIONES_SV.filter(h => esperado[h])), `${t}: salen ${salen.join(',')}, esperaba ${Object.keys(esperado).join(',')}`)
    const x = libre.decidir(bot)
    ok(x.salir === !!esperado[x.d.habilidad], `${t}: la red elige ${x.d.habilidad} y salir = ${x.salir}`)
    console.log(`  2 · dentro, ${t}: saldría para ${salen.join(', ')}; la red elige ${x.d.habilidad}${x.salir ? ' (sale antes)' : ''}`)
  }
  ok(sv.aLaVista(casos[3][1]).length === 1, 'el zombi a 10 no cuenta como a la vista')
  // fabricar sin objeto y sin materiales: falla limpio («faltan materiales»), sin pedir objeto
  require('./habilidades/fabricar')(mundoFalso(), String(libre.ARGS.fabricar).split(/\s+/).filter(Boolean), T)
    .then(r => { ok(!r.exito && r.causa === 'faltan materiales' && r.objeto === null, `fabricar sin objeto ni materiales: ${JSON.stringify(r)}`); fin() })
    .catch(e => { ok(false, 'fabricar sin objeto: ' + e.message); fin() })
}
