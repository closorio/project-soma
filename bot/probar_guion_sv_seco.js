// Prueba en seco de guion_sv.js (F7.6): el guion de supervivencia en JS da lo mismo que guion_sv_lote de Python en las observaciones
// de días del simulador (jugados al azar y por el propio guion, todos los perfiles, salida a cualquier hora) y en las decisiones
// reales de F7.5. Uso: node bot/probar_guion_sv_seco.js [días=60]
const { execFileSync } = require('child_process')
const path = require('path')
const guion = require('./guion_sv')
const { ACCIONES_SV } = require('./observacion')

const dias = parseInt(process.argv[2]) || 60
const py = `
import json, sys
import numpy as np
from entorno_supervivencia import MundoSupervivencia, guion_sv_lote, politica_guion_sv, cargar_perfiles, calibrar, ACCIONES
from pathlib import Path
cal, perfiles, obs = calibrar(), list(cargar_perfiles()), []
for k in range(${dias}):
    env = MundoSupervivencia(semilla=700000 + k, perfil=perfiles[k % len(perfiles)], cal=cal)
    rng, o, hecho = np.random.default_rng(k), env.reset(), False
    while not hecho:
        obs.append(o)
        a = int(rng.integers(len(ACCIONES))) if k % 2 else politica_guion_sv(o)
        o, _, hecho, _ = env.step(a)
reales = []
for f in (Path("ejecuciones/modos-supervivencia-20261015.jsonl"), Path("ejecuciones/modos-supervivencia-20261016.jsonl")):  # F7.6b: y las de F7.6
    reales += [json.loads(l).get("obs") or [] for l in f.read_text().splitlines()] if f.exists() else []
reales = [np.array(o, np.float32) for o in reales if len(o) == 47]
todas = obs + reales
acc = guion_sv_lote(np.array(todas)).tolist()
print(json.dumps({"obs": [[float(x) for x in o] for o in todas], "a": acc, "n_sim": len(obs)}))
`
const salida = execFileSync('python3', ['-c', py], { cwd: path.join(__dirname, '..', 'entrenamiento'), maxBuffer: 1 << 30 }).toString()
const { obs, a, n_sim } = JSON.parse(salida)
let iguales = 0, igualesReales = 0
const distintos = []
obs.forEach((o, k) => {
  const j = guion.accion(o)
  if (j === a[k]) { iguales++; if (k >= n_sim) igualesReales++ } else if (distintos.length < 8) distintos.push(`${k}: py ${ACCIONES_SV[a[k]]} js ${ACCIONES_SV[j]}`)
})
console.log(`guion_sv.js frente a guion_sv_lote: ${iguales}/${obs.length} iguales (simulador ${iguales - igualesReales}/${n_sim}; ` +
  `decisiones reales de F7.5 y F7.6 ${igualesReales}/${obs.length - n_sim})`)
for (const d of distintos) console.log('  distinto ·', d)
let error = null
try { guion.decidir([0, 1]) } catch (e) { error = e.message }
console.log(error ? 'con 2 entradas se niega: bien' : 'con 2 entradas NO se niega')
const bien = iguales === obs.length && error
console.log(bien ? 'probar_guion_sv_seco: todo bien' : 'probar_guion_sv_seco: FALLA')
process.exit(bien ? 0 : 1)
