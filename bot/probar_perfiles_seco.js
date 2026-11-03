// Prueba en seco de los perfiles v2 (F8.0a; bot/perfil_v2.js y entrenamiento/perfiles_v2.py), sin servidor:
// 1. Los roles de perfiles/v2/ no tienen errores, y JS y Python dan las mismas etapas resueltas y los mismos errores.
// 2. Las acciones del catálogo existen en bot/habilidades o en bot/rutinas.js, y al revés (no se queda atrás si cambia el registro).
// 3. Roles rotos a propósito: los dos validadores ven lo mismo (pre que nadie da, acción desconocida, peso fuera de escala,
//    estilo que no existe, etapa repetida) y JS = Python también en los errores.
// Uso: node bot/probar_perfiles_seco.js   (necesita python3 en el PATH)
const path = require('path')
const { execFileSync } = require('child_process')
const v2 = require('./perfil_v2')

let pruebas = 0, fallos = 0
const ok = (cond, que) => { pruebas++; if (!cond) { fallos++; console.log('  FALLO ' + que) } }
// Igualdad sin mirar el orden de las claves (Python y JS no ordenan igual los objetos).
const ordenar = (x) => Array.isArray(x) ? x.map(ordenar) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, ordenar(x[k])])) : x
const igual = (a, b) => JSON.stringify(ordenar(a)) === JSON.stringify(ordenar(b))
const ENT = path.join(__dirname, '..', 'entrenamiento')
const py = (codigo) => JSON.parse(execFileSync('python3', ['-c', codigo], { cwd: ENT, maxBuffer: 1 << 26 }).toString())

// 1 · los roles de verdad
const js = v2.todo()
const pyTodo = py('import json, perfiles_v2 as p; print(json.dumps(p.todo(), ensure_ascii=False))')
ok(igual(Object.keys(js), Object.keys(pyTodo)), `roles distintos: JS ${Object.keys(js)} · Python ${Object.keys(pyTodo)}`)
for (const n of Object.keys(js)) {
  ok(js[n].errores.length === 0, `${n}: ${js[n].errores.join('; ')}`)
  ok(igual(js[n], pyTodo[n]), `${n}: JS y Python no resuelven igual`)
  console.log(`  1 · ${n}: ${js[n].etapas.length} etapas (${js[n].etapas.map(e => e.id).join(' → ')}), JS = Python`)
}
ok(['casual', 'speedrunner'].every(n => js[n]), 'faltan casual o speedrunner')

// 2 · el catálogo frente al registro de habilidades
process.env.IO_SERVIDOR = process.env.IO_SERVIDOR || 'supervivencia'
const { HABILIDADES } = require('./habilidades')
const cat = v2.catalogo()
const { RUTINAS } = require('./rutinas')
const sueltas = cat.acciones.filter(a => a.startsWith('rutina_') ? !RUTINAS[a] : a !== 'conseguir' && !HABILIDADES[a]) // conseguir: io.js (conseguir.js)
ok(sueltas.length === 0, `acciones del catálogo que no son habilidades: ${sueltas.join(', ')}`)
const nuevas = [...Object.keys(HABILIDADES), ...Object.keys(RUTINAS)].filter(h => !cat.acciones.includes(h))
ok(nuevas.length === 0, `habilidades que faltan en el catálogo: ${nuevas.join(', ')}`)
console.log(`  2 · ${cat.acciones.length} acciones del catálogo frente a ${Object.keys(HABILIDADES).length} habilidades`)

// 3 · roles rotos
const base = v2.cargar('casual')
const rotos = {
  'pre que nadie da': { ...base, etapas: [{ id: 'hierro' }] },
  'acción desconocida': { ...base, etapas: [{ id: 'madera', hacer: ['volar 3'] }] },
  'peso fuera de escala': { ...base, pesos: { ...base.pesos, riesgo: 7 } },
  'estilo que no existe': { ...base, estilos: { madera: 'leñador', noche: 'supervivencia' } },
  'etapa repetida': { ...base, etapas: [{ id: 'madera' }, { id: 'madera' }] },
  'objetivo con clave rara': { ...base, etapas: [{ id: 'madera', objetivo: { inv: { oro_puro: 3 } } }] },
}
const pyRotos = py(`import json, perfiles_v2 as p
rotos = json.loads(${JSON.stringify(JSON.stringify(rotos))})
cat = p.catalogo()
print(json.dumps({k: p.validar(r, cat, "casual") for k, r in rotos.items()}, ensure_ascii=False))`)
for (const [k, r] of Object.entries(rotos)) {
  const e = v2.validar(r, cat, 'casual')
  ok(e.length > 0, `${k}: el validador JS no ve nada`)
  ok(igual(e, pyRotos[k]), `${k}: JS ${JSON.stringify(e)} · Python ${JSON.stringify(pyRotos[k])}`)
  console.log(`  3 · ${k}: ${e[0]}`)
}

console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
