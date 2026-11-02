// Prueba en seco de dormir con el dueño: node probar_dormir_con_dueno_seco.js
const assert = require('assert')
const EventEmitter = require('events')
const { vigilar } = require('./dormir_con_dueno')

let n = 0
const ok = (t) => { n++; console.log('ok', t) }
const NOCHE = 14000

function falso({ hora = NOCHE, respuestas = ['Ya es de día. Spawn guardado en la cama.'], espera = () => Promise.resolve() } = {}) {
  const bot = new EventEmitter()
  bot.entity = { username: 'Yo' }
  bot.isSleeping = false
  bot.time = { timeOfDay: hora, time: hora, isDay: false }
  const llamadas = [], dichos = []
  const dormir = async () => { llamadas.push(Date.now()); return respuestas[Math.min(llamadas.length - 1, respuestas.length - 1)] }
  vigilar(bot, { esAmo: (u) => u === 'Dueno', dormir, decir: (t) => dichos.push(t), azar: () => 0, esperar: espera })
  return { bot, llamadas, dichos }
}
const tick = () => new Promise(r => setImmediate(r))

;(async () => {
  { // el dueño se acuesta de noche: el bot intenta dormir y lo dice
    const f = falso()
    f.bot.emit('entitySleep', { username: 'Dueno' })
    await tick(); await tick()
    assert.strictEqual(f.llamadas.length, 1)
    assert.ok(/me voy a dormir/.test(f.dichos[0]))
    ok('el dueño se acuesta → duerme')
  }
  { // otros jugadores, otros bots o él mismo: nada
    const f = falso()
    f.bot.emit('entitySleep', { username: 'Otro' })
    f.bot.emit('entitySleep', f.bot.entity)
    await tick(); await tick()
    assert.strictEqual(f.llamadas.length, 0)
    ok('solo el dueño')
  }
  { // de día no
    const f = falso({ hora: 3000 })
    f.bot.emit('entitySleep', { username: 'Dueno' })
    await tick(); await tick()
    assert.strictEqual(f.llamadas.length, 0)
    ok('de día no')
  }
  { // ya dormido: no repite
    const f = falso()
    f.bot.isSleeping = true
    f.bot.emit('entitySleep', { username: 'Dueno' })
    await tick(); await tick()
    assert.strictEqual(f.llamadas.length, 0)
    ok('ya dormido no repite')
  }
  { // si falla, reintenta (hasta 3) mientras el dueño siga acostado
    const f = falso({ respuestas: ['No pude usar la cama: monstruos cerca.'] })
    f.bot.emit('entitySleep', { username: 'Dueno' })
    for (let i = 0; i < 10; i++) await tick()
    assert.strictEqual(f.llamadas.length, 3)
    ok('reintenta 3 veces')
  }
  { // el dueño se levanta antes: deja de reintentar
    const f = falso({ respuestas: ['No pude usar la cama: monstruos cerca.'], espera: () => new Promise(r => setTimeout(r, 30)) })
    f.bot.emit('entitySleep', { username: 'Dueno' })
    await new Promise(r => setTimeout(r, 45)) // ya hizo el primer intento y espera el reintento
    f.bot.emit('entityWake', { username: 'Dueno' })
    await new Promise(r => setTimeout(r, 150))
    assert.strictEqual(f.llamadas.length, 1)
    ok('se levanta → para')
  }
  console.log(`${n} pruebas pasan`)
})().catch(e => { console.error('FALLO', e.message); process.exit(1) })
