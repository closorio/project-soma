// Prueba en seco del envoltorio tick_end (A0 del asistente): node probar_tick_end_seco.js
const assert = require('assert')
const { instalar } = require('./tick_end')

function falso() {
  const enviados = []
  return { enviados, bot: { _client: { write: (n, d) => { enviados.push(n); return 'ok' } } } }
}

let n = 0
const ok = (t) => { n++; console.log('ok', t) }

{ // cada paquete de movimiento va seguido de un tick_end
  const f = falso()
  assert.strictEqual(instalar(f.bot), true)
  for (const p of ['position', 'position_look', 'look', 'flying']) {
    f.enviados.length = 0
    assert.strictEqual(f.bot._client.write(p, {}), 'ok')
    assert.deepStrictEqual(f.enviados, [p, 'tick_end'])
  }
  ok('movimiento → tick_end')
  for (const p of ['chat', 'block_dig', 'window_click', 'tick_end', 'arm_animation']) {
    f.enviados.length = 0
    f.bot._client.write(p, {})
    assert.deepStrictEqual(f.enviados, [p])
  }
  ok('los demás paquetes no cambian')
  assert.strictEqual(instalar(f.bot), false)
  f.enviados.length = 0
  f.bot._client.write('position', {})
  assert.deepStrictEqual(f.enviados, ['position', 'tick_end'])
  ok('instalar dos veces no duplica')
}
{ // holgura (Paper): el borde del cuerpo justo en la cara de un bloque se mete 1e-4; lo demás no se toca
  const { separar } = require('./tick_end')
  assert.ok(Math.abs(separar(402.7) - 402.6999) < 1e-9, 'borde +z en la cara: hacia dentro')
  assert.ok(Math.abs(separar(450.3) - 450.3001) < 1e-9, 'borde -x en la cara: hacia dentro')
  assert.strictEqual(separar(450.5), 450.5)
  assert.strictEqual(separar(402.315), 402.315)
  const f = { datos: [], bot: { _client: { write: (n, d) => { f.datos.push([n, d]); return 'ok' } } } }
  instalar(f.bot)
  f.bot._client.write('position', { x: 450.5, y: 200.42, z: 402.7, onGround: false })
  const [n0, d0] = f.datos[0]
  assert.ok(n0 === 'position' && d0.x === 450.5 && d0.y === 200.42 && d0.z < 402.7, 'el paquete sale con la holgura')
  ok('holgura en la cara de un bloque')
}
{ // sin cliente no hace nada
  assert.strictEqual(instalar({}), false)
  assert.strictEqual(instalar(null), false)
  ok('sin cliente, nada')
}
{ // mundo.js: el banco local no lo lleva
  process.env.IO_SERVIDOR = 'local'
  delete require.cache[require.resolve('./mundo')]
  assert.strictEqual(require('./mundo').tickEnd, false)
  ok('el mundo local no lleva tick_end')
}
console.log(`probar_tick_end_seco: ${n}/${n}, todo bien`)
