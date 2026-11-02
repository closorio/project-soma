// Importa un .litematic (Litematica, NBT con gzip) al catálogo: bot/estructuras/<id>.json y bot/materiales/<id>.json.
// Sin juego ni red. Uso: node herramientas/importar_estructura.js ARCHIVO.litematic ID [ALIAS[,ALIAS…]]   (o make import-structure)
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const BOT = path.join(__dirname, '..', 'bot')
const nbt = require(path.join(BOT, 'node_modules', 'prismarine-nbt'))
const estructuras = require(path.join(BOT, 'estructuras'))

const VERSION = '1.21.11'
const AIRE = new Set(['air', 'cave_air', 'void_air'])
// Bloques que Mojang renombró desde la 1.13 (los .litematic viejos aún los traen). Solo estos: cualquier otro nombre desconocido es error
const RENOMBRADOS = { grass: 'short_grass', grass_path: 'dirt_path', chain: 'iron_chain' }

// "minecraft:oak_stairs" + {half, facing} → "oak_stairs[facing=north,half=bottom]" (propiedades por orden alfabético)
function estadoDe(entrada) {
  const viejo = String(entrada.Name).replace(/^minecraft:/, ''), nombre = RENOMBRADOS[viejo] || viejo
  const p = entrada.Properties || {}
  const claves = Object.keys(p).sort()
  return claves.length ? `${nombre}[${claves.map(k => `${k}=${p[k]}`).join(',')}]` : nombre
}

// El long[] de NBT sale como pares [alto, bajo] de int32: a BigInt sin signo de 64 bits
const aBigInt = ([hi, lo]) => BigInt.asUintN(64, (BigInt(hi) << 32n) | BigInt(lo >>> 0))

// Índices de paleta de una región: empaquetados de forma continua (sin el relleno de los chunks vanilla), un valor puede cruzar dos longs
function desempaquetar(longs, n, paleta) {
  const bits = Math.max(2, Math.ceil(Math.log2(paleta)))
  const mascara = (1n << BigInt(bits)) - 1n
  const w = longs.map(aBigInt)
  const salida = new Array(n)
  for (let i = 0; i < n; i++) {
    const ini = i * bits, k = Math.floor(ini / 64), off = BigInt(ini % 64)
    let v = w[k] >> off
    if (Number(off) + bits > 64) v |= w[k + 1] << (64n - off)
    salida[i] = Number(v & mascara)
  }
  return salida
}

// buf: el .litematic entero. opts: { id, alias, fuente, registry } → { estructura, materiales }; error con la lista si hay bloques que no existen
function importar(buf, opts) {
  const registry = opts.registry || require(path.join(BOT, 'node_modules', 'minecraft-data'))(VERSION)
  const raiz = nbt.simplify(nbt.parseUncompressed(zlib.gunzipSync(buf)))
  const regiones = Object.entries(raiz.Regions || {})
  if (!regiones.length) throw new Error('el archivo no tiene Regions: ¿es un .litematic?')

  // cada región: caja absoluta [min, max] (Size puede ser negativo: se toma el valor absoluto y se corrige con Position)
  const cajas = regiones.map(([nombre, r]) => {
    const min = ['x', 'y', 'z'].map(a => r.Position[a] + (r.Size[a] < 0 ? r.Size[a] + 1 : 0))
    const tam = ['x', 'y', 'z'].map(a => Math.abs(r.Size[a]))
    return { nombre, r, min, tam }
  })
  const min = [0, 1, 2].map(i => Math.min(...cajas.map(c => c.min[i])))
  const max = [0, 1, 2].map(i => Math.max(...cajas.map(c => c.min[i] + c.tam[i] - 1)))
  const dim = [0, 1, 2].map(i => max[i] - min[i] + 1)

  const paleta = [], idx = new Map(), desconocidos = new Set(), renombrados = new Set(), puestos = new Map()
  for (const { r, min: m, tam: [X, Y, Z] } of cajas) {
    const estados = r.BlockStatePalette.map(e => {
      const estado = estadoDe(e), nombre = estructuras.nombre(estado)
      if (!registry.blocksByName[nombre]) desconocidos.add(nombre)
      const viejo = String(e.Name).replace(/^minecraft:/, '')
      if (viejo !== nombre) renombrados.add(`${viejo} → ${nombre}`)
      return estado
    })
    const ind = desempaquetar(r.BlockStates, X * Y * Z, estados.length)
    for (let y = 0; y < Y; y++) for (let z = 0; z < Z; z++) for (let x = 0; x < X; x++) {
      const estado = estados[ind[y * X * Z + z * X + x]]
      if (AIRE.has(estructuras.nombre(estado))) continue // el aire de una región no borra lo que puso otra
      if (!idx.has(estado)) { idx.set(estado, paleta.length); paleta.push(estado) }
      puestos.set(`${m[0] + x - min[0]},${m[1] + y - min[1]},${m[2] + z - min[2]}`, idx.get(estado))
    }
  }
  if (desconocidos.size) throw new Error(`bloques que no existen en ${VERSION}: ${[...desconocidos].sort().join(', ')}`)

  const bloques = [...puestos].map(([k, i]) => [...k.split(',').map(Number), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2] || a[0] - b[0])
  const materiales = {}, sinConseguir = new Set(), notas = {}
  // materiales y sinConseguir van siempre por nombre de objeto; un bloque sin objeto conocido va a sinConseguir con su nombre y una nota
  for (const b of bloques) {
    const estado = paleta[b[3]], nombre = estructuras.nombre(estado)
    for (const o of estructuras.objetosDe(estado)) {
      if (!registry.itemsByName[o.item]) { sinConseguir.add(nombre); notas[nombre] = `sin objeto en ${VERSION}: se pone a mano`; continue }
      materiales[o.item] = (materiales[o.item] || 0) + o.n
      if (estructuras.sinConseguir(estado)) { sinConseguir.add(o.item); notas[o.item] = 'no se consigue en supervivencia temprana' }
      if (nombre === 'grass_block') notas.dirt = 'incluye bloques de hierba: sirve tierra'
      if (o.item.endsWith('_bucket')) notas[o.item] = 'un cubo por cada fuente del diseño'
    }
  }
  const ordenado = Object.fromEntries(Object.entries(materiales).sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)))
  const nombre = opts.nombre || opts.id.replace(/_/g, ' ')
  const estructura = {
    id: opts.id, nombre, alias: opts.alias || [], fuente: opts.fuente || '', dim, paleta, bloques,
    materiales: ordenado, sinConseguir: [...sinConseguir].sort(), notas,
  }
  if (renombrados.size) estructura.renombrados = [...renombrados].sort() // nombres de una versión anterior, cambiados al importar
  // `importado` marca la lista como generada: escribir() no pisa las escritas a mano (granja_piedra) sin --force
  const lista = { nombre, origen: `${opts.fuente || opts.id} (${dim.join('×')}, ${bloques.length} bloques; importado para MC ${VERSION})`, importado: true, materiales: ordenado, notas }
  return { estructura, materiales: lista }
}

// Una línea por bloque y por entrada de paleta: el JSON se puede leer y comparar en git
function serializar(e) {
  const filas = (a) => '[\n  ' + a.map(x => JSON.stringify(x)).join(',\n  ') + '\n ]'
  return '{\n' + Object.entries(e).map(([k, v]) => ` ${JSON.stringify(k)}: ${k === 'bloques' || k === 'paleta' ? filas(v) : JSON.stringify(v)}`).join(',\n') + '\n}\n'
}

// Una lista de materiales que no hizo el importador (sin `importado`) no se pisa salvo con forzar; se comprueba antes de escribir nada
function escribir({ estructura, materiales }, dirEstructuras, dirMateriales, forzar = false) {
  const fm = path.join(dirMateriales, estructura.id + '.json')
  if (!forzar && fs.existsSync(fm)) {
    let previa = null
    try { previa = JSON.parse(fs.readFileSync(fm, 'utf8')) } catch (_) {}
    if (!previa || !previa.importado) throw new Error(`${fm} está escrita a mano: elige otro NAME= o repite con FORCE=1`)
  }
  fs.mkdirSync(dirEstructuras, { recursive: true })
  fs.writeFileSync(path.join(dirEstructuras, estructura.id + '.json'), serializar(estructura))
  fs.writeFileSync(fm, JSON.stringify(materiales, null, 1) + '\n')
}

module.exports = { importar, escribir, serializar, desempaquetar, estadoDe, RENOMBRADOS }

if (require.main === module) {
  const args = process.argv.slice(2), forzar = args.includes('--force')
  const [archivo, id, alias] = args.filter(a => a !== '--force')
  if (!archivo || !id || !/^[a-z0-9_]+$/.test(id)) {
    console.error('uso: make import-structure FILE=catalogo/x.litematic NAME=casa_roble [ALIAS="casa de roble"] [FORCE=1]   (NAME: minúsculas, números y _)')
    process.exit(1)
  }
  try {
    const r = importar(fs.readFileSync(archivo), {
      id, fuente: path.basename(archivo), alias: (alias || '').split(',').map(s => s.trim()).filter(Boolean),
    })
    escribir(r, estructuras.DIR, path.join(BOT, 'materiales'), forzar)
    const e = r.estructura
    console.log(`${id}: ${e.dim.join('×')}, ${e.bloques.length} bloques, ${Object.keys(e.materiales).length} materiales` +
      (e.sinConseguir.length ? `, sin conseguir: ${e.sinConseguir.join(', ')}` : '') + (e.renombrados ? `, renombrados: ${e.renombrados.join(', ')}` : ''))
  } catch (err) {
    console.error('ERROR: ' + err.message)
    process.exit(1)
  }
}
