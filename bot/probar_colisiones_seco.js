// Prueba en seco de las colisiones entre entidades: node probar_colisiones_seco.js
const assert = require('assert')
const { Vec3 } = require('vec3')
const { empuje, solapan, vigilar } = require('./colisiones')

let n = 0
const ok = (t) => { n++; console.log('ok', t) }
const ent = (x, y, z, extra = {}) => ({ position: new Vec3(x, y, z), velocity: new Vec3(0, 0, 0), width: 0.6, height: 1.8, type: 'player', ...extra })

{ // se solapan solo si X, Z e Y se tocan
  assert.ok(solapan(ent(0, 64, 0), ent(0.5, 64, 0)))
  assert.ok(!solapan(ent(0, 64, 0), ent(0.6, 64, 0)), 'justo al borde: no')
  assert.ok(!solapan(ent(0, 64, 0), ent(0, 66, 0)), 'uno encima del otro con hueco: no')
  assert.ok(solapan(ent(0, 64, 0), ent(0, 65.5, 0)), 'cuerpos cruzados en altura: sí')
  ok('solape de cajas')
}
{ // el empuje va en sentido contrario al otro, y es el 0,05 de vanilla a 0,3 bloques
  const p = empuje(ent(0, 64, 0), ent(0.3, 64, 0))
  assert.ok(p.x < 0 && p.z === 0)
  const d = Math.sqrt(0.3)
  assert.ok(Math.abs(p.x + (0.3 / d) * Math.min(1 / d, 1) * 0.05) < 1e-12)
  const q = empuje(ent(0, 64, 0), ent(0, 64, -0.2))
  assert.ok(q.z > 0 && Math.abs(q.x) < 1e-12)
  ok('sentido y magnitud')
}
{ // clavados en el mismo punto o lejos: sin empuje
  assert.strictEqual(empuje(ent(0, 64, 0), ent(0.005, 64, 0)), null)
  assert.strictEqual(empuje(ent(0, 64, 0), ent(3, 64, 0)), null)
  ok('sin empuje')
}
{ // en cada tick suma a la velocidad; ignora objetos y a sí mismo; se separan con el tiempo
  const oyentes = []
  const yo = ent(0, 64, 0), otro = ent(0.2, 64, 0), objeto = ent(0.1, 64, 0, { type: 'object' })
  const bot = { entity: yo, entities: { 1: yo, 2: otro, 3: objeto }, on: (e, f) => oyentes.push(f) }
  vigilar(bot)
  oyentes[0]()
  assert.ok(yo.velocity.x < 0 && yo.velocity.z === 0, 'solo empuja el otro jugador')
  // dos bots solapados, cada uno aplicando su lado: la distancia crece
  const a = ent(0, 64, 0), b = ent(0.1, 64, 0.1)
  for (let t = 0; t < 40; t++) {
    const pa = empuje(a, b), pb = empuje(b, a)
    if (pa) { a.position.x += pa.x * 10; a.position.z += pa.z * 10 }
    if (pb) { b.position.x += pb.x * 10; b.position.z += pb.z * 10 }
  }
  assert.ok(!solapan(a, b), 'terminan separados')
  ok('tick y separación')
}
{ // en vehículo o sin entidad: no hace nada
  const oyentes = []
  const bot = { entity: null, entities: {}, on: (e, f) => oyentes.push(f) }
  vigilar(bot); oyentes[0]()
  const yo = ent(0, 64, 0)
  const b2 = { entity: yo, vehicle: {}, entities: { 2: ent(0.1, 64, 0) }, on: (e, f) => oyentes.push(f) }
  vigilar(b2); oyentes[1](); assert.strictEqual(yo.velocity.x, 0)
  ok('sin efecto en vehículo')
}
console.log(`${n} pruebas pasan`)
