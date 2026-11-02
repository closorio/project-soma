// En seco: el retroceso de los golpes (retroceso.js). Con un 26.1 la velocidad del paquete (lpVec3, en bloques/tick) se queda
// tal cual en la entidad, aunque el oyente de mineflayer la haya dividido antes entre 8000; con un 1.21.8 no se toca nada.
const EventEmitter = require('events')
const { Vec3 } = require('vec3')
const retroceso = require('./retroceso')
let pruebas = 0, fallos = 0
const ok = (c, txt) => { pruebas++; if (!c) { fallos++; console.log('  FALLO ' + txt) } }

function bot(version) {
  const c = new EventEmitter(), yo = { id: 7, velocity: new Vec3(0, 0, 0) }, zombi = { id: 9, velocity: new Vec3(0, 0, 0) }
  const b = { _client: c, entity: yo, entities: { 7: yo, 9: zombi }, registry: require('minecraft-data')(version) }
  c.on('entity_velocity', (p) => (b.entities[p.entityId] ||= { id: p.entityId, velocity: new Vec3(0, 0, 0) }).velocity.set(p.velocity.x / 8000, p.velocity.y / 8000, p.velocity.z / 8000)) // el de mineflayer
  return b
}
const b = bot('26.1')
ok(retroceso.instalar(b), '26.1: se instala')
b._client.emit('entity_velocity', { entityId: 7, velocity: { x: 0.4, y: 0.36, z: -0.4 } })
ok(b.entity.velocity.x === 0.4 && b.entity.velocity.y === 0.36 && b.entity.velocity.z === -0.4, `26.1: el bot retrocede con la velocidad del paquete (${b.entity.velocity})`)
b._client.emit('entity_velocity', { entityId: 9, velocity: { x: -0.2, y: 0.1, z: 0 } })
ok(b.entities[9].velocity.x === -0.2, 'otra entidad: también su velocidad buena')
b._client.emit('entity_velocity', { entityId: 99, velocity: { x: 1, y: 1, z: 1 } }) // desconocida: no revienta
const v = bot('1.21.8')
ok(!retroceso.instalar(v), '1.21.8: no se instala (el formato viejo ya va bien)')
console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
