// Prueba en seco de las reglas por mundo (P2 del asistente): node probar_reglas_mundo_seco.js
// Cada caso corre en un proceso aparte, porque mundo.js lee IO_SERVIDOR y mundo.json al cargarse. Para el mundo del usuario
// sin `reglas`, el proceso hijo sustituye la lectura de su mundo.json por una copia sin esa clave.
const assert = require('assert')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const sonda = `
const fs = require('fs'), path = require('path')
if (process.env.SIN_REGLAS) {
  const leer = fs.readFileSync
  fs.readFileSync = function (f, ...r) {
    const t = leer.call(fs, f, ...r)
    if (String(f).endsWith(path.join('mundos', 'usuario', 'mundo.json'))) { const d = JSON.parse(t); delete d.reglas; return JSON.stringify(d) }
    return t
  }
}
const mundo = require('./mundo'), sv = require('./habilidades/sv'), mp = require('./memoria_persistente')
console.log(JSON.stringify({ libres: mundo.reglasLibres, tocar: sv.puedeTocar(123456, 64, 654321), memoria: mp.activo() }))
`
function caso(env) {
  const s = execFileSync(process.execPath, ['-e', sonda], { cwd: __dirname, env: { ...process.env, ...env }, encoding: 'utf8' })
  return JSON.parse(s.trim().split('\n').pop())
}

let n = 0
const ok = (t) => { n++; console.log('ok', t) }

const local = caso({ IO_SERVIDOR: 'local' })
assert.deepStrictEqual(local, { libres: true, tocar: true, memoria: true }); ok('mundo local: reglas libres')
const libre = caso({ IO_SERVIDOR: 'usuario' })
assert.deepStrictEqual(libre, { libres: true, tocar: true, memoria: true }); ok('usuario con "reglas": "libre": sin límites')
const duro = caso({ IO_SERVIDOR: 'usuario', SIN_REGLAS: '1' })
assert.deepStrictEqual(caso({ IO_SERVIDOR: 'usuario', IO_REGLAS: 'duras' }), { libres: false, tocar: false, memoria: false }); ok('IO_REGLAS=duras las fuerza')
assert.deepStrictEqual(duro, { libres: false, tocar: false, memoria: false }); ok('usuario sin reglas: como antes')

// lo que no cambia: verter lava en el mundo del usuario sigue prohibido por nombre
const agua = fs.readFileSync(path.join(__dirname, 'habilidades', 'agua.js'), 'utf8')
assert.ok(/liquido === 'lava' && mundo\.nombre === 'usuario'/.test(agua)); ok('la lava sigue prohibida en el mundo del usuario')
// y no queda ninguna regla por nombre fuera de las previstas
const quedan = execFileSync('grep', ['-rln', "nombre [!=]== 'usuario'", '.', '--include=*.js', '--exclude-dir=node_modules'], { cwd: __dirname, encoding: 'utf8' })
  .trim().split('\n').map(f => f.replace(/^\.\//, '')).sort()
assert.deepStrictEqual(quedan, ['habilidades/agua.js', 'io.js', 'mundo.js', 'probar_reglas_mundo_seco.js']); ok('solo quedan por nombre agua.js, io.js y mundo.js')
console.log(`probar_reglas_mundo_seco: ${n}/${n}, todo bien`)
