// Prueba en seco de la memoria persistente (F8.0a, bot/memoria_persistente.js), sin servidor, en una carpeta temporal:
// 1. En un mundo que no es el del usuario: sin archivo empieza vacía; trasHabilidad guarda base y refugio solo si cambian; la
//    escritura no deja temporales; recargar da lo mismo; alArrancar devuelve base y refugio a la RAM; las muertes se apuntan.
// 2. Un archivo roto no tumba al personaje: empieza de cero y guarda el roto como .rota.
// 3. En el mundo del usuario no lee ni escribe nada.
// Uso: node bot/probar_memoria_seco.js
const fs = require('fs')
const os = require('os')
const path = require('path')
const { spawnSync } = require('child_process')

let pruebas = 0, fallos = 0
const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }
const fin = () => { console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`); process.exit(fallos ? 1 : 0) }

const parte = process.argv[2]
if (!parte) {
  const a = spawnSync(process.execPath, [__filename, 'otro'], { env: { ...process.env, IO_SERVIDOR: 'local' }, stdio: 'inherit' })
  const env = { ...process.env }; delete env.IO_SERVIDOR
  const b = spawnSync(process.execPath, [__filename, 'usuario'], { env, stdio: 'inherit' })
  const bien = a.status === 0 && b.status === 0
  console.log(bien ? 'probar_memoria_seco: todo bien' : 'probar_memoria_seco: HAY FALLOS')
  process.exit(bien ? 0 : 1)
}

const mundo = require('./mundo')
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'memoria-'))
mundo.carpetaDatos = tmp // la memoria escribe en la carpeta del mundo: aquí, una de usar y tirar
const mp = require('./memoria_persistente')
const botDe = (yo) => ({ yo, entity: { position: { floored: () => ({ toArray: () => [1, 64, 2] }) } }, time: { timeOfDay: 18000 } })

if (parte === 'otro') {
  console.log(`1 · mundo ${mundo.nombre}`)
  const yo = { nombre: 'Prueba1' }
  const d = mp.alArrancar(yo)
  ok(d && d.v === 1 && d.base === null && yo.persistente === d, 'sin archivo no empieza con una memoria vacía')
  const bot = botDe(yo)
  ok(mp.trasHabilidad(bot) === false && !fs.existsSync(mp.ruta('Prueba1')), 'sin cambios no debería escribir')
  yo.campamento = [10, 64, -5]; yo.refugio = [11, 63, -5]
  ok(mp.trasHabilidad(bot) === true, 'con base y refugio nuevos no guarda')
  ok(fs.readdirSync(tmp).every(f => !f.endsWith('.tmp')), `quedan temporales: ${fs.readdirSync(tmp)}`)
  ok(mp.trasHabilidad(bot) === false, 'sin cambios vuelve a escribir')
  ok(mp.anotarMuerte(bot, 'lava') && mp.cargar('Prueba1').muertes.length === 1, 'la muerte no se guarda')
  const yo2 = { nombre: 'Prueba1' }
  mp.alArrancar(yo2)
  ok(JSON.stringify(yo2.campamento) === '[10,64,-5]' && JSON.stringify(yo2.refugio) === '[11,63,-5]', `al reiniciar no vuelven base y refugio: ${JSON.stringify(yo2)}`)
  ok(yo2.persistente.muertes[0].causa === 'lava' && JSON.stringify(yo2.persistente.muertes[0].pos) === '[1,64,2]', 'la muerte no vuelve con su causa y su sitio')
  const yo3 = { nombre: 'Prueba1', campamento: [0, 70, 0] }
  mp.alArrancar(yo3)
  ok(JSON.stringify(yo3.campamento) === '[0,70,0]', 'pisa el campamento que ya había en la RAM')
  console.log('  1 · guarda base, refugio y muertes; solo escribe si cambia algo; recarga igual')
  fs.writeFileSync(mp.ruta('Roto'), '{ esto no es json')
  const r = mp.cargar('Roto')
  ok(r && r.v === 1 && fs.existsSync(mp.ruta('Roto') + '.rota'), 'un archivo roto no se aparta como .rota')
  console.log('  2 · un archivo roto: empieza de cero y lo aparta')
} else {
  console.log(`3 · mundo ${mundo.nombre}`)
  const yo = { nombre: 'Prueba1', campamento: [1, 2, 3] }
  ok(mp.alArrancar(yo) === null && !yo.persistente, 'en el mundo del usuario carga memoria')
  ok(mp.trasHabilidad(botDe(yo)) === false && mp.anotarMuerte(botDe(yo)) === false, 'en el mundo del usuario escribe')
  ok(fs.readdirSync(tmp).length === 0, 'en el mundo del usuario hay archivos')
  console.log('  3 · en el mundo del usuario no lee ni escribe')
}
fs.rmSync(tmp, { recursive: true, force: true })
fin()
