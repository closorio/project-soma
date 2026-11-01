// Planos pequeños para la habilidad construir (F6). Cada plano es una función (materia) → { nombre, dim: [ancho x, alto y, largo z],
// bloques: [{ dx, dy, dz, tipo }] } con los bloques YA ORDENADOS: capa a capa (dy ascendente) y, dentro de cada capa, de modo
// que cada bloque toque al anterior (o al suelo en la capa 0): así siempre hay un vecino sólido en el que apoyar el siguiente.
// El origen (dx = 0, dz = 0) es la esquina noroeste (x e z mínimos); dy = 0 es la primera capa sobre el suelo.

// Anillo del perímetro de un rectángulo a×b, empezando en la esquina (0, 0) y andando en el sentido de las agujas del reloj:
// (0,0)→(a-1,0)→(a-1,b-1)→(0,b-1)→(0,1). Cada casilla toca la anterior.
function anillo(a, b) {
  const r = []
  for (let x = 0; x < a; x++) r.push([x, 0])
  for (let z = 1; z < b; z++) r.push([a - 1, z])
  for (let x = a - 2; x >= 0; x--) r.push([x, b - 1])
  for (let z = b - 2; z >= 1; z--) r.push([0, z])
  return r
}
// Rectángulo relleno a×b por filas (cada casilla toca la anterior de su fila; la primera de cada fila toca la de la fila anterior).
function relleno(a, b) {
  const r = []
  for (let z = 0; z < b; z++) for (let x = 0; x < a; x++) r.push([x, z])
  return r
}

const PLANOS = {
  // Un pilar de 3 bloques: la prueba más pequeña de colocar.
  pilar: (m) => ({ nombre: 'pilar', dim: [1, 3, 1], bloques: [0, 1, 2].map(dy => ({ dx: 0, dy, dz: 0, tipo: m })) }),
  // Un muro de 5 de largo y 2 de alto (en x).
  muro: (m) => ({ nombre: 'muro', dim: [5, 2, 1], bloques: [0, 1].flatMap(dy => [0, 1, 2, 3, 4].map(dx => ({ dx, dy, dz: 0, tipo: m }))) }),
  // Una plataforma de 3×3 a ras de suelo.
  plataforma: (m) => ({ nombre: 'plataforma', dim: [3, 1, 3], bloques: relleno(3, 3).map(([dx, dz]) => ({ dx, dy: 0, dz, tipo: m })) }),
  // Cabaña de 5×5 y 3 de alto: solo las paredes (46 bloques), con un hueco de puerta de 1×2 en el centro del lado sur (dz = 4).
  cabana: (m) => cabana('cabana', 5, false, m),
  // La misma cabaña con techo plano de 5×5 encima (71 bloques).
  cabana_techada: (m) => cabana('cabana_techada', 5, true, m),
  // 2026-11-01 (pedido del usuario): la cabaña grande, el doble de lado (10×10): 106 bloques de paredes, 206 con techo.
  cabana_grande: (m) => cabana('cabana_grande', 10, false, m),
  cabana_grande_techada: (m) => cabana('cabana_grande_techada', 10, true, m),
}
// Paredes de lado×lado y 3 de alto con la puerta (1×2) en el centro del lado sur y, con techo, un techo plano encima.
function cabana(nombre, lado, techo, m) {
  const puerta = Math.floor(lado / 2)
  const paredes = [0, 1, 2].flatMap(dy => anillo(lado, lado)
    .filter(([dx, dz]) => !(dy < 2 && dx === puerta && dz === lado - 1)).map(([dx, dz]) => ({ dx, dy, dz, tipo: m })))
  const arriba = techo ? relleno(lado, lado).map(([dx, dz]) => ({ dx, dy: 3, dz, tipo: m })) : []
  return { nombre, dim: [lado, techo ? 4 : 3, lado], bloques: [...paredes, ...arriba] }
}

// Comprobación de la regla de apoyo (para las pruebas): cada bloque toca al anterior, o a uno ya puesto, o está en la capa 0.
function bienOrdenado(plano) {
  const puestos = new Set()
  for (const b of plano.bloques) {
    const vecinos = [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]].some(([x, y, z]) => puestos.has(`${b.dx + x},${b.dy + y},${b.dz + z}`))
    if (b.dy !== 0 && !vecinos) return false
    puestos.add(`${b.dx},${b.dy},${b.dz}`)
  }
  return true
}

module.exports = { PLANOS, anillo, relleno, bienOrdenado, nombres: () => Object.keys(PLANOS) }
