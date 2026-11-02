// Prueba en seco del alcance (aliados por dueño): node probar_alcance_seco.js
const assert = require('assert')
const fs = require('fs')
const os = require('os')
const path = require('path')
const { aliados, duenoDe, seguro } = require('./alcance')

let n = 0
const ok = (t) => { n++; console.log('ok', t) }
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'alcance-'))

assert.strictEqual(duenoDe(['Seppuq', 'Otro']), 'Seppuq'); assert.strictEqual(duenoDe([]), ''); assert.strictEqual(duenoDe(null), '')
ok('el dueño es el primero de los amos, o vacío')

assert.strictEqual(seguro('../../etc/Pasar'), '______etc_pasar'); assert.strictEqual(seguro(''), 'mundo')
const a = aliados(dir, '../x'); assert.strictEqual(path.dirname(a.ruta), dir)
ok('el nombre del dueño no puede salir de la carpeta')

{ // dos dueños en el mismo mundo no mezclan sus aliados
  const s = aliados(dir, 'seppuq'), c = aliados(dir, 'Count')
  s.poner('Oqva', true)
  assert.ok(s.tiene('oqva') && s.tiene('OQVA')); assert.ok(!c.tiene('Oqva'))
  ok('los aliados son de cada dueño, sin distinguir mayúsculas')
}
{ // otro proceso (otra instancia) del mismo dueño: lo que uno guarda lo ve el otro y no se pierde al guardar
  const p1 = aliados(dir, 'seppuq'), p2 = aliados(dir, 'seppuq')
  p1.poner(['Ana', 'Beto'], true)
  assert.ok(p2.tiene('ana'))
  p2.poner('Cleo', true)
  assert.deepStrictEqual(p1.lista().sort(), ['ana', 'beto', 'cleo', 'oqva'])
  p1.poner('ana', false)
  assert.ok(!p2.tiene('ana') && p2.tiene('beto'))
  ok('dos procesos del mismo dueño se ven y no se pisan')
}
{ // sin archivo de dueño, hereda una vez el aliados.json de antes
  const viejo = path.join(dir, 'aliados.json'); fs.writeFileSync(viejo, JSON.stringify({ aliados: ['Viejo'] }))
  const h = aliados(dir, 'nuevo', { heredado: viejo })
  assert.ok(h.tiene('viejo')); h.poner('Otro', true)
  assert.deepStrictEqual(h.lista().sort(), ['otro', 'viejo'])
  ok('hereda el archivo antiguo del mundo la primera vez')
}
{ // archivo roto: lista vacía, sin romper
  const r = aliados(dir, 'roto'); fs.writeFileSync(r.ruta, '{no es json')
  assert.deepStrictEqual(r.lista(), []); ok('un archivo roto cuenta como vacío')
}
assert.deepStrictEqual(fs.readdirSync(dir).filter(f => f.endsWith('.tmp')), [])
ok('no quedan temporales')
fs.rmSync(dir, { recursive: true, force: true })
console.log(`${n} pruebas, todas bien`)
