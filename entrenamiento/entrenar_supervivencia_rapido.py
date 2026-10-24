#!/usr/bin/env python3
"""F7.4 (PLAN_F7_supervivencia.md): la red de supervivencia. Copia de entrenar_habilidades_rapido.py con el simulador de F7.3
(entorno_supervivencia.MundoSupervivencia, recalibrado con lo medido en F7.2 y los reflejos del cuerpo), sus ACCIONES (11) y su
OBS (47) y el guion de supervivencia (guion_sv_lote): DQN doble 47→64→64→11, DQfD contra el guion (imitación con suelo 0,1),
γ 0,97 por cada 10 s, lote 256, Adam 5e-4, una actualización cada 2 transiciones (desde 5000), red objetivo cada 2000, memoria de
200 000; actores en procesos por rondas de K decisiones (determinista: misma semilla, misma red). Un solo personaje, perfiles por
turnos (episodio % 5), sin modo pacífico ni equipos (en el mundo aparte no hay jugador ni equipo).
Lo que cambia respecto a la receta de siempre:
- red_numpy.py está escrita para la red de 25→6 (sus formas son globales del módulo): aquí se cambian a 47→64→64→11 al importar
  este módulo (también en los procesos hijos, que lo importan al arrancar con spawn). red_numpy.py no se toca.
- Puntos de control por fidelidad (fijado antes de entrenar): VALIDACIONES (20) validaciones de VALIDACION_N (100) mundos por perfil,
  en segundo plano, cada una con la recompensa, las muertes y la fidelidad al guion (fracción de decisiones iguales a las del guion
  en los estados que visita la red). Tras la exploración (ε = 0,05), se elige: (1) entre las que tienen fidelidad ≥ 95 % en todos
  los perfiles y no mueren más que el guion en esos mismos mundos (en total), la de mejor recompensa total; (2) si no hay, entre
  las de fidelidad ≥ 95 %, la de mejor recompensa; (3) si no, la de mayor fidelidad mínima. Todas se guardan en
  puntos_control_supervivencia_sN.npz (pesos y medidas) por si se quiere otra.
- Prueba final (300 mundos emparejados por perfil, semillas 100 000+k): red, guion y azar con los reflejos del cuerpo, y azar sin
  ellos; red − guion en muertes, recompensa y troncos con su intervalo del 95 %; fidelidad, uso de acciones de la red y del guion
  y en qué se aparta la red del guion; los criterios del plan con PASA/FALLA (el del azar, < 60 %, solo sin reflejos: decisión
  del usuario tras F7.2); comprobación numpy float64/float32 en 300 decisiones.
Uso: entrenar_supervivencia_rapido.py [episodios=6000] [semilla=0] [salida=politica_supervivencia_sSEMILLA.json] [dqfd|guiado|libre]
     Entorno: ACTORES=4, K=32, EVALUADORES=8, HILOS_APRENDIZ=2, PRUEBA_N=300, VALIDACION_N=100, VALIDACIONES=20,
     SUELO_IMITACION=0.1 (variante probada en F7.4: 1, el peso de imitación no baja nunca).
     Los puntos de control van a puntos_control_<nombre de la salida sin «politica_»>.npz.
politica_habilidades*.json no se tocan (la red del mundo del usuario sigue siendo la de 25 entradas); bot/red.js aún exige esas 25."""
import os

os.environ.setdefault("OPENBLAS_NUM_THREADS", os.environ.get("HILOS_APRENDIZ", "2"))  # antes de numpy; los hijos van con 1
import json
import multiprocessing as mp
import random
import sys
import time
from collections import Counter
from pathlib import Path

import numpy as np

import red_numpy
from entorno_supervivencia import (ACCIONES, CAL_SV, OBS, MundoSupervivencia, calibrar, cargar_perfiles, guion_sv_lote,
                                   politica_guion_sv, vector_perfil)

GAMMA, LOTE, NA, NO = 0.97, 256, len(ACCIONES), len(OBS)
red_numpy.configurar(NO, NA)  # formas 47→64→64→11 para todo red_numpy (también en los procesos hijos, al importar)
OCULTA = red_numpy.OCULTA
from red_numpy import Adam, a_json, adelante, de_json, gradiente, red_nueva  # noqa: E402 (después de cambiar las formas)

MEMORIA, INICIO, CADA_OBJETIVO = 200_000, 5000, 2000
TROZO = 50  # mundos por tarea de evaluación (las políticas deterministas se reparten por trozos; el azar va entero, como el original)
FIDELIDAD_MIN = 0.95  # criterio del plan (coincidencia con el guion ≥ 95 %); también para elegir el punto de control


def eps_de(ep, episodios, modo):
    return max(0.05, 1.0 - ep / ((0.25 if modo == "dqfd" else 0.5) * episodios))


SUELO = float(os.environ.get("SUELO_IMITACION", 0.1))  # suelo del peso de imitación en dqfd (el de la receta, 0,1)


def peso_imitacion_de(ep, episodios, modo):
    if modo == "dqfd":
        return max(SUELO, 1 - 2 * ep / episodios)
    return 1 - 2 * ep / episodios if modo == "guiado" else 0


# ---------------- evaluación (en los procesos evaluadores) ----------------
_CAL = None


def _cal():
    global _CAL
    if _CAL is None:
        _CAL = calibrar()
    return _CAL


def _politica(desc):
    """desc: ("red", theta) —float32 como en el entrenamiento, o float64 como el ejecutor—, ("guion",) o ("azar",)."""
    if desc[0] == "red":
        theta = desc[1]
        return lambda o: int(adelante(theta, o.astype(theta.dtype, copy=False)).argmax())
    return {"guion": politica_guion_sv, "azar": None}[desc[0]]


def _tarea_perfil(desc, perfil, base, k0, k1, reflejos=True, hora=None):
    """Mundos base+k0 … base+k1-1 con un perfil. Por mundo: (recompensa, troncos, murió, causa, noches sin daño / noches,
    vida perdida, decisiones iguales al guion, decisiones, uso de las acciones, (guion, red) cuando no coinciden)."""
    pol, rng, filas = _politica(desc), np.random.default_rng(1), []
    for k in range(k0, k1):
        env = MundoSupervivencia(semilla=base + k, perfil=perfil, cal=_cal(), reflejos=reflejos, hora=hora)
        o, hecho, total, igual, n, uso, aparte = env.reset(), False, 0.0, 0, 0, Counter(), Counter()
        while not hecho:
            a = pol(o) if pol else int(rng.integers(NA))
            g = politica_guion_sv(o)
            igual += a == g
            n += 1
            uso[ACCIONES[a]] += 1
            if a != g:
                aparte[(ACCIONES[g], ACCIONES[a])] += 1
            o, r, hecho, _ = env.step(a)
            total += r
        filas.append((total, env.ganados, bool(env.salud <= 0), env.muerte, env.noches_ok / max(env.noches, 1), env.perdida_total,
                      igual, n, uso, aparte))
    return filas


def _trozos(n, desc):
    return [(0, n)] if desc[0] == "azar" else [(k, min(k + TROZO, n)) for k in range(0, n, TROZO)]


def evaluar_async(pool, desc, n=300, base=100_000, reflejos=True, hora=None):
    """Lanza la evaluación por perfil; recoger() da {perfil: medidas} (las listas por mundo, con «_», para comparar).
    hora: la de salida de MundoSupervivencia (None, cualquiera desde F7.6; "6o18", como hasta DAgger; 0.75, medianoche)."""
    tareas = [(perfil, pool.apply_async(_tarea_perfil, (desc, perfil, base, k0, k1, reflejos, hora)))
              for perfil in cargar_perfiles() for k0, k1 in _trozos(n, desc)]

    def recoger():
        res = {}
        for perfil, t in tareas:
            res.setdefault(perfil, []).extend(t.get())
        for perfil, filas in res.items():
            R, troncos, murio, causa, noches, perdida, igual, dec, uso, aparte = zip(*filas)
            res[perfil] = {"recompensa": round(float(np.mean(R)), 2), "vivos": round(1 - float(np.mean(murio)), 4),
                           "muertes": int(sum(murio)), "causas": dict(Counter(c for c in causa if c).most_common()),
                           "troncos": round(float(np.mean(troncos)), 2), "noches_sin_dano": round(float(np.mean(noches)), 3),
                           "vida_perdida": round(float(np.mean(perdida)), 2), "fidelidad": round(sum(igual) / sum(dec), 4),
                           "decisiones": round(sum(dec) / len(dec), 1), "uso": dict(sum(uso, Counter()).most_common()),
                           "aparte": {f"{g}→{a}": k for (g, a), k in sum(aparte, Counter()).most_common(8)},
                           "_R": list(R), "_muertes": [float(m) for m in murio], "_troncos": list(troncos)}
        return res
    recoger.listo = lambda: all(t.ready() for _, t in tareas)
    return recoger


def nota(e):
    return sum(v["recompensa"] for v in e.values())


def fidelidad_min(e):
    return min(v["fidelidad"] for v in e.values())


def muertes(e):
    return sum(v["muertes"] for v in e.values())


def texto(e, sangria=""):
    return "\n".join(sangria + f"{p:13s} R {v['recompensa']:6.1f} · vivos {100 * v['vivos']:5.1f} % ({v['muertes']} muertes "
                     f"{v['causas']}) · troncos {v['troncos']:5.1f} · noches sin daño {100 * v['noches_sin_dano']:3.0f} % · "
                     f"fidelidad {100 * v['fidelidad']:5.1f} %" for p, v in e.items())


def dif_ic(a, b):
    """Media de a − b (mismos mundos) y su intervalo del 95 %."""
    d = np.asarray(a, dtype=float) - np.asarray(b, dtype=float)
    return d.mean(), 1.96 * d.std() / np.sqrt(len(d))


def elegir(candidatos, guion_val):
    """La regla de los puntos de control (docstring del módulo). candidatos: [(ep, e)] tras la exploración. Devuelve (ep, regla)."""
    buenos = [(ep, e) for ep, e in candidatos if fidelidad_min(e) >= FIDELIDAD_MIN]
    seguros = [(ep, e) for ep, e in buenos if muertes(e) <= muertes(guion_val)]
    if seguros:
        return max(seguros, key=lambda x: nota(x[1]))[0], "fidelidad ≥ 95 % y no muere más que el guion: mejor recompensa"
    if buenos:
        return max(buenos, key=lambda x: nota(x[1]))[0], "fidelidad ≥ 95 % (todas mueren más que el guion): mejor recompensa"
    return max(candidatos, key=lambda x: fidelidad_min(x[1]))[0], "ninguna con fidelidad ≥ 95 %: la de más fidelidad"


# ---------------- actores ----------------
def actor(i, conexion, semilla, episodios, modo):
    """Juega los episodios que le asigna el aprendiz, K decisiones por ronda, con los pesos que llegan en cada ronda; devuelve las
    transiciones completas (de una decisión a la siguiente) y si acabó su episodio."""
    guiado = modo in ("guiado", "dqfd")
    cal, perfiles = calibrar(), list(cargar_perfiles())
    azar = random.Random(semilla * 1000 + i)
    env = MundoSupervivencia(semilla=semilla * 1000 + 1 + i, cal=cal)
    ep = o = None
    pendiente, eps = None, 1.0
    while (msg := conexion.recv()) is not None:
        theta, nuevo, k = msg
        if nuevo is not None:
            ep, eps = nuevo, eps_de(nuevo, episodios, modo)
            env.poner_perfil(perfiles[ep % len(perfiles)])
            o, pendiente = env.reset(), None
        trans, terminado = [], None
        for _ in range(k if ep is not None else 0):
            if pendiente is not None:
                po, pa, pr, pdt = pendiente
                trans.append((po, pa, pr, o, 0.0, pdt))
                pendiente = None
            if azar.random() >= eps:
                a = int(adelante(theta, o).argmax())
            else:
                a = politica_guion_sv(o) if guiado and azar.random() < 0.5 else azar.randrange(NA)
            o2, r, hecho, info = env.step(a)
            if info["fin"]:
                trans.append((o, a, r, o, 1.0, info["s"]))
            else:
                pendiente = (o, a, r, info["s"])
            o = o2
            if hecho:
                terminado, ep = ep, None
                break
        if trans:
            s, a, r, s2, d, dt = zip(*trans)
            paquete = (np.array(s, np.float32), np.array(a, np.int64), np.array(r, np.float32), np.array(s2, np.float32),
                       np.array(d, np.float32), np.array(dt, np.float32))
        else:
            paquete = None
        conexion.send((paquete, terminado))


# ---------------- aprendiz ----------------
class Memoria:
    def __init__(self, cap):
        self.cap, self.n, self.i = cap, 0, 0
        self.S, self.S2 = np.zeros((cap, NO), np.float32), np.zeros((cap, NO), np.float32)
        self.A, self.G = np.zeros(cap, np.int64), np.zeros(cap, np.int64)
        self.R, self.D, self.DT = np.zeros(cap, np.float32), np.zeros(cap, np.float32), np.zeros(cap, np.float32)

    def poner(self, s, a, r, s2, d, dt, g):
        i = self.i
        self.S[i], self.A[i], self.R[i], self.S2[i], self.D[i], self.DT[i], self.G[i] = s, a, r, s2, d, dt, g
        self.i, self.n = (i + 1) % self.cap, min(self.n + 1, self.cap)

    def lote(self, rng):
        idx = rng.choice(self.n, LOTE, replace=False)  # sin reemplazo, como random.sample
        return self.S[idx], self.A[idx], self.R[idx], self.S2[idx], self.D[idx], self.DT[idx], self.G[idx]


def _limpio(e):
    return {p: {k: x for k, x in v.items() if not k.startswith("_")} for p, v in e.items()}


def main():
    episodios = int(sys.argv[1]) if len(sys.argv) > 1 else 6000
    semilla = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    salida = Path(__file__).parent / (sys.argv[3] if len(sys.argv) > 3 else f"politica_supervivencia_s{semilla}.json")
    if salida.name.startswith("politica_habilidades"):
        sys.exit("politica_habilidades*.json es la red del mundo del usuario: elige otra salida")
    modo = sys.argv[4] if len(sys.argv) > 4 else "dqfd"
    n_act, k_ronda = int(os.environ.get("ACTORES", 4)), int(os.environ.get("K", 32))
    n_eval = int(os.environ.get("EVALUADORES", 8))
    prueba_n, validacion_n = int(os.environ.get("PRUEBA_N", 300)), int(os.environ.get("VALIDACION_N", 100))
    n_val = int(os.environ.get("VALIDACIONES", 20))
    random.seed(semilla)
    rng = np.random.default_rng(semilla)
    theta = red_nueva(rng)
    assert theta.size == NO * OCULTA + OCULTA + OCULTA * OCULTA + OCULTA + OCULTA * NA + NA
    objetivo, adam, mem = theta.copy(), Adam(theta.size), Memoria(MEMORIA)
    cal = calibrar()

    t0 = time.time()
    ctx = mp.get_context("spawn")  # procesos limpios (solo numpy), sin heredar hilos de BLAS
    os.environ["OPENBLAS_NUM_THREADS"] = "1"
    pool = ctx.Pool(n_eval)
    conexiones = []
    for i in range(n_act):
        a, b = ctx.Pipe()
        ctx.Process(target=actor, args=(i, b, semilla, episodios, modo), daemon=True).start()
        conexiones.append(a)
    print(f"entrenar_supervivencia_rapido: {episodios} episodios, semilla {semilla}, {modo} (suelo de imitación {SUELO}), red "
          f"{NO}→{OCULTA}→{OCULTA}→{NA} ({theta.size} parámetros) · {n_act} actores × {k_ronda} decisiones por ronda, "
          f"{n_eval} evaluadores · {n_val} validaciones de {validacion_n} mundos por perfil · {salida.name}\n"
          f"calibración: medidas de F7.2 en {', '.join(cal['medidas'])}; sin medir: "
          f"{', '.join(h for h in CAL_SV if h not in cal['medidas'])}", flush=True)
    guion_val = evaluar_async(pool, ("guion",), validacion_n, base=50_000)

    activo, siguiente = [None] * n_act, 0

    def repartir():
        nonlocal siguiente
        for i, c in enumerate(conexiones):
            nuevo = None
            if activo[i] is None and siguiente < episodios:
                nuevo = activo[i] = siguiente
                siguiente += 1
            c.send((theta, nuevo, k_ronda))

    repartir()  # ronda 0
    terminados, paso, actualizaciones, cada = 0, 0, 0, max(1, episodios // n_val)
    validaciones, hechas, lanzadas, t_aprender = [], [], 0, 0.0

    def informar(ep, eps, t_ep, e):
        print(f"episodio {ep + 1} eps {eps:.2f} {t_ep:.0f} s · R total {nota(e):.1f} · muertes {muertes(e)} · fidelidad mínima "
              f"{100 * fidelidad_min(e):.1f} %\n{texto(e, '  ')}", flush=True)

    while True:
        resultados = [c.recv() for c in conexiones]
        for i, (_, fin) in enumerate(resultados):
            if fin is not None:
                activo[i] = None
                terminados += 1
        quedan = siguiente < episodios or any(a is not None for a in activo)
        if quedan:
            repartir()  # ronda r+1 con los pesos de tras la r-1; mientras, el aprendiz entrena con la r
        ta = time.time()
        peso = peso_imitacion_de(min(terminados, episodios - 1), episodios, modo)
        for paquete, _ in resultados:
            if paquete is None:
                continue
            s, a, r, s2, d, dt = paquete
            g = guion_sv_lote(s)
            for k in range(len(a)):
                mem.poner(s[k], a[k], r[k], s2[k], d[k], dt[k], g[k])
                paso += 1
                if mem.n >= INICIO and paso % 2 == 0:
                    adam.paso(theta, gradiente(theta, objetivo, *mem.lote(rng), peso, gamma=GAMMA))
                    actualizaciones += 1
                if paso % CADA_OBJETIVO == 0:
                    objetivo[:] = theta
        t_aprender += time.time() - ta
        while terminados >= cada * (lanzadas + 1) and lanzadas < n_val:
            lanzadas += 1
            ep = cada * lanzadas - 1
            foto = theta.copy()
            validaciones.append((ep, eps_de(ep, episodios, modo), time.time() - t0, foto,
                                 evaluar_async(pool, ("red", foto), validacion_n, base=50_000)))
        while validaciones and validaciones[0][4].listo():
            ep, eps, t_ep, foto, re = validaciones.pop(0)
            e = re()
            hechas.append((ep, eps, foto, e))
            informar(ep, eps, t_ep, e)
        if not quedan:
            break
    t_entreno = time.time() - t0
    for c in conexiones:
        c.send(None)
    for ep, eps, t_ep, foto, re in validaciones:  # las que aún no habían acabado
        e = re()
        hechas.append((ep, eps, foto, e))
        informar(ep, eps, t_ep, e)
    gv = guion_val()
    print(f"guion en los mismos mundos de validación: R total {nota(gv):.1f} · muertes {muertes(gv)}\n{texto(gv, '  ')}")
    candidatos = [(ep, e) for ep, eps, _, e in hechas if eps <= 0.05 + 1e-9]
    ep_elegido, regla = elegir(candidatos, gv)
    _, _, theta, e_elegido = next(x for x in hechas if x[0] == ep_elegido)
    np.savez(salida.with_name(salida.stem.replace("politica_", "puntos_control_", 1) + ".npz"), episodios=np.array([x[0] for x in hechas]),
             pesos=np.stack([x[2] for x in hechas]), medidas=json.dumps([[x[0], x[1], _limpio(x[3])] for x in hechas]))
    print(f"entrenamiento: {paso} transiciones, {actualizaciones} actualizaciones en {t_entreno:.0f} s (aprendiz ocupado "
          f"{100 * t_aprender / t_entreno:.0f} %, {1000 * t_aprender / max(actualizaciones, 1):.2f} ms por actualización con la "
          f"memoria) · punto de control elegido: episodio {ep_elegido + 1} ({regla}; R total {nota(e_elegido):.1f}, muertes "
          f"{muertes(e_elegido)}, fidelidad mínima {100 * fidelidad_min(e_elegido):.1f} %)", flush=True)

    # ---- prueba final ----
    t1 = time.time()
    red = ("red", theta)
    pend = {"red": evaluar_async(pool, red, prueba_n), "guion": evaluar_async(pool, ("guion",), prueba_n),
            "azar": evaluar_async(pool, ("azar",), prueba_n), "azar_sin_reflejos": evaluar_async(pool, ("azar",), prueba_n,
                                                                                                 reflejos=False)}
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
        criterios.append((f"red − guion en muertes ≤ 0 ({p}: {rr[p]['muertes']} frente a {rg[p]['muertes']})",
                          rr[p]["muertes"] <= rg[p]["muertes"]))
    criterios.append((f"red − guion en muertes ≤ 0 (en total: {muertes(rr)} frente a {muertes(rg)})", muertes(rr) <= muertes(rg)))
    for p in perfiles:
        criterios.append((f"red − guion en recompensa ≥ −0,1 por mundo ({p}: {difs[p]['R'][0]:+.3f})", difs[p]["R"][0] >= -0.1))
    criterios.append((f"supervivencia, 0-1 muertes en {prueba_n} (red: {rr['supervivencia']['muertes']}; guion: "
                      f"{rg['supervivencia']['muertes']})", rr["supervivencia"]["muertes"] <= 1))
    for p in perfiles:
        criterios.append((f"coincidencia con el guion ≥ 95 % ({p}: {100 * rr[p]['fidelidad']:.1f} %)",
                          rr[p]["fidelidad"] >= FIDELIDAD_MIN))
    for p in perfiles:
        criterios.append((f"azar sin reflejos sin morir < 60 % ({p}: {100 * res['azar_sin_reflejos'][p]['vivos']:.1f} %)",
                          res["azar_sin_reflejos"][p]["vivos"] < 0.60))
    t_prueba = time.time() - t1
    pool.close(); pool.join()

    # Comprobación: la inferencia del ejecutor (float64 desde el JSON) da lo mismo que la del entrenamiento (float32)
    capas_json = a_json(theta)
    theta64 = de_json(capas_json, np.float64)
    env, coinciden = MundoSupervivencia(semilla=5, cal=cal), 0
    o = env.reset()
    for k in range(300):
        coinciden += int(adelante(theta64, o.astype(np.float64)).argmax()) == int(adelante(theta, o).argmax())
        o, _, hecho, _ = env.step(random.randrange(NA))
        if hecho:
            env.poner_perfil(perfiles[k % len(perfiles)]); o = env.reset()
    criterios.append((f"numpy float64/float32 en 300 decisiones ({coinciden}/300)", coinciden == 300))
    print("--- criterios del plan (F7.4)")
    for t, ok in criterios:
        print(f"  {'PASA ' if ok else 'FALLA'} {t}")

    json.dump({"capas": capas_json, "acciones": ACCIONES, "obs": OBS,
               "perfiles": {p: vector_perfil(w) for p, w in cargar_perfiles().items()}, "episodios": episodios, "semilla": semilla,
               "modo": modo, "fecha": time.strftime("%Y-%m-%d %H:%M"), "mundo": "supervivencia", "reflejos": True,
               "punto_de_control": {"episodio": ep_elegido + 1, "regla": regla, "validacion": _limpio(e_elegido),
                                    "guion_validacion": _limpio(gv)},
               "prueba_simulador": {n: _limpio(e) for n, e in res.items()},
               "red_menos_guion": {p: {k: [round(m, 4), round(ic, 4)] for k, (m, ic) in d.items()} for p, d in difs.items()},
               "criterios": [[t, bool(ok)] for t, ok in criterios],
               "calibracion": {"medidas": cal["medidas"], "cal_sv": {h: {k: v for k, v in cal[h].items()} for h in CAL_SV}},
               "entrenador": {"script": Path(__file__).name, "suelo_imitacion": SUELO, "actores": n_act, "k": k_ronda,
                              "evaluadores": n_eval,
                              "validaciones": n_val, "validacion_n": validacion_n, "prueba_n": prueba_n, "transiciones": paso,
                              "actualizaciones": actualizaciones, "s_entrenamiento": round(t_entreno),
                              "s_prueba": round(t_prueba)}},
              open(salida, "w"))
    print(f"guardada en {salida.name} · entrenamiento {t_entreno:.0f} s, prueba final {t_prueba:.0f} s, total "
          f"{time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
