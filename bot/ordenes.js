// Órdenes en lenguaje sencillo (F4), las mismas por el chat del juego y por el puerto de control (para Ío, el asistente de voz).
// interpretar(texto) → { tipo, ... } o null si no la entiende. Sin tildes ni mayúsculas, admite «por favor», infinitivos y
// plurales («talad», «quedaos»). destinatario(texto, nombres) separa a quién va: «Eco, tala 3 troncos», «todos: quietos».
//   ven · sígueme · quédate (para, quieto) · tala N troncos · recoge [todo] · guarda en el cofre · huye [de X]
//   modo libre · modo órdenes · al terminar quieto|libre · perfil NOMBRE · estado · ayuda
//   F7.2 (supervivencia): come · ataca [al zombi] · refúgiate · sal (del refugio) · duerme / espera al día · fabrica [una espada de
//   piedra] · equípate · apártate · caza (busca comida)
const NUMEROS = { un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10,
  once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17, dieciocho: 18, diecinueve: 19, veinte: 20,
  veinticinco: 25, treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, docena: 12 }
const MOBS = { zombi: 'zombie', zombie: 'zombie', zombis: 'zombie', esqueleto: 'skeleton', esqueletos: 'skeleton', arana: 'spider',
  aranas: 'spider', creeper: 'creeper', creepers: 'creeper', bruja: 'witch', aldeano: 'villager', oveja: 'sheep', vaca: 'cow' }
const MAX_TRONCOS = 64 // límite de seguridad de «tala N troncos»
const AYUDA = 'Puedo: ven, sígueme, quédate, tala N troncos, recoge, guarda en el cofre, huye, modo libre, modo órdenes, ' +
  'al terminar quieto o libre, perfil NOMBRE, estado, explora hacia el norte N [nadando] y, dentro del rectángulo de obras: mina N piedras, ' +
  'construye una cabaña, deshaz la cabaña, vuelve al campamento, campamento aquí; y para sobrevivir: come, ataca al zombi, refúgiate, ' +
  'sal del refugio, duerme, fabrica una espada, equípate, apártate, caza.'
// F6: bloques que se pueden minar y planos que se pueden construir, por su nombre en español
const BLOQUES = { piedra: 'stone', piedras: 'stone', roca: 'stone', tierra: 'dirt', arena: 'sand', grava: 'gravel', mineral: 'mineral', minerales: 'mineral',
  carbon: 'coal_ore', hierro: 'iron_ore', cobre: 'copper_ore', andesita: 'andesite', granito: 'granite', diorita: 'diorite', arenisca: 'sandstone' }
// F7.2: lo que se puede fabricar, por su nombre en español (habilidades/fabricar.js; «espada» a secas: de piedra si hay piedra)
const FABRICABLES = { espada: 'espada', espadas: 'espada', pico: 'pico', picos: 'pico', hacha: 'hacha', hachas: 'hacha', pala: 'pala_madera',
  mesa: 'mesa', palo: 'palos', palos: 'palos', tablon: 'tablones', tablones: 'tablones', tabla: 'tablones', tablas: 'tablones',
  antorcha: 'antorcha', antorchas: 'antorcha' }
const PLANOS = { cabana: 'cabana', cabanas: 'cabana', casa: 'cabana', casita: 'cabana', refugio: 'cabana', muro: 'muro', pared: 'muro', muralla: 'muro',
  pilar: 'pilar', columna: 'pilar', poste: 'pilar', plataforma: 'plataforma', suelo: 'plataforma', tarima: 'plataforma' }

const normalizar = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  .replace(/[^a-z0-9ñ_ ]+/g, ' ').replace(/\s+/g, ' ').trim()
const CORTESIA = /^(?:(?:por favor|porfa|oye|venga|eh|vale|ahora|puedes|podrias|quiero que|necesito que)\s+)+|\s+(?:por favor|porfa)$/g

function numero(t) {
  const d = t.match(/\b(\d{1,4})\b/)
  if (d) return parseInt(d[1])
  const p = t.split(' ').find(w => NUMEROS[w] !== undefined)
  return p ? NUMEROS[p] : null
}

// Nombres antiguos de los personajes (2026-10-15: Io pasó a llamarse Soma, y Claude, Alma): se aceptan aún como alias al dar
// órdenes («Io, ven» va a Soma si Soma está en este proceso y no hay ningún personaje que se llame de verdad Io).
const ALIAS = { io: 'Soma', claude: 'Alma' }

// Quién recibe la orden: { a: 'todos' | nombre (como en `nombres`) | null, resto: el texto original sin el nombre }
function destinatario(texto, nombres) {
  const t = normalizar(texto), original = String(texto || '').trim()
  const sinNombre = () => original.replace(/^\S+?[\s,:;.!¡¿]+/, '').trim()
  if (/^(todos|todas|equipo|chicos)\b/.test(t)) return { a: 'todos', resto: sinNombre() }
  for (const n of nombres) {
    const k = normalizar(n)
    if (t === k) return { a: n, resto: '' }
    if (t.startsWith(k + ' ')) return { a: n, resto: sinNombre() }
  }
  for (const [viejo, nuevo] of Object.entries(ALIAS)) {
    if (!nombres.includes(nuevo)) continue
    if (t === viejo) return { a: nuevo, resto: '' }
    if (t.startsWith(viejo + ' ')) return { a: nuevo, resto: sinNombre() }
  }
  return { a: null, resto: original }
}

function interpretar(texto) {
  const t = normalizar(texto).replace(CORTESIA, '').trim()
  if (!t) return null
  let m
  if ((m = t.match(/\b(?:al terminar|al acabar|despues|luego|cuando termines|cuando acabes)\b.*\b(quiet[oa]s?|parad[oa]s?|libres?)\b/)))
    return { tipo: 'despues', valor: m[1].startsWith('libre') ? 'libre' : 'quieto' }
  if (/\bmodo (?:de )?libre\b|\ba tu aire\b|\b(?:haz|haced) lo que quieras\b|^libres?$/.test(t)) return { tipo: 'modo', modo: 'libre' }
  if (/\bmodo (?:de )?ordene?s?\b|\bobedece|\ba mis ordenes\b/.test(t)) return { tipo: 'modo', modo: 'ordenes' }
  if ((m = t.match(/^(?:se |pon(?:te)? (?:el )?)?perfil (\w+)$/))) return { tipo: 'perfil', perfil: m[1] }
  if (/\b(?:estado|informe)\b|^(?:como estas|que haces|donde estas|que tal)\b/.test(t)) return { tipo: 'estado' }
  if (/^(?:ayuda|que sabes hacer|ordenes)$/.test(t)) return { tipo: 'ayuda' }
  // F7.2: supervivencia (antes que «quédate», porque «espera al día» no es quedarse quieto, y que «tala», porque «consigue comida»
  // no es talar)
  if (/^(?:espera|esperad)\b.*\b(?:dia|amanezca|amanecer|se haga de dia)\b|\b(?:duerme|dormid|dormir|a dormir|vete a dormir|acuestate)\b/.test(t))
    return { tipo: 'duerme' }
  if (/^(?:come|comed|comer|comete|cena|desayuna|almuerza)\b|\b(?:come|comete) algo\b/.test(t)) return { tipo: 'come' }
  if ((m = t.match(/\b(?:ataca|atacad|atacar|mata|matad|matar|pelea|pelead|lucha|luchad|defiendete|defendeos|acaba con)\b(?: (?:a la |a los |a las |al |a |el |la |los |las |ese |esa |este |esta )?(\w+))?/)))
    return { tipo: 'ataca', de: (m[1] && MOBS[m[1]]) || null }
  if (/\b(?:refugiate|refugiaos|refugiarse|refugiarte|escondete|escondeos|tapiate|tapiaos|entierrate|metete en un hoyo|cava un refugio)\b/.test(t))
    return { tipo: 'refugiate', modo: /\b(?:tapia|tapiate|tapiaos)\b/.test(t) ? 'tapiar' : /\b(?:cava|entierrate|hoyo)\b/.test(t) ? 'cavar' : 'auto' }
  if (/^(?:sal|salid|salte|sal fuera)\b|\b(?:sal|salid) del (?:refugio|hoyo|agujero|pozo)\b/.test(t)) return { tipo: 'sal' }
  if (/\b(?:equipate|equipaos|equipar|equipa|armate|armaos|ponte la armadura|coge el arma|coge la espada)\b/.test(t)) return { tipo: 'equipate' }
  if (/\b(?:apartate|apartaos|apartarse|quitate de ahi|sal de la lava|alejate de la lava|alejate del borde|alejate del agua)\b/.test(t)) return { tipo: 'apartate' }
  if (/\b(?:caza|cazad|cazar|busca comida|buscad comida|consigue comida|trae comida|recoge comida)\b/.test(t)) return { tipo: 'caza' }
  if (/\b(?:fabrica|fabricad|fabricar|craftea|craftead|craftear|hazte|haz(?:me)?|crea|hacer)\b/.test(t) && (/\b(?:fabrica|fabricad|fabricar|craftea|craftead|craftear)\b/.test(t) || t.split(' ').some(w => FABRICABLES[w]))) {
    const w = t.split(' ').find(x => FABRICABLES[x])
    let objeto = w ? FABRICABLES[w] : null
    if (['espada', 'pico', 'hacha'].includes(objeto) && /\bde (piedra|madera)\b/.test(t)) objeto += /\bde piedra\b/.test(t) ? '_piedra' : '_madera'
    return { tipo: 'fabrica', objeto }
  }
  if (/^(?:quedate|quedaos|quieto|quieta|quietos|quietas|para|parad|alto|espera|esperad|stop|detente|deteneos|basta|deja de|dejad de)\b/.test(t))
    return { tipo: 'quedate' }
  // F6: explorar, minar, construir, deshacer y el campamento (antes que «tala», porque «pica piedra» no es talar)
  if (/\bcampamento\b/.test(t)) {
    if (/\b(?:vuelve|volver|volved|regresa|regresad|ve|id|vete)\b/.test(t)) return { tipo: 'campamento_vuelve' }
    return { tipo: 'campamento' } // «campamento aquí», «pon el campamento»: fijarlo donde está
  }
  if ((m = t.match(/\b(?:explora|explorar|explorad|reconoce|reconocer|da una vuelta)\b/))) {
    const r = t.match(/\b(nor(?:te|oeste|este)|sur(?:este|oeste)?|este|oeste)\b/)
    // «nadando» (o «a nado», «cruzando», «por el agua»): puede vadear o nadar; si no, no pisa el agua
    return { tipo: 'explora', rumbo: r ? r[1] : '-', n: (/\b\d{1,3}\b/.test(t) && numero(t)) || 40, nada: /\b(?:nadando|a nado|cruzando|cruza|por el agua)\b/.test(t) } // «una vuelta» no es 1 bloque
  }
  if (/\b(?:mina|minar|minad|excava|excavar|excavad|pica piedra|picar piedra)\b/.test(t)) {
    const b = t.split(' ').find(w => BLOQUES[w])
    return { tipo: 'mina', bloque: b ? BLOQUES[b] : 'stone', n: numero(t) || 8 }
  }
  if (/\b(?:construye|construir|construid|levanta|levantar|edifica|monta|haz(?:me)?|hacer)\b/.test(t) && t.split(' ').some(w => PLANOS[w])) {
    const p = PLANOS[t.split(' ').find(w => PLANOS[w])]
    return { tipo: 'construye', plano: p === 'cabana' && /\b(?:con )?tech(?:o|ada)\b/.test(t) ? 'cabana_techada' : p, aqui: /\baqui\b/.test(t) }
  }
  if ((m = t.match(/\b(?:deshaz|deshacer|deshaced|desmonta|desmontar|derriba|derribar|quita|quitar)\b(?: (?:la |el |esa |ese |esta |este )?(\w+))?/))) {
    const p = (m[1] && PLANOS[m[1]]) || null
    return { tipo: 'deshaz', obra: p || m[1] || null }
  }
  if (/\b(?:tala|talar|talad|tal[ae]n?|corta|cortar|cortad|pica|picar|picad|consigue|trae)\b/.test(t)) {
    const n = numero(t) || 1
    return { tipo: 'tala', n: Math.min(n, MAX_TRONCOS), pedido: n }
  }
  if (/\b(?:recoge|recoger|recoged|coge|coger|recogelo|recogelos|recolecta)\b/.test(t)) return { tipo: 'recoge', todo: /\btodo\b/.test(t) }
  if (/\b(?:guarda|guardar|guardad|guardalo|deposita|depositar|vacia)\b|\bal cofre\b/.test(t)) return { tipo: 'guarda' }
  if ((m = t.match(/\b(?:huye|huir|huid|escapa|escapad|alejate|alejaos)\b(?: del? (?:el |la |los |las )?(\w+))?/)))
    return { tipo: 'huye', de: (m[1] && !/^(?:aqui|ahi|alli|aca|este|esta)$/.test(m[1]) && (MOBS[m[1]] || m[1])) || null }
  if (/\b(?:sigueme|seguidme|sigue ?me|ven conmigo|acompaname)\b/.test(t)) return { tipo: 'sigueme' }
  if (/^(?:ven|venid|vente|acercate|acercaos|aqui|ven aqui|ven aca)\b/.test(t)) return { tipo: 'ven' }
  return null
}

module.exports = { interpretar, destinatario, normalizar, AYUDA, MAX_TRONCOS, ALIAS }
