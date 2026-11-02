// Arma .litematic en memoria (2026-11-02): para la prueba en seco del catálogo (bot/probar_estructuras_seco.js) y para generar
// plantillas de prueba (catalogo/casita_prueba.litematic: node herramientas/litematic_sintetico.js casita catalogo/casita_prueba.litematic).
// Mismo formato que Litematica: por región Position, Size (puede ser negativo), BlockStatePalette y BlockStates empaquetado de forma
// continua (bits = max(2, ceil(log2(paleta)))), índice y*X*Z + z*X + x desde la esquina mínima de la región.
const fs = require('fs')
const path = require('path')
const zlib = require('zlib')
const nbt = require(path.join(__dirname, '..', 'bot', 'node_modules', 'prismarine-nbt'))

// Una región: pos y size como en el archivo; poner(x, y, z, i) con coordenadas absolutas e i = índice en la paleta de [nombre, props]
// (alPoner(x, y, z, i) se llama en cada una: la prueba apunta ahí lo que espera)
function region(pos, size, paleta, alPoner = () => {}) {
  const min = [0, 1, 2].map(i => pos[i] + (size[i] < 0 ? size[i] + 1 : 0)), tam = size.map(Math.abs)
  const valores = new Array(tam[0] * tam[1] * tam[2]).fill(0)
  return {
    pos, size, paleta, valores,
    poner(x, y, z, i) {
      const [lx, ly, lz] = [x - min[0], y - min[1], z - min[2]]
      if (lx < 0 || ly < 0 || lz < 0 || lx >= tam[0] || ly >= tam[1] || lz >= tam[2]) throw new Error('fuera de la región')
      valores[ly * tam[0] * tam[2] + lz * tam[0] + lx] = i
      alPoner(x, y, z, i)
    },
  }
}

// Empaqueta los índices de forma continua y los parte en longs como pares [alto, bajo] de int32 (lo que escribe prismarine-nbt)
function empaquetar(valores, tamPaleta) {
  const bits = Math.max(2, Math.ceil(Math.log2(tamPaleta)))
  let todo = 0n
  valores.forEach((v, i) => { todo |= BigInt(v) << BigInt(i * bits) })
  const longs = []
  for (let k = 0; k < Math.ceil(valores.length * bits / 64); k++) {
    const w = (todo >> BigInt(64 * k)) & ((1n << 64n) - 1n)
    longs.push([Number(BigInt.asIntN(32, w >> 32n)), Number(BigInt.asIntN(32, w))])
  }
  return longs
}

// El .litematic (gzip) con esas regiones
function litematic(regiones, nombre = 'sintetico') {
  const xyz = (v) => nbt.comp({ x: nbt.int(v[0]), y: nbt.int(v[1]), z: nbt.int(v[2]) })
  const entrada = ([n, props]) => nbt.comp(props
    ? { Name: nbt.string('minecraft:' + n), Properties: nbt.comp(Object.fromEntries(Object.entries(props).map(([k, v]) => [k, nbt.string(v)]))) }
    : { Name: nbt.string('minecraft:' + n) })
  const Regions = {}
  regiones.forEach((r, i) => {
    Regions['region' + i] = nbt.comp({
      Position: xyz(r.pos), Size: xyz(r.size),
      BlockStatePalette: nbt.list(nbt.comp(r.paleta.map(entrada).map(c => c.value))),
      BlockStates: nbt.longArray(empaquetar(r.valores, r.paleta.length)),
    })
  })
  const raiz = nbt.comp({ MinecraftDataVersion: nbt.int(4671), Version: nbt.int(6), Metadata: nbt.comp({ Name: nbt.string(nombre) }), Regions: nbt.comp(Regions) }, '')
  return zlib.gzipSync(nbt.writeUncompressed(raiz, 'big'))
}

// La casita de prueba del catálogo (5×5×5): suelo de tablones con una losa doble en el centro, muros de 3 con una puerta al sur, dos
// ventanas y una antorcha de pared dentro, y un tejado a 5 de alto (andamio) de escaleras en los bordes norte y sur y losas en medio
function casita() {
  const P = { facing: 'north', hinge: 'left', open: 'false', powered: 'false' }
  const paleta = [['air'], ['oak_planks'], ['oak_slab', { type: 'double', waterlogged: 'false' }], ['oak_door', { ...P, half: 'lower' }],
    ['oak_door', { ...P, half: 'upper' }], ['glass'], ['wall_torch', { facing: 'south' }],
    ['oak_stairs', { facing: 'south', half: 'bottom', shape: 'straight', waterlogged: 'false' }],
    ['oak_stairs', { facing: 'north', half: 'bottom', shape: 'straight', waterlogged: 'false' }], ['oak_slab', { type: 'bottom', waterlogged: 'false' }]]
  const r = region([0, 0, 0], [5, 5, 5], paleta)
  for (let x = 0; x < 5; x++) for (let z = 0; z < 5; z++) {
    r.poner(x, 0, z, x === 2 && z === 2 ? 2 : 1)
    if (x === 0 || x === 4 || z === 0 || z === 4) for (let y = 1; y <= 3; y++) r.poner(x, y, z, 1)
    r.poner(x, 4, z, z === 0 ? 8 : z === 4 ? 7 : 9) // tejado: escaleras mirando hacia fuera en los bordes norte y sur
  }
  r.poner(2, 1, 4, 3); r.poner(2, 2, 4, 4) // la puerta, al sur
  r.poner(0, 2, 2, 5); r.poner(4, 2, 2, 5) // ventanas
  r.poner(2, 2, 1, 6) // antorcha en la cara sur del muro norte
  return litematic([r], 'casita_prueba')
}

// Un .nbt de estructura (bloque de estructura del juego): size, palette [[nombre, props]], blocks [[x, y, z, i, nbt?]] (2026-11-02)
function estructuraNbt(size, paleta, bloques) {
  const entrada = ([n, props]) => (props
    ? { Name: nbt.string('minecraft:' + n), Properties: nbt.comp(Object.fromEntries(Object.entries(props).map(([k, v]) => [k, nbt.string(v)]))) }
    : { Name: nbt.string('minecraft:' + n) })
  const bloque = ([x, y, z, i, extra]) => ({ pos: nbt.list(nbt.int([x, y, z])), state: nbt.int(i),
    ...(extra ? { nbt: nbt.comp(Object.fromEntries(Object.entries(extra).map(([k, v]) => [k, nbt.string(v)]))) } : {}) })
  const raiz = nbt.comp({
    DataVersion: nbt.int(4671), size: nbt.list(nbt.int(size)), entities: nbt.list(nbt.comp([])),
    palette: nbt.list(nbt.comp(paleta.map(entrada))), blocks: nbt.list(nbt.comp(bloques.map(bloque))),
  }, '')
  return zlib.gzipSync(nbt.writeUncompressed(raiz, 'big'))
}

module.exports = { region, empaquetar, litematic, casita, estructuraNbt }

if (require.main === module) {
  const [que, salida] = process.argv.slice(2)
  if (que !== 'casita' || !salida) { console.error('uso: node herramientas/litematic_sintetico.js casita SALIDA.litematic'); process.exit(1) }
  fs.writeFileSync(salida, casita())
  console.log(`escrito ${salida}`)
}
