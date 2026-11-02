// La agenda de un personaje (2026-11-01, pedido del usuario: colas, bucles y que no se bloquee por cualquier cosa). Función pura: la
// usa el supervisor de io.js (ordenAccion/supervisar) y la prueba bot/probar_agenda_seco.js.
//   pila  urgencias que van antes que la cola (recuperar al morir, volver a casa con peligro); al acabar, se reanuda lo de debajo
//   cola  la orden en curso (la cabeza) y las siguientes («tala 5 y luego guarda»)
// Cada entrada: { id, o, texto, quien, repeticion: {tipo: una|veces|bucle|hasta, n}, vueltas, fallosSeguidos, desde }.
// Una orden nueva reemplaza la cabeza (la vieja va a «continúa», como antes); «y luego» encola. Solo en memoria: sobrevive a morir y
// a reconectar, no a reiniciar el proceso.
// Tras cada vuelta, clasificar() dice qué hacer con la entrada:
//   interrumpida  la cortó una urgencia: se queda, se retoma al vaciarse la pila
//   cortada       la cortó el usuario (para, salta) o una orden nueva: ya está fuera
//   hecha         terminó bien y no se repite: fuera
//   repetir       terminó bien y es veces/bucle (o hasta, sin cumplirse): otra vuelta
//   reintentar    falló por algo pasajero (sin camino, perdido, no veo…): espera (ESPERAS) y otra vuelta, tras la recuperación de RECUPERAR
//   definitiva    falló por algo que no cambia (zona protegida, no sé, falta material) o agotó los reintentos: fuera
const PASAJERO = /sin camino|perdid|tiempo agotado|no (?:te |le |lo )?veo|no llego|no alcanzo|no encuentro|huy[oó]|se (?:me )?(?:fue|escapa)|salud baja|muy herido|demasiad|atascad|peligro|monstruos cerca|cama: amenaza/i
const REINTENTOS = { una: 2, veces: 5, hasta: 30, bucle: 30 } // fallos seguidos antes de rendirse
const REINTENTOS_MONSTRUOS = 6 // para «monstruos cerca» al dormir
const ESPERAS = [2000, 5000, 15000, 30000] // antes de cada reintento (el último se repite)
const TOPE_VUELTAS = 500 // bucle: tope de seguridad

// Recuperación antes de reintentar, por la causa del fallo: una orden auxiliar (va a la pila) o null (solo esperar).
function recuperar(texto) {
  const t = String(texto || '')
  if (/sin camino|atascad/i.test(t)) return { tipo: 'desatascate' }
  if (/demasiad|peligro/i.test(t)) return { tipo: 'huye', de: null }
  // 2026-11-02: no se duerme con monstruos cerca: antes de reintentar, a por el más cercano (va a la pila); luego vuelve a la cama
  if (/monstruos cerca|cama: amenaza/i.test(t)) return { tipo: 'ataca', de: null }
  if (/salud baja|muy herido/i.test(t)) return { tipo: 'come' }
  return null
}

function clasificar(e, r, motivo) {
  if (motivo === 'interrupcion') return 'interrumpida'
  if (motivo) return 'cortada'
  const tipo = e.repeticion.tipo
  if (r && r.exito) {
    if (tipo === 'una' || tipo === 'hasta') return 'hecha'
    if (tipo === 'veces') return e.vueltas + 1 >= e.repeticion.n ? 'hecha' : 'repetir'
    return e.vueltas + 1 >= TOPE_VUELTAS ? 'hecha' : 'repetir'
  }
  const texto = (r && (r.texto || r.causa)) || ''
  if (!PASAJERO.test(texto)) return tipo === 'bucle' ? 'reintentar' : 'definitiva' // en bucle todo cuenta como pasajero, con su tope
  // con monstruos cerca de la cama, más paciencia: de noche salen varios, uno tras otro, y se les mata antes de volver a intentarlo
  const limite = /monstruos cerca|cama: amenaza/i.test(texto) ? Math.max(REINTENTOS[tipo], REINTENTOS_MONSTRUOS) : REINTENTOS[tipo]
  return e.fallosSeguidos + 1 >= limite ? 'definitiva' : 'reintentar'
}
const espera = (fallos) => ESPERAS[Math.min(Math.max(fallos - 1, 0), ESPERAS.length - 1)]

class Agenda {
  constructor() { this.pila = []; this.cola = []; this.ids = 0; this.enEspera = false }
  entrada(o, texto, quien, repeticion) {
    return { id: ++this.ids, o, texto, quien, repeticion: repeticion || o.repeticion || { tipo: 'una' }, vueltas: 0, fallosSeguidos: 0, desde: Date.now() }
  }
  // La nueva manda: sustituye a la cabeza de la cola (que devuelve, para «continúa») y vacía la pila (lo urgente lo decide el usuario).
  reemplazar(e) { const vieja = this.cola.shift() || null; this.pila = []; this.cola.unshift(e); this.enEspera = false; return vieja }
  encolar(e) { this.cola.push(e); return this.cola.length }
  interrumpir(e) { this.pila.push(e) }
  siguiente() { return this.pila.length ? this.pila[this.pila.length - 1] : this.enEspera ? null : this.cola[0] || null }
  quitar(e) {
    const i = this.pila.indexOf(e); if (i >= 0) { this.pila.splice(i, 1); return true }
    const j = this.cola.indexOf(e); if (j >= 0) { this.cola.splice(j, 1); return true }
    return false
  }
  vaciar() { const n = this.pila.length + this.cola.length; this.pila = []; this.cola = []; this.enEspera = false; return n }
  vacia() { return !this.pila.length && !this.cola.length }
  // Aplica la clasificación a la entrada (vueltas, fallos, fuera) y devuelve la espera antes de la siguiente vuelta (ms).
  anotar(e, clase) {
    if (clase === 'repetir') { e.vueltas++; e.fallosSeguidos = 0; return 0 }
    if (clase === 'reintentar') { e.fallosSeguidos++; return espera(e.fallosSeguidos) }
    if (clase === 'hecha' || clase === 'definitiva') this.quitar(e)
    return 0
  }
  lista() {
    const rep = (e) => e.repeticion.tipo === 'bucle' ? ' (en bucle)' : e.repeticion.tipo === 'veces' ? ` (${e.vueltas}/${e.repeticion.n})` : e.repeticion.tipo === 'hasta' ? ' (hasta lograrlo)' : ''
    return [...this.pila.slice().reverse().map(e => `urgente: ${e.texto}`), ...this.cola.map((e, i) => `${i ? i + '.' : 'ahora:'} ${e.texto}${rep(e)}`)]
  }
}

module.exports = { Agenda, clasificar, recuperar, espera, PASAJERO, REINTENTOS, TOPE_VUELTAS }
