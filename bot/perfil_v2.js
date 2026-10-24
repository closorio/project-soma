// Perfiles v2 (roles de F8, PLAN_F8_perfiles.md): carga, resolución y validación en seco. Gemelo de entrenamiento/perfiles_v2.py:
// las dos dan la misma lista de etapas resuelta y los mismos errores (lo comprueba bot/probar_perfiles_seco.js); si cambia una
// regla aquí, cambia allí.
// Un rol (perfiles/v2/<rol>.json) elige etapas del catálogo común (perfiles/v2/_etapas.json) por id y puede cambiar sus campos.
const fs = require('fs')
const path = require('path')

const DIR = path.join(__dirname, '..', 'perfiles')
const DIR_V2 = path.join(DIR, 'v2')
const PESOS_V2 = ['madera', 'seguridad', 'tiempo', 'supervivencia', 'progreso', 'riesgo']
const TIPOS = ['madera', 'fabricar', 'mineral', 'comida', 'construir', 'explorar', 'dimension', 'combate']
const NOCHE = ['refugio', 'aprovechar_con_luz']
const COFRE = ['base', 'no']
const POR_DEFECTO = { pre: {}, max_s: 600, repetir: false }

const leer = (f) => JSON.parse(fs.readFileSync(f, 'utf8'))
const catalogo = () => leer(path.join(DIR_V2, '_etapas.json'))
const roles = () => fs.readdirSync(DIR_V2).filter(f => f.endsWith('.json') && !f.startsWith('_')).map(f => f.slice(0, -5)).sort()
const cargar = (nombre) => leer(path.join(DIR_V2, nombre + '.json'))
const esNumero = (v) => typeof v === 'number' && Number.isFinite(v)

// Las etapas del rol con los campos del catálogo, en orden: [{id, tipo, pre, objetivo, hacer, max_s, repetir}].
function resolver(rol, cat) {
  return (rol.etapas || []).map(e => {
    const r = { ...POR_DEFECTO, ...(cat.etapas[e.id] || {}), ...e }
    return Object.fromEntries(['id', 'tipo', 'pre', 'objetivo', 'hacer', 'max_s', 'repetir'].map(k => [k, r[k] === undefined ? null : r[k]]))
  })
}

function condicion(c, cat, donde, errores) {
  if (!c || typeof c !== 'object' || Array.isArray(c)) { errores.push(`${donde}: no es un objeto`); return }
  for (const [seccion, valores] of Object.entries(c)) {
    if (!cat.estado[seccion]) { errores.push(`${donde}: sección desconocida «${seccion}»`); continue }
    for (const [k, v] of Object.entries(valores)) {
      if (!cat.estado[seccion].includes(k)) errores.push(`${donde}: ${seccion}.${k} no está en el estado del catálogo`)
      else if (seccion === 'inv' && !(esNumero(v) && v > 0)) errores.push(`${donde}: ${seccion}.${k} debe ser un número > 0`)
      else if (seccion !== 'inv' && v !== true) errores.push(`${donde}: ${seccion}.${k} debe ser true`)
    }
  }
}

// Lo que falta de `pre` con lo que ya han dado las etapas anteriores (inv: el máximo dado; memoria e hitos: si se dieron).
function falta(pre, dado) {
  const out = []
  for (const [seccion, valores] of Object.entries(pre)) {
    for (const [k, v] of Object.entries(valores)) {
      if (seccion === 'inv') { if ((dado.inv[k] || 0) < v) out.push(`${seccion}.${k}=${v}`) }
      else if (!dado[seccion].has(k)) out.push(`${seccion}.${k}`)
    }
  }
  return out
}

function validar(rol, cat, nombre = null, v1 = null, escala = null) {
  const errores = []
  v1 = v1 || fs.readdirSync(DIR).filter(f => f.endsWith('.json') && !f.startsWith('_')).map(f => f.slice(0, -5)).sort()
  escala = escala || leer(path.join(DIR, '_escala.json'))
  if (rol.v !== 2) errores.push('v debe ser 2')
  if (nombre && rol.nombre !== nombre) errores.push(`nombre «${rol.nombre}» no es el del archivo (${nombre})`)
  if (typeof rol.identidad !== 'string' || !rol.identidad) errores.push('falta identidad')
  if (!Array.isArray(rol.sirve_a)) errores.push('sirve_a debe ser una lista')
  const estilos = rol.estilos || {}
  for (const k of ['madera', 'noche']) if (!v1.includes(estilos[k])) errores.push(`estilos.${k}: «${estilos[k]}» no es un perfil v1 (${v1.join(', ')})`)
  const pesos = rol.pesos || {}
  for (const k of PESOS_V2) {
    const p = pesos[k]
    if (!esNumero(p)) errores.push(`pesos.${k}: falta o no es un número`)
    else if (!(p >= 0 && p <= (escala[k] || 0))) errores.push(`pesos.${k}=${p} fuera de [0, ${escala[k]}] (_escala.json)`)
  }
  for (const k of Object.keys(pesos)) if (!PESOS_V2.includes(k)) errores.push(`pesos.${k}: peso desconocido`)
  const reglas = rol.reglas || {}
  if (!NOCHE.includes(reglas.noche)) errores.push(`reglas.noche: «${reglas.noche}» (${NOCHE.join(', ')})`)
  if (!(Number.isInteger(reglas.y_min) && reglas.y_min >= -64 && reglas.y_min <= 320)) errores.push('reglas.y_min: entero en [-64, 320]')
  if (!COFRE.includes(reglas.cofre)) errores.push(`reglas.cofre: «${reglas.cofre}» (${COFRE.join(', ')})`)
  const ids = (rol.etapas || []).map(e => e.id)
  if (!ids.length) errores.push('sin etapas')
  for (const i of [...new Set(ids.filter((x, k) => ids.indexOf(x) !== k))].sort()) errores.push(`etapa ${i} repetida`)
  const dado = { inv: {}, memoria: new Set(), hitos: new Set() }
  for (const e of resolver(rol, cat)) {
    const donde = `etapa ${e.id}`
    if (!cat.etapas[e.id]) { errores.push(`${donde}: no está en el catálogo`); continue }
    if (!TIPOS.includes(e.tipo)) errores.push(`${donde}: tipo «${e.tipo}» (${TIPOS.join(', ')})`)
    condicion(e.pre, cat, donde + ' (pre)', errores)
    if (!e.objetivo || !Object.keys(e.objetivo).length) errores.push(`${donde}: sin objetivo`)
    condicion(e.objetivo || {}, cat, donde + ' (objetivo)', errores)
    if (!Array.isArray(e.hacer) || !e.hacer.length) errores.push(`${donde}: hacer debe ser una lista no vacía`)
    else for (const paso of e.hacer) {
      const accion = typeof paso === 'string' && paso.trim() ? paso.split(/\s+/)[0] : ''
      if (!accion.startsWith('pendiente:') && !cat.acciones.includes(accion)) errores.push(`${donde}: «${paso}» no es una acción conocida (ni pendiente:)`)
    }
    if (!(Number.isInteger(e.max_s) && e.max_s > 0)) errores.push(`${donde}: max_s debe ser un entero > 0`)
    if (typeof e.repetir !== 'boolean') errores.push(`${donde}: repetir debe ser true o false`)
    if (e.pre && typeof e.pre === 'object' && !Array.isArray(e.pre)) for (const f of falta(e.pre, dado)) errores.push(`${donde}: pre ${f} no lo da ninguna etapa anterior`)
    for (const [seccion, valores] of Object.entries(e.objetivo || {})) {
      for (const [k, v] of Object.entries(valores)) {
        if (seccion === 'inv' && esNumero(v)) dado.inv[k] = Math.max(dado.inv[k] || 0, v)
        else if (seccion === 'memoria' || seccion === 'hitos') dado[seccion].add(k)
      }
    }
  }
  return errores
}

function todo() {
  const cat = catalogo()
  return Object.fromEntries(roles().map(n => [n, { etapas: resolver(cargar(n), cat), errores: validar(cargar(n), cat, n) }]))
}

module.exports = { DIR_V2, PESOS_V2, TIPOS, catalogo, roles, cargar, resolver, validar, todo }
