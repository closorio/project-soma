#!/usr/bin/env python3
"""F7.4 por clonación (decisión del usuario tras F7.4, PLAN_F7_supervivencia.md): la red de supervivencia 47→64→64→11 copia el
guion de supervivencia (guion_sv_lote) con DAgger, en vez de DQfD con la recompensa. CPU y numpy (sin torch), con el simulador
recalibrado de F7.3 (entorno_supervivencia.MundoSupervivencia con los reflejos del cuerpo) y la evaluación de
entrenar_supervivencia_rapido.py (se importa: mismas medidas, mismos mundos; ese módulo no se toca).
DAgger (fijado antes de medir):
- Ronda 0: EPISODIOS_RONDA (1000) días, un quinto por perfil, jugados por el guion con un 20 % de acciones al azar (para que vea
  estados fuera de su camino). Rondas 1 … RONDAS-1 (8 en total): los mismos días (otros mundos) jugados por la red de la ronda
  anterior con un 5 % de acciones al azar. Todos los estados se etiquetan con lo que haría el guion y se juntan (agregado).
- Tras cada ronda, la red (la misma, con su Adam: no se reinicia) aprende con entropía cruzada sobre todo el agregado: Adam
  1e-3, lotes de 512, EPOCAS_0 (20) épocas en la ronda 0 y EPOCAS (8) en las demás. Sin recompensa ni refuerzo.
- Mundos: entrenamiento 1 000 000 + 10 000·ronda + k (+ 100 000·semilla); validación 50 000-50 099 y prueba 100 000-100 299
  por perfil, los mismos que entrenar_supervivencia_rapido.py (y que el guion), así que no se pisan.
- Validación tras cada ronda (VALIDACION_N = 100 mundos por perfil). Punto de control: entre las rondas con fidelidad ≥ 95 % en
  todos los perfiles y muertes similares a las del guion en esos mundos (en total), la de mayor fidelidad mínima; si no hay, la de
  mayor fidelidad mínima.
- Muertes similares (fijado antes de medir): red − guion por mundo, en los mismos mundos, no es mayor que su intervalo del 95 %
  (la red no muere significativamente más que el guion). Se mira por perfil y en total.
- Semillas (por defecto 0 y 1): cada una se entrena y se prueba por separado (politica_supervivencia_dagger_sN.json); se elige la de
  mejor recompensa total de validación, como siempre, y se copia a politica_supervivencia_dagger.json con un apartado «eleccion»
  (la regla, la recompensa de validación de cada semilla y qué criterios de la prueba final falla cada una).
Criterios de la prueba final (300 mundos emparejados por perfil): fidelidad ≥ 95 % por perfil; muertes similares a las del guion
por perfil y en total; azar SIN reflejos sin morir < 60 % (con reflejos no se exige: decisión del usuario tras F7.2); numpy
float64/float32 300/300. Se anotan sin exigirlos (la clonación no busca superar al guion) los de la receta DQfD: red − guion en
muertes ≤ 0, en recompensa ≥ −0,1 por mundo y 0-1 muertes con el perfil supervivencia.
F7.6 (2026-10-15 21:45, trabajador io-mundo-simulado-213020), fijado antes de medir: el simulador sale a cualquier hora (antes
6:00 o 18:00) y dormir espera dentro del refugio desde el atardecer; la misma receta, con salida NOMBRE (por defecto dagger2:
politica_supervivencia_dagger2{,_sN}.json; nunca sobrescribe las de «dagger», que son las del simulador anterior). A los criterios
de arriba se añaden, en la prueba final: salidas a MEDIANOCHE (hora 0,75; 300 mundos por perfil, los mismos para red y guion):
fidelidad ≥ 95 % por perfil y muertes similares a las del guion por perfil y en total. Informativo: coincidencia con el guion en las
decisiones reales de F7.5 (entrenamiento/ejecuciones/modos-supervivencia-20261015.jsonl), por perfil.
F7.6b (2026-10-16, trabajador io-mundo-simulado-180821): la misma receta y los mismos criterios con el guion y el simulador de
F7.6b (ver entorno_supervivencia.py), salida NOMBRE=dagger3 (no toca las de dagger ni dagger2).
Uso: entrenar_supervivencia_dagger.py [semillas=0,1]
     entrenar_supervivencia_dagger.py elegir [politica_supervivencia_dagger_sN.json …]   (solo la elección; por defecto s0 y s1)
     Entorno: RONDAS=8, EPISODIOS_RONDA=1000, EPOCAS_0=20, EPOCAS=8, EVALUADORES=8, PRUEBA_N=300, VALIDACION_N=100, NOMBRE=dagger2.
No escribe politica_supervivencia.json (la de DQfD) ni politica_habilidades*.json (la red del mundo del usuario)."""
import os

os.environ.setdefault("OPENBLAS_NUM_THREADS", "2")  # antes de numpy (como entrenar_supervivencia_rapido.py); los hijos van con 1
import json
import sys
import time
from pathlib import Path

import numpy as np

import entrenar_supervivencia_rapido as rapido  # cambia las formas de red_numpy a 47→64→64→11 (ver su docstring)
from entorno_supervivencia import (ACCIONES, CAL_SV, OBS, MundoSupervivencia, calibrar, cargar_perfiles, guion_sv_lote,
                                   politica_guion_sv, vector_perfil)
from entrenar_supervivencia_rapido import (FIDELIDAD_MIN, _limpio, dif_ic, evaluar_async, fidelidad_min, muertes, nota, texto)
from red_numpy import Adam, a_json, adelante, capas, de_json, red_nueva

NO, NA = len(OBS), len(ACCIONES)
AQUI = Path(__file__).parent
LOTE, LR = 512, 1e-3
EPS_GUION, EPS_RED = 0.2, 0.05  # acciones al azar en la ronda 0 (guion) y en las demás (red)
TROZO_RECOGIDA = 25  # días por tarea de recogida
NOMBRE = os.environ.get("NOMBRE", "dagger2")
if NOMBRE == "dagger" and os.environ.get("FORZAR") != "1":  # las de antes (simulador con salida a las 6:00 o a las 18:00)
    sys.exit("NOMBRE=dagger sobrescribiría politica_supervivencia_dagger*.json (usa otro nombre o FORZAR=1)")
SALIDA = AQUI / f"politica_supervivencia_{NOMBRE}.json"
REALES = AQUI / "ejecuciones" / "modos-supervivencia-20261015.jsonl"  # las decisiones reales de F7.5 (informativo)
REALES_HASTA = "2026-10-16T02:40"  # solo las de F7.5 (después, el mismo archivo recibe las pruebas de F7.6)
MEDIANOCHE = 0.75
VALIDACION_N = int(os.environ.get("VALIDACION_N", 100))


# ---------------- recogida (en los procesos evaluadores) ----------------
def recoger(perfil, semillas, theta, eps):
    """Juega los días `semillas` con el guion (theta None) o con la red, con un `eps` de acciones al azar; devuelve los estados
    vistos (float32). El azar de cada día sale de su semilla: la recogida no depende del reparto entre procesos."""
    cal, S = rapido._cal(), []
    for s in semillas:
        rng = np.random.default_rng(s)
        env = MundoSupervivencia(semilla=s, perfil=perfil, cal=cal)
        o, hecho = env.reset(), False
        while not hecho:
            S.append(o)
            if rng.random() < eps:
                a = int(rng.integers(NA))
            elif theta is None:
                a = politica_guion_sv(o)
            else:
                a = int(adelante(theta, o).argmax())
            o, _, hecho, _ = env.step(a)
    return np.array(S, np.float32)


def recoger_ronda(pool, ronda, semilla, episodios, theta):
    perfiles, por_perfil = list(cargar_perfiles()), episodios // len(cargar_perfiles())
    base = 1_000_000 + 100_000 * semilla + 10_000 * ronda
    tareas = []
    for j, p in enumerate(perfiles):
        for k0 in range(0, por_perfil, TROZO_RECOGIDA):
            semillas = [base + 1000 * j + k for k in range(k0, min(k0 + TROZO_RECOGIDA, por_perfil))]
            tareas.append(pool.apply_async(recoger, (p, semillas, theta, EPS_GUION if theta is None else EPS_RED)))
    return np.concatenate([t.get() for t in tareas])


# ---------------- aprendizaje: entropía cruzada en numpy ----------------
def gradiente_ce(theta, x, y):
    """Pérdida (media) y gradiente de la entropía cruzada softmax(red(x)) frente a las acciones y, en el orden de theta."""
    W1, b1, W2, b2, W3, b3 = capas(theta)
    B = len(x)
    z1 = x @ W1.T + b1
    h1 = np.maximum(z1, 0)
    z2 = h1 @ W2.T + b2
    h2 = np.maximum(z2, 0)
    z = h2 @ W3.T + b3
    z = z - z.max(1, keepdims=True)
    p = np.exp(z)
    p /= p.sum(1, keepdims=True)
    filas = np.arange(B)
    perdida = float(-np.log(p[filas, y] + 1e-12).mean())
    dz = p
    dz[filas, y] -= 1
    dz /= B
    dz2 = (dz @ W3) * (z2 > 0)
    dz1 = (dz2 @ W2) * (z1 > 0)
    grad = np.concatenate([(dz1.T @ x).ravel(), dz1.sum(0), (dz2.T @ h1).ravel(), dz2.sum(0), (dz.T @ h2).ravel(), dz.sum(0)])
    return perdida, grad.astype(np.float32, copy=False)


def aprender(theta, adam, S, Y, epocas, rng):
    perdidas = []
    for _ in range(epocas):
        perm = rng.permutation(len(S))
        for i in range(0, len(S), LOTE):
            idx = perm[i:i + LOTE]
            perdida, g = gradiente_ce(theta, S[idx], Y[idx])
            adam.paso(theta, g)
            perdidas.append(perdida)
    aciertos = sum(int((adelante(theta, S[i:i + 65536]).argmax(1) == Y[i:i + 65536]).sum()) for i in range(0, len(S), 65536))
    acierto = aciertos / len(S)
    return float(np.mean(perdidas[-200:])), acierto


def reales(theta):
    """{perfil: (iguales al guion, decisiones)} en las observaciones reales de F7.5 (REALES), si están."""
    por = {}
    if REALES.exists():
        for l in REALES.read_text().splitlines():
            d = json.loads(l)
            if d.get("tipo") == "decision" and len(d.get("obs") or []) == NO and d.get("t", "") < REALES_HASTA:
                por.setdefault(d.get("perfil"), []).append(d["obs"])
    return {p: (int((adelante(theta, np.array(o, np.float32)).argmax(1) == guion_sv_lote(np.array(o, np.float32))).sum()), len(o))
            for p, o in por.items()}


# ---------------- una semilla ----------------
def similares(rr, rg, perfiles=None):
    """Muertes similares (docstring): red − guion por mundo ≤ su intervalo del 95 %. Devuelve (cumple, media, intervalo)."""
    perfiles = perfiles or list(rr)
    m, ic = dif_ic(sum((rr[p]["_muertes"] for p in perfiles), []), sum((rg[p]["_muertes"] for p in perfiles), []))
    return m <= ic, m, ic


def una_semilla(pool, semilla, gv, rondas, episodios, epocas0, epocas, prueba_n):
    rng = np.random.default_rng(semilla)
    theta = red_nueva(rng)
    adam = Adam(theta.size, lr=LR)
    S_todo, Y_todo, hechas, t0 = [], [], [], time.time()
    salida = AQUI / f"politica_supervivencia_{NOMBRE}_s{semilla}.json"
    print(f"=== semilla {semilla}: {rondas} rondas de {episodios} días · red {NO}→64→64→{NA} ({theta.size} parámetros) · "
          f"{salida.name}", flush=True)
    for ronda in range(rondas):
        tr = time.time()
        S = recoger_ronda(pool, ronda, semilla, episodios, None if ronda == 0 else theta.copy())
        S_todo.append(S)
        Y_todo.append(guion_sv_lote(S).astype(np.int64))
        S_ag, Y_ag = np.concatenate(S_todo), np.concatenate(Y_todo)
        t_rec = time.time() - tr
        perdida, acierto = aprender(theta, adam, S_ag, Y_ag, epocas0 if ronda == 0 else epocas, rng)
        t_apr = time.time() - tr - t_rec
        e = evaluar_async(pool, ("red", theta.copy()), VALIDACION_N, base=50_000)()
        ok, m, ic = similares(e, gv)
        hechas.append((ronda, theta.copy(), e, ok))
        print(f"ronda {ronda}: {len(S)} estados nuevos ({len(S_ag)} en total; recogida {t_rec:.0f} s, aprendizaje {t_apr:.0f} s) · "
              f"pérdida {perdida:.3f} · acierto en el agregado {100 * acierto:.1f} %\n  validación: R total {nota(e):.1f} · muertes "
              f"{muertes(e)} (guion {muertes(gv)}; red − guion {m:+.3f} ± {ic:.3f} por mundo: "
              f"{'similares' if ok else 'MÁS'}) · fidelidad mínima {100 * fidelidad_min(e):.1f} %\n{texto(e, '    ')}", flush=True)
    t_entreno = time.time() - t0

    buenas = [h for h in hechas if fidelidad_min(h[2]) >= FIDELIDAD_MIN and h[3]]
    if buenas:
        regla, ronda_el = "fidelidad ≥ 95 % y muertes similares a las del guion: la de mayor fidelidad mínima", \
            max(buenas, key=lambda h: fidelidad_min(h[2]))[0]
    else:
        regla, ronda_el = "ninguna con fidelidad ≥ 95 % y muertes similares: la de mayor fidelidad mínima", \
            max(hechas, key=lambda h: fidelidad_min(h[2]))[0]
    _, theta, e_el, _ = hechas[ronda_el]
    print(f"punto de control: ronda {ronda_el} ({regla}; R total {nota(e_el):.1f}, muertes {muertes(e_el)}, fidelidad mínima "
          f"{100 * fidelidad_min(e_el):.1f} %) · entrenamiento {t_entreno:.0f} s", flush=True)

    # ---- prueba final ----
    t1 = time.time()
    pend = {"red": evaluar_async(pool, ("red", theta), prueba_n), "guion": evaluar_async(pool, ("guion",), prueba_n),
            "azar": evaluar_async(pool, ("azar",), prueba_n),
            "azar_sin_reflejos": evaluar_async(pool, ("azar",), prueba_n, reflejos=False),
            "red_medianoche": evaluar_async(pool, ("red", theta), prueba_n, hora=MEDIANOCHE),
            "guion_medianoche": evaluar_async(pool, ("guion",), prueba_n, hora=MEDIANOCHE)}
    res = {n: f() for n, f in pend.items()}
    for n, e in res.items():
        print(f"PRUEBA {n} ({prueba_n} mundos por perfil)\n{texto(e, '  ')}")
    perfiles = list(cargar_perfiles())
    rr, rg = res["red"], res["guion"]
    print("red − guion por mundo (mismos mundos): muertes | recompensa | troncos")
    difs = {}
    for p in perfiles:
        difs[p] = {k: dif_ic(rr[p]["_" + k], rg[p]["_" + k]) for k in ("muertes", "R", "troncos")}
        print(f"  {p:13s} " + " | ".join(f"{k} {m:+.3f} ± {ic:.3f}" for k, (m, ic) in difs[p].items()))
    for p in perfiles:
        print(f"uso ({p}): red {rr[p]['uso']} · guion {rg[p]['uso']}\n  la red se aparta del guion (guion→red): {rr[p]['aparte']}")

    criterios = []
    for p in perfiles:
        criterios.append((f"coincidencia con el guion ≥ 95 % ({p}: {100 * rr[p]['fidelidad']:.1f} %)",
                          rr[p]["fidelidad"] >= FIDELIDAD_MIN))
    for p in perfiles:
        ok, m, ic = similares(rr, rg, [p])
        criterios.append((f"muertes similares a las del guion ({p}: {rr[p]['muertes']} frente a {rg[p]['muertes']}; red − guion "
                          f"{m:+.3f} ± {ic:.3f} por mundo)", ok))
    ok, m, ic = similares(rr, rg)
    criterios.append((f"muertes similares a las del guion (en total: {muertes(rr)} frente a {muertes(rg)}; red − guion {m:+.3f} ± "
                      f"{ic:.3f} por mundo)", ok))
    for p in perfiles:
        criterios.append((f"azar sin reflejos sin morir < 60 % ({p}: {100 * res['azar_sin_reflejos'][p]['vivos']:.1f} %)",
                          res["azar_sin_reflejos"][p]["vivos"] < 0.60))
    rm, gm = res["red_medianoche"], res["guion_medianoche"]  # F7.6: salidas a medianoche
    for p in perfiles:
        criterios.append((f"medianoche: coincidencia con el guion ≥ 95 % ({p}: {100 * rm[p]['fidelidad']:.1f} %)",
                          rm[p]["fidelidad"] >= FIDELIDAD_MIN))
    for p in perfiles:
        ok, m, ic = similares(rm, gm, [p])
        criterios.append((f"medianoche: muertes similares a las del guion ({p}: {rm[p]['muertes']} frente a {gm[p]['muertes']}; "
                          f"red − guion {m:+.3f} ± {ic:.3f} por mundo)", ok))
    ok, m, ic = similares(rm, gm)
    criterios.append((f"medianoche: muertes similares a las del guion (en total: {muertes(rm)} frente a {muertes(gm)}; red − guion "
                      f"{m:+.3f} ± {ic:.3f} por mundo)", ok))
    informativos = []
    for p in perfiles:
        informativos.append((f"red − guion en muertes ≤ 0 ({p}: {rr[p]['muertes']} frente a {rg[p]['muertes']})",
                             rr[p]["muertes"] <= rg[p]["muertes"]))
    for p in perfiles:
        informativos.append((f"red − guion en recompensa ≥ −0,1 por mundo ({p}: {difs[p]['R'][0]:+.3f} ± {difs[p]['R'][1]:.3f})",
                             difs[p]["R"][0] >= -0.1))
    informativos.append((f"supervivencia, 0-1 muertes en {prueba_n} (red: {rr['supervivencia']['muertes']}; guion: "
                         f"{rg['supervivencia']['muertes']})", rr["supervivencia"]["muertes"] <= 1))
    for p, (igual, n) in reales(theta).items():  # F7.6: las decisiones reales de F7.5, con el guion de ahora
        informativos.append((f"decisiones reales de F7.5 iguales al guion ({p}: {igual}/{n})", igual >= FIDELIDAD_MIN * n))
    t_prueba = time.time() - t1

    # Comprobación: la inferencia del ejecutor (float64 desde el JSON) da lo mismo que la del entrenamiento (float32)
    capas_json = a_json(theta)
    theta64 = de_json(capas_json, np.float64)
    env, coinciden, azar = MundoSupervivencia(semilla=5, cal=calibrar()), 0, np.random.default_rng(5)
    o = env.reset()
    for k in range(300):
        coinciden += int(adelante(theta64, o.astype(np.float64)).argmax()) == int(adelante(theta, o).argmax())
        o, _, hecho, _ = env.step(int(azar.integers(NA)))
        if hecho:
            env.poner_perfil(perfiles[k % len(perfiles)]); o = env.reset()
    criterios.append((f"numpy float64/float32 en 300 decisiones ({coinciden}/300)", coinciden == 300))
    print("--- criterios (F7.4 por clonación)")
    for t, ok in criterios:
        print(f"  {'PASA ' if ok else 'FALLA'} {t}")
    print("--- informativos (receta DQfD; no se exigen a la clonación)")
    for t, ok in informativos:
        print(f"  {'sí   ' if ok else 'no   '} {t}")

    cal = calibrar()
    json.dump({"capas": capas_json, "acciones": ACCIONES, "obs": OBS,
               "perfiles": {p: vector_perfil(w) for p, w in cargar_perfiles().items()}, "semilla": semilla, "modo": "dagger",
               "fecha": time.strftime("%Y-%m-%d %H:%M"), "mundo": "supervivencia", "reflejos": True, "nombre": NOMBRE,
               "horas_de_salida": "cualquiera (uniforme); dormir espera dentro desde el atardecer (F7.6)",
               "punto_de_control": {"ronda": ronda_el, "regla": regla, "validacion": _limpio(e_el)},
               "validaciones": [{"ronda": r, "R": round(nota(e), 2), "muertes": muertes(e), "fidelidad_min": fidelidad_min(e),
                                 "muertes_similares": bool(ok)} for r, _, e, ok in hechas],
               "prueba_simulador": {n: _limpio(e) for n, e in res.items()},
               "red_menos_guion": {p: {k: [round(m, 4), round(ic, 4)] for k, (m, ic) in d.items()} for p, d in difs.items()},
               "criterios": [[t, bool(ok)] for t, ok in criterios],
               "informativos": [[t, bool(ok)] for t, ok in informativos],
               "calibracion": {"medidas": cal["medidas"], "cal_sv": {h: dict(cal[h]) for h in CAL_SV}},
               "entrenador": {"script": Path(__file__).name, "rondas": rondas, "episodios_ronda": episodios, "epocas_0": epocas0,
                              "epocas": epocas, "lote": LOTE, "lr": LR, "eps_guion": EPS_GUION, "eps_red": EPS_RED,
                              "estados": int(sum(len(s) for s in S_todo)), "validacion_n": VALIDACION_N, "prueba_n": prueba_n,
                              "s_entrenamiento": round(t_entreno), "s_prueba": round(t_prueba)}},
              open(salida, "w"))
    print(f"guardada en {salida.name} · entrenamiento {t_entreno:.0f} s, prueba final {t_prueba:.0f} s", flush=True)
    return salida, nota(e_el)


def elegir_semilla(rutas):
    """La semilla con mejor recompensa total de validación (en su punto de control) → SALIDA, con el apartado «eleccion»."""
    pols = [(Path(r), json.load(open(r))) for r in rutas]

    def r_val(pol):
        return sum(v["recompensa"] for v in pol["punto_de_control"]["validacion"].values())
    ruta, mejor = max(pols, key=lambda x: r_val(x[1]))
    mejor["eleccion"] = {"regla": "mejor recompensa total de validación (fijada antes de medir)", "archivo": ruta.name,
                         "simulador": "salida a cualquier hora; dormir espera dentro desde el atardecer (F7.6)",
                         "semillas": {str(pol["semilla"]): {"archivo": r.name, "R_validacion": round(r_val(pol), 1),
                                                            "falla": [t for t, ok in pol["criterios"] if not ok]}
                                      for r, pol in pols}}
    json.dump(mejor, open(SALIDA, "w"))
    for r, pol in pols:
        falla = mejor["eleccion"]["semillas"][str(pol["semilla"])]["falla"]
        print(f"{'ELEGIDA ' if r == ruta else '        '}{r.name}: R de validación {r_val(pol):.1f} · criterios de la prueba final: "
              f"{'pasan todos' if not falla else 'falla ' + '; '.join(falla)}")
    print(f"→ {SALIDA.name}", flush=True)


def main():
    if len(sys.argv) > 1 and sys.argv[1] == "elegir":
        elegir_semilla([AQUI / r for r in sys.argv[2:]] or [AQUI / f"politica_supervivencia_{NOMBRE}_s{s}.json" for s in (0, 1)])
        return
    semillas = [int(s) for s in (sys.argv[1] if len(sys.argv) > 1 else "0,1").split(",")]
    rondas, episodios = int(os.environ.get("RONDAS", 8)), int(os.environ.get("EPISODIOS_RONDA", 1000))
    epocas0, epocas = int(os.environ.get("EPOCAS_0", 20)), int(os.environ.get("EPOCAS", 8))
    n_eval, prueba_n = int(os.environ.get("EVALUADORES", 8)), int(os.environ.get("PRUEBA_N", 300))
    cal = calibrar()
    print(f"entrenar_supervivencia_dagger: semillas {semillas} · {n_eval} evaluadores · calibración: medidas de F7.2 en "
          f"{', '.join(cal['medidas'])}; sin medir: {', '.join(h for h in CAL_SV if h not in cal['medidas'])}", flush=True)
    t0 = time.time()
    ctx = rapido.mp.get_context("spawn")  # procesos limpios (solo numpy), sin heredar hilos de BLAS
    os.environ["OPENBLAS_NUM_THREADS"] = "1"
    with ctx.Pool(n_eval) as pool:
        gv = evaluar_async(pool, ("guion",), VALIDACION_N, base=50_000)()
        print(f"guion en los mundos de validación: R total {nota(gv):.1f} · muertes {muertes(gv)}\n{texto(gv, '  ')}", flush=True)
        hechas = [una_semilla(pool, s, gv, rondas, episodios, epocas0, epocas, prueba_n) for s in semillas]
    elegir_semilla([h[0] for h in hechas])
    print(f"total {time.time() - t0:.0f} s", flush=True)


if __name__ == "__main__":
    main()
