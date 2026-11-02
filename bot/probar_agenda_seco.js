// Prueba en seco de la agenda (bot/agenda.js, 2026-11-01): cola, reemplazo, urgencias que se reanudan, repeticiones, reintentos y el
// parser de varias órdenes (ordenes.interpretarVarias). Sin Minecraft: node bot/probar_agenda_seco.js
const { Agenda, clasificar, recuperar, espera, REINTENTOS } = require('./agenda')
const ordenes = require('./ordenes')
let pruebas = 0, fallos = 0
const ok = (c, m) => { pruebas++; if (!c) { fallos++; console.log('FALLA: ' + m) } }

const a = new Agenda()
const x = a.entrada({ tipo: 'tala' }, 'tala 5', 'yo'), y = a.entrada({ tipo: 'guarda' }, 'guarda', 'yo')
a.reemplazar(x); a.encolar(y)
ok(a.siguiente() === x && a.lista().length === 2, 'cola: la cabeza va primero')
const z = a.entrada({ tipo: 'ataca' }, 'ataca', 'yo')
ok(a.reemplazar(z) === x && a.siguiente() === z && a.cola[1] === y, 'reemplazar: la nueva manda, devuelve la vieja y la cola sigue')
const u = a.entrada({ tipo: 'recupera' }, 'recuperar', 'auto')
a.interrumpir(u)
ok(a.siguiente() === u, 'urgencia: va antes que la cola')
ok(clasificar(z, { exito: false }, 'interrupcion') === 'interrumpida', 'cortada por urgencia: interrumpida (se queda)')
a.anotar(u, clasificar(u, { exito: true }, null))
ok(a.siguiente() === z, 'al acabar la urgencia, se retoma lo de debajo')
ok(clasificar(z, { exito: false }, 'usuario') === 'cortada', 'cortada por el usuario')

const b = a.entrada({ tipo: 'ataca' }, 'ataca', 'yo', { tipo: 'bucle' })
ok(clasificar(b, { exito: true }) === 'repetir', 'bucle: tras un éxito, otra vuelta')
ok(clasificar(b, { exito: false, texto: 'No pude: zona protegida' }) === 'reintentar', 'bucle: cualquier fallo se reintenta')
b.fallosSeguidos = REINTENTOS.bucle - 1
ok(clasificar(b, { exito: false, texto: 'No veo ningún monstruo cerca.' }) === 'definitiva', 'bucle: con el tope de fallos, se rinde')
const v = a.entrada({ tipo: 'recoge' }, 'recoge', 'yo', { tipo: 'veces', n: 3 })
ok(clasificar(v, { exito: true }) === 'repetir', 'veces: 1/3 → repetir')
v.vueltas = 2; ok(clasificar(v, { exito: true }) === 'hecha', 'veces: 3/3 → hecha')
const n = a.entrada({ tipo: 'ven' }, 'ven', 'yo')
ok(clasificar(n, { exito: false, texto: 'No llego hasta ti (sin camino).' }) === 'reintentar', 'una: fallo pasajero → reintentar')
ok(clasificar(n, { exito: false, texto: 'Estás en zona protegida.' }) === 'definitiva', 'una: fallo que no cambia → definitiva')
{ // 2026-11-02: dormir con monstruos cerca se queda en la cola, mata al más cercano y vuelve a la cama
  const d = a.entrada({ tipo: 'duerme' }, 'duerme', 'chat de x')
  const fallo = { exito: false, texto: 'No pude usar la cama: monstruos cerca.' }
  ok(clasificar(d, fallo, null) === 'reintentar', 'duerme con monstruos cerca: reintentar (no se pierde)')
  ok(JSON.stringify(recuperar(fallo.texto)) === '{"tipo":"ataca","de":null}', 'duerme con monstruos cerca: antes, a por el más cercano')
  ok(clasificar(d, { exito: false, texto: 'No pude usar la cama: amenaza: zombie a 5.' }, null) === 'reintentar', 'cortada por una amenaza: reintentar')
  d.fallosSeguidos = 4; ok(clasificar(d, fallo, null) === 'reintentar', 'aguanta hasta 5 fallos seguidos por monstruos')
  d.fallosSeguidos = 5; ok(clasificar(d, fallo, null) === 'definitiva', 'al sexto, se rinde')
}
n.fallosSeguidos = REINTENTOS.una - 1
ok(clasificar(n, { exito: false, texto: 'sin camino' }) === 'definitiva', 'una: agotados los reintentos → definitiva')
const h = a.entrada({ tipo: 'ataca' }, 'ataca', 'yo', { tipo: 'hasta' })
ok(clasificar(h, { exito: false, texto: 'Se fue.' }) === 'reintentar' && clasificar(h, { exito: true }) === 'hecha', 'hasta: reintenta hasta lograrlo')
ok(espera(1) === 2000 && espera(9) === 30000, 'esperas crecientes con tope')
ok(recuperar('No llego (sin camino)').tipo === 'desatascate' && recuperar('Son demasiados: no peleo.').tipo === 'huye' && recuperar('Se fue.') === null, 'recuperar según la causa')
const w = new Agenda(); w.reemplazar(x); w.encolar(y); w.enEspera = true
ok(w.siguiente() === null, 'en espera («para»): la cola no avanza'); w.vaciar(); ok(w.vacia(), 'para todo: vacía')

const casos = [
  ['tala 5 troncos y luego guarda en el cofre', ['tala', 'guarda']],
  ['ataca a pepe sin parar', ['ataca'], 'bucle'],
  ['recoge 3 veces', ['recoge'], 'veces'],
  ['ataca al zombi hasta que muera', ['ataca'], 'hasta'],
  ['tala 5, después recoge', ['tala', 'recoge']],
  ['para todo', ['para_todo']], ['salta', ['salta']], ['cola', ['agenda']], ['para', ['quedate']],
  ['al terminar quedate quieto', ['despues']],
]
for (const [t, tipos, rep] of casos) {
  const l = ordenes.interpretarVarias(t)
  ok(l && l.map(o => o.tipo).join() === tipos.join() && (!rep || l[0].repeticion.tipo === rep), `«${t}» → ${JSON.stringify(l)}`)
}
ok(ordenes.interpretarVarias('tala 5 y luego bla bla') === null, 'una parte sin entender: nada')

console.log(fallos ? `${fallos} de ${pruebas} comprobaciones FALLAN` : `${pruebas}/${pruebas} comprobaciones bien`)
process.exit(fallos ? 1 : 0)
