// Prueba en seco de los perfiles v2 (F8.0a; bot/perfil_v2.js y entrenamiento/perfiles_v2.py), sin servidor:
// 1. Los roles de perfiles/v2/ no tienen errores, y JS y Python dan las mismas etapas resueltas y los mismos errores.
// 2. Las acciones del catálogo existen en bot/habilidades o en bot/rutinas.js, y al revés (no se queda atrás si cambia el registro).
// 3. Roles rotos a propósito: los dos validadores ven lo mismo (pre que nadie da, acción desconocida, peso fuera de escala,
//    estilo que no existe, etapa repetida) y JS = Python también en los errores.
// 4. Composición de submodos: cada regla, con submodos de prueba, y que la lista plana no cambia al componer.
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

// 4 · composición de submodos, con un catálogo de prueba
const sm = (nombre, etapas, extra = {}) => ({ v: 2, nombre, identidad: nombre, dueno: 'seppuq', epica: 'E1', madurez: 'funciona', etapas, ...extra })
const catP = { ...cat, submodos: {
  base: sm('base', [{ id: 'madera' }, { id: 'herr_madera' }]),
  a: sm('a', [{ submodo: 'base' }, { id: 'piedra' }]),
  b: sm('b', [{ submodo: 'base' }, { id: 'herr_piedra' }]),
  otra: sm('otra', [{ id: 'madera', max_s: 7 }]),
  c1: sm('c1', [{ submodo: 'c2' }]), c2: sm('c2', [{ submodo: 'c1' }]),
  n1: sm('n1', [{ submodo: 'n2' }]), n2: sm('n2', [{ submodo: 'n3' }]), n3: sm('n3', [{ submodo: 'n4' }]), n4: sm('n4', [{ submodo: 'n5' }]), n5: sm('n5', [{ id: 'madera' }]),
  hondo: sm('hondo', [{ id: 'madera' }], { exige: { y_min: -58 } }),
  listo: sm('listo', [{ id: 'madera' }], { madurez: 'aceptado' }),
  mal: { v: 1, nombre: 'otro', etapas: [], exige: { sed: 1 } },
} }
const etq = (r) => v2.resolver(r, catP)
const conBase = etq({ etapas: [{ submodo: 'base' }, { id: 'piedra' }] })
ok(igual(conBase, v2.resolver({ etapas: [{ id: 'madera' }, { id: 'herr_madera' }, { id: 'piedra' }] }, cat)), 'incluir un submodo no da lo mismo que escribir sus etapas')
const conCambia = etq({ etapas: [{ submodo: 'base', cambia: { madera: { max_s: 9 } } }] })
ok(conCambia[0].max_s === 9 && conCambia[0].id === 'madera' && conCambia[1].max_s === v2.resolver({ etapas: [{ id: 'herr_madera' }] }, cat)[0].max_s, 'cambia no se aplica solo a su etapa')
ok(etq({ etapas: [{ submodo: 'otra', cambia: { madera: { max_s: 9 } } }] })[0].max_s === 9, 'cambia no gana al submodo')
ok(etq({ etapas: [{ submodo: 'otra' }] })[0].max_s === 7, 'el submodo no gana al catálogo')
ok(igual(etq({ etapas: [{ submodo: 'a' }, { submodo: 'b' }] }).map(e => e.id), ['madera', 'herr_madera', 'piedra', 'herr_piedra']), 'el diamante igual no se queda con la primera')
const rotosSub = {
  'submodo que no existe': [{ ...base, etapas: [{ submodo: 'nada' }] }, 'no existe'],
  ciclo: [{ ...base, etapas: [{ submodo: 'c1' }] }, 'c1 → c2 → c1: ciclo'],
  'más de 4 niveles': [{ ...base, etapas: [{ submodo: 'n1' }] }, 'más de 4 niveles'],
  'diamante distinto': [{ ...base, etapas: [{ submodo: 'base' }, { submodo: 'otra' }] }, 'llega distinta desde'],
  'cambia sobre etapa ajena': [{ ...base, etapas: [{ submodo: 'base', cambia: { piedra: { max_s: 9 } } }] }, 'cambia.piedra no es una etapa de base'],
  'cadena rota tras componer': [{ ...base, etapas: [{ submodo: 'b' }] }, 'no lo da ninguna etapa anterior'],
  'exige que el rol no cumple': [{ ...base, etapas: [{ submodo: 'hondo' }] }, 'exige y_min ≤ -58 y el rol tiene 0'],
  'aceptado con pieza sin aceptar': [{ ...base, madurez: 'aceptado', etapas: [{ submodo: 'base' }] }, 'no puede estar aceptado'],
}
const entradas = Object.fromEntries(Object.entries(rotosSub).map(([k, [r]]) => [k, r]))
const pySub = py(`import json, perfiles_v2 as p
d = json.loads(${JSON.stringify(JSON.stringify({ cat: catP, rotos: entradas }))})
print(json.dumps({"rotos": {k: p.validar(r, d["cat"], "casual") for k, r in d["rotos"].items()}, "subs": {n: p.validar_submodo(n, d["cat"]) for n in d["cat"]["submodos"]}, "plana": {k: p.resolver(r, d["cat"]) for k, r in d["rotos"].items()}}, ensure_ascii=False))`)
for (const [k, [r, espera]] of Object.entries(rotosSub)) {
  const e = v2.validar(r, catP, 'casual')
  ok(e.some(x => x.includes(espera)), `${k}: esperaba «${espera}» y da ${JSON.stringify(e)}`)
  ok(igual(e, pySub.rotos[k]), `${k}: JS ${JSON.stringify(e)} · Python ${JSON.stringify(pySub.rotos[k])}`)
  ok(igual(v2.resolver(r, catP), pySub.plana[k]), `${k}: JS y Python no resuelven igual`)
  console.log(`  4 · ${k}: ${e.find(x => x.includes(espera))}`)
}
ok(v2.validar({ ...base, madurez: 'aceptado', etapas: [{ submodo: 'listo' }] }, catP, 'casual').every(x => !x.includes('aceptado')), 'aceptado con todo aceptado no debería dar error')
ok(v2.validarSubmodo('mal', catP).length >= 5, 'el manifiesto roto no da errores')
ok(v2.validarSubmodo('c1', catP).some(x => x.includes('ciclo')), 'el manifiesto no ve el ciclo')
for (const n of Object.keys(catP.submodos)) ok(igual(v2.validarSubmodo(n, catP), pySub.subs[n]), `manifiesto ${n}: JS y Python no coinciden`)
// Los manifiestos de verdad
const subsJs = v2.todoSubmodos()
ok(igual(subsJs, py('import json, perfiles_v2 as p; print(json.dumps(p.todo_submodos(), ensure_ascii=False))')), 'manifiestos: JS y Python no coinciden')
for (const [n, e] of Object.entries(subsJs)) ok(e.length === 0, `submodo ${n}: ${e.join('; ')}`)

console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
