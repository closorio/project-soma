#!/usr/bin/env python3
"""Versión rápida de entrenar_habilidades.py, con la misma configuración: DQN doble 25→64→64→6, modos libre/guiado/dqfd con los
mismos calendarios de exploración e imitación, 1, 2 y 3 personajes por turnos con perfiles mezclados, γ 0,97 por cada 10 s, lote 256,
Adam 5e-4, una actualización cada 2 transiciones (desde 5000), red objetivo cada 2000, memoria de 200 000, validación cada décimo
de los episodios (40 mundos; se queda con la mejor tras la exploración) y la misma prueba final (300 mundos por perfil y por equipo).
Cambia solo cómo se calcula (perfil del original, 5000 episodios: el aprendiz se llevaba ~85 % del tiempo y el simulador ~11 %):
- Aprendiz en numpy (red_numpy.py: retropropagación y Adam a mano; probar_rapido.py comprueba que da lo mismo que torch) y memoria
  en arrays: muestrear 256 de un deque de 200 000 costaba 1,7 ms y el paso de torch 2,7 ms; ahora ~0,8 ms el paso entero.
  La etiqueta del guion de cada transición se calcula al guardarla (guion_lote solo depende de la observación).
- ACTORES procesos juegan los episodios por rondas de K decisiones cada uno, con los episodios repartidos en orden; el aprendiz
  entrena con la ronda r mientras ellos juegan la r+1 con los pesos de tras la r-1 (retraso ≤ 2·ACTORES·K transiciones, ~1/4 del
  intervalo de la red objetivo con los valores por defecto). Es determinista: misma semilla, misma red.
  El aprendiz es el cuello de botella (cada actor genera experiencia ~3 veces más deprisa de lo que el aprendiz la consume), así que
  más actores no aceleran: solo añaden retraso y memoria.
- La validación (en segundo plano, mientras sigue el entrenamiento) y la prueba final se reparten entre EVALUADORES procesos.
Uso: entrenar_habilidades_rapido.py [episodios=5000] [semilla=0] [salida=politica_habilidades_equipo_rapida.json] [libre|guiado|dqfd]
     [agentes=1,2,3]      Entorno: ACTORES=4, K=32, EVALUADORES=12, HILOS_APRENDIZ=2, PRUEBA_N=300, VALIDACION_N=40.
Las funciones de evaluación en paralelo (evaluar, evaluar_equipos, uso…) las usa también comparar_politicas.py."""
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

from entorno_habilidades import (HABILIDADES, OBS, MundoHabilidades, calibrar, cargar_perfiles, guion_lote, jugar, politica_guion,
                                 politica_guion_solo, vector_perfil)
from red_numpy import Adam, a_json, adelante, de_json, gradiente, red_nueva

GAMMA, LOTE, NA, NO = 0.97, 256, len(HABILIDADES), len(OBS)
MEMORIA, INICIO, CADA_OBJETIVO = 200_000, 5000, 2000
EQUIPOS = [("recolector", "recolector"), ("recolector", "cooperativo"), ("recolector",) * 3, ("recolector", "cooperativo", "supervivencia")]
TROZO = 50  # mundos por tarea de evaluación (las políticas deterministas se reparten por trozos; el azar va entero, como el original)


def eps_de(ep, episodios, modo):
    return max(0.05, 1.0 - ep / ((0.25 if modo == "dqfd" else 0.5) * episodios))


def peso_imitacion_de(ep, episodios, modo):
    if modo == "dqfd":
        return max(0.1, 1 - 2 * ep / episodios)
    return 1 - 2 * ep / episodios if modo == "guiado" else 0


# ---------------- evaluación (en los procesos evaluadores) ----------------
_CAL = None


def _cal():
    global _CAL
    if _CAL is None:
        _CAL = calibrar()
    return _CAL


def _politica(desc):
    """desc: ("red", theta) —float32 como en el entrenamiento, o float64 como el ejecutor—, ("guion",), ("solo",) o ("azar",)."""
    if desc[0] == "red":
        theta = desc[1]
        return lambda o: int(adelante(theta, o.astype(theta.dtype, copy=False)).argmax())
    return {"guion": politica_guion, "solo": politica_guion_solo, "azar": None}[desc[0]]


def _tarea_perfil(desc, perfil, pacifico, base, k0, k1):
    """Mundos base+k0 … base+k1-1 con un perfil: por mundo (recompensa, troncos, fracción junto al jugador, huidas, murió)."""
    pol, rng, filas = _politica(desc), np.random.default_rng(1), []
    for k in range(k0, k1):
        env = MundoHabilidades(semilla=base + k, perfil=perfil, pacifico=pacifico, cal=_cal())
        o, hecho, total = env.reset(), False, 0.0
        while not hecho:
            o, r, hecho, _ = env.step(pol(o) if pol else int(rng.integers(NA)))
            total += r
        filas.append((total, env.inv, env.t_cerca / env.t, env.huidas, bool(env.salud <= 0)))
    return filas


def _tarea_equipo(desc, equipo, pacifico, base, k0, k1):
    """Por mundo: troncos y recompensa de cada agente, conflictos, estorbos y muertes."""
    pol, filas = _politica(desc), []
    for k in range(k0, k1):
        ags, Rk = jugar(MundoHabilidades(semilla=base + k, perfil=list(equipo), pacifico=pacifico, cal=_cal()), pol)
        filas.append(([ag["inv"] for ag in ags], Rk, sum(ag["conflictos"] for ag in ags), sum(ag["estorbos"] for ag in ags),
                      sum(bool(ag["salud"] <= 0) for ag in ags)))
    return filas


def _tarea_uso(desc, perfil, n=50):
    """Habilidades que elige la política en n episodios (semillas 100 000+k, la mitad con amenazas) y cuántas coinciden con el guion."""
    pol, uso, igual, total = _politica(desc), Counter(), 0, 0
    for k in range(n):
        env = MundoHabilidades(semilla=100_000 + k, perfil=list(perfil) if isinstance(perfil, tuple) else perfil, pacifico=bool(k % 2),
                               cal=_cal())
        o, hecho = env.reset(), False
        while not hecho:
            a = pol(o); uso[HABILIDADES[a]] += 1
            igual += a == politica_guion(o); total += 1
            o, _, hecho, _ = env.step(a)
    return uso, igual, total


def _trozos(n, desc):
    return [(0, n)] if desc[0] == "azar" else [(k, min(k + TROZO, n)) for k in range(0, n, TROZO)]


def evaluar_async(pool, desc, n=300, base=100_000):
    """Lanza la evaluación por perfil y modo (como evaluar() de entrenar_habilidades.py); recoger() da el mismo diccionario."""
    tareas = [(perfil, pac, pool.apply_async(_tarea_perfil, (desc, perfil, pac, base, k0, k1)))
              for perfil in cargar_perfiles() for pac in (True, False) for k0, k1 in _trozos(n, desc)]

    def recoger():
        res = {}
        for perfil, pac, t in tareas:
            res.setdefault(perfil, {}).setdefault("pacifico" if pac else "amenazas", []).extend(t.get())
        for perfil, modos in res.items():
            for m, filas in modos.items():
                R, troncos, cerca, huidas, muertes = (list(x) for x in zip(*filas))
                modos[m] = {"troncos": round(float(np.mean(troncos)), 2), "ee": round(float(np.std(troncos) / np.sqrt(len(filas))), 2),
                            "recompensa": round(float(np.mean(R)), 2), "muertes": int(sum(muertes)),
                            "junto": round(float(np.mean(cerca)), 3), "huidas": round(float(np.mean(huidas)), 2),
                            "_troncos": troncos, "_R": R}
        return res
    recoger.listo = lambda: all(t.ready() for *_, t in tareas)
    return recoger


def evaluar_equipos_async(pool, desc, n=300, base=200_000):
    tareas = [(equipo, pac, pool.apply_async(_tarea_equipo, (desc, equipo, pac, base, k0, k1)))
              for equipo in EQUIPOS for pac in (True, False) for k0, k1 in _trozos(n, desc)]

    def recoger():
        res = {}
        for equipo, pac, t in tareas:
            res.setdefault("+".join(equipo), {}).setdefault("pacifico" if pac else "amenazas", []).extend(t.get())
        for nombre, modos in res.items():
            for m, filas in modos.items():
                troncos, R, conf, est, muertes = (list(x) for x in zip(*filas))
                modos[m] = {"troncos": [round(float(x), 2) for x in np.mean(troncos, 0)],
                            "recompensa": [round(float(x), 2) for x in np.mean(R, 0)],
                            "conflictos": round(sum(conf) / len(filas), 2), "estorbos": round(sum(est) / len(filas), 2),
                            "muertes": int(sum(muertes)), "_troncos": np.sum(troncos, 1).tolist(), "_R": np.sum(R, 1).tolist()}
        return res
    recoger.listo = lambda: all(t.ready() for *_, t in tareas)
    return recoger


def uso_async(pool, desc):
    """Uso de habilidades y coincidencia con el guion: por perfil y por equipo (50 episodios cada uno)."""
    tareas = [(p, pool.apply_async(_tarea_uso, (desc, p))) for p in list(cargar_perfiles()) + EQUIPOS]
    return lambda: [(p, *t.get()) for p, t in tareas]


def nota(e, eq=None):
    return sum(v["recompensa"] for modos in e.values() for v in modos.values()) + \
        sum(sum(v["recompensa"]) for modos in (eq or {}).values() for v in modos.values())


def texto_equipos(eq, sangria=""):
    return "\n".join(sangria + f"{nombre:36s} " + " · ".join(f"{m} troncos {'/'.join(f'{t:.1f}' for t in v['troncos'])} (conflictos "
                     f"{v['conflictos']:.1f}, estorbos {v['estorbos']:.1f}, muertes {v['muertes']})" for m, v in modos.items())
                     for nombre, modos in eq.items())


def texto(e, sangria=""):
    return "\n".join(sangria + f"{p:13s} " + " · ".join(f"{m} {v['troncos']:4.1f} troncos (R {v['recompensa']:5.1f}, junto {100 * v['junto']:3.0f} %, "
                     f"huidas {v['huidas']:.1f}, muertes {v['muertes']})" for m, v in modos.items()) for p, modos in e.items())


def dif_ic(a, b):
    """Media de a − b (mismos mundos) y su intervalo del 95 %."""
    d = np.asarray(a, dtype=float) - np.asarray(b, dtype=float)
    return d.mean(), 1.96 * d.std() / np.sqrt(len(d))


# ---------------- actores ----------------
def actor(i, conexion, semilla, episodios, modo, agentes):
    """Juega los episodios que le asigna el aprendiz, K decisiones por ronda, con los pesos que llegan en cada ronda; devuelve las
    transiciones completas (la de cada agente va de su decisión a su siguiente turno, como en el original) y si acabó su episodio."""
    guiado = modo in ("guiado", "dqfd")
    cal, perfiles = calibrar(), list(cargar_perfiles())
    azar = random.Random(semilla * 1000 + i)
    env = MundoHabilidades(semilla=semilla * 1000 + 1 + i, cal=cal)
    ep = o = None
    pendiente, eps = {}, 1.0
    while (msg := conexion.recv()) is not None:
        theta, nuevo, k = msg
        if nuevo is not None:
            ep, eps = nuevo, eps_de(nuevo, episodios, modo)
            env.pacifico = ep % 2 == 0
            n = agentes[ep % len(agentes)]
            env.poner_perfil([perfiles[ep % len(perfiles)]] + [azar.choice(perfiles) for _ in range(n - 1)])
            o, pendiente = env.reset(), {}
        trans, terminado = [], None
        for _ in range(k if ep is not None else 0):
            j = env.turno
            if j in pendiente:
                po, pa, pr, pdt = pendiente.pop(j)
                trans.append((po, pa, pr, o, 0.0, pdt))
            if azar.random() >= eps:
                a = int(adelante(theta, o).argmax())
            else:
                a = politica_guion(o) if guiado and azar.random() < 0.5 else azar.randrange(NA)
            o2, r, hecho, info = env.step(a)
            if info["fin"]:
                trans.append((o, a, r, o, 1.0, info["s"]))
            else:
                pendiente[j] = (o, a, r, info["s"])
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


def main():
    episodios = int(sys.argv[1]) if len(sys.argv) > 1 else 5000
    semilla = int(sys.argv[2]) if len(sys.argv) > 2 else 0
    salida = Path(__file__).parent / (sys.argv[3] if len(sys.argv) > 3 else "politica_habilidades_equipo_rapida.json")
    if salida.name == "politica_habilidades.json":
        sys.exit("politica_habilidades.json está en uso: elige otra salida")
    modo = sys.argv[4] if len(sys.argv) > 4 else "dqfd"
    agentes = [int(x) for x in (sys.argv[5] if len(sys.argv) > 5 else "1,2,3").split(",")]
    n_act, k_ronda = int(os.environ.get("ACTORES", 4)), int(os.environ.get("K", 32))
    n_eval = int(os.environ.get("EVALUADORES", 12))
    prueba_n, validacion_n = int(os.environ.get("PRUEBA_N", 300)), int(os.environ.get("VALIDACION_N", 40))
    random.seed(semilla)
    rng = np.random.default_rng(semilla)
    theta = red_nueva(rng)
    objetivo, adam, mem = theta.copy(), Adam(theta.size), Memoria(MEMORIA)

    t0 = time.time()
    ctx = mp.get_context("spawn")  # procesos limpios (solo numpy), sin heredar hilos de BLAS
    os.environ["OPENBLAS_NUM_THREADS"] = "1"
    pool = ctx.Pool(n_eval)
    conexiones = []
    for i in range(n_act):
        a, b = ctx.Pipe()
        ctx.Process(target=actor, args=(i, b, semilla, episodios, modo, agentes), daemon=True).start()
        conexiones.append(a)
    print(f"entrenar_habilidades_rapido: {episodios} episodios, semilla {semilla}, {modo}, agentes {agentes} · {n_act} actores × "
          f"{k_ronda} decisiones por ronda, {n_eval} evaluadores · {salida.name}", flush=True)

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
    terminados, paso, actualizaciones, cada = 0, 0, 0, max(1, episodios // 10)
    validaciones, lanzadas, mejor, mejor_estado, t_aprender = [], 0, -1e9, None, 0.0
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
            g = guion_lote(s)
            for k in range(len(a)):
                mem.poner(s[k], a[k], r[k], s2[k], d[k], dt[k], g[k])
                paso += 1
                if mem.n >= INICIO and paso % 2 == 0:
                    adam.paso(theta, gradiente(theta, objetivo, *mem.lote(rng), peso, gamma=GAMMA))
                    actualizaciones += 1
                if paso % CADA_OBJETIVO == 0:
                    objetivo[:] = theta
        t_aprender += time.time() - ta
        while terminados >= cada * (lanzadas + 1) and lanzadas < 10:
            lanzadas += 1
            ep = cada * lanzadas - 1
            foto = theta.copy()
            validaciones.append((ep, eps_de(ep, episodios, modo), time.time() - t0, foto,
                                 evaluar_async(pool, ("red", foto), validacion_n, base=50_000),
                                 evaluar_equipos_async(pool, ("red", foto), validacion_n, base=60_000) if max(agentes) > 1 else None))
        while validaciones and validaciones[0][4].listo() and (validaciones[0][5] is None or validaciones[0][5].listo()):
            ep, eps, t_ep, foto, re, req = validaciones.pop(0)
            e, eq = re(), (req() if req else {})
            if eps <= 0.05 + 1e-9 and nota(e, eq) > mejor:
                mejor, mejor_estado = nota(e, eq), foto
            print(f"episodio {ep + 1} eps {eps:.2f} {t_ep:.0f} s · R total {nota(e, eq):.1f}\n{texto(e, '  ')}\n"
                  f"{texto_equipos(eq, '  ')}", flush=True)
        if not quedan:
            break
    t_entreno = time.time() - t0
    for c in conexiones:
        c.send(None)
    for ep, eps, t_ep, foto, re, req in validaciones:  # las que aún no habían acabado
        e, eq = re(), (req() if req else {})
        if eps <= 0.05 + 1e-9 and nota(e, eq) > mejor:
            mejor, mejor_estado = nota(e, eq), foto
        print(f"episodio {ep + 1} eps {eps:.2f} {t_ep:.0f} s · R total {nota(e, eq):.1f}\n{texto(e, '  ')}\n"
              f"{texto_equipos(eq, '  ')}", flush=True)
    if mejor_estado is not None:
        theta = mejor_estado
    print(f"entrenamiento: {paso} transiciones, {actualizaciones} actualizaciones en {t_entreno:.0f} s (aprendiz ocupado "
          f"{100 * t_aprender / t_entreno:.0f} %, {1000 * t_aprender / max(actualizaciones, 1):.2f} ms por actualización con la "
          f"memoria) · validación elegida: R total {mejor:.1f}", flush=True)

    # ---- prueba final (la misma que entrenar_habilidades.py) ----
    t1 = time.time()
    red = ("red", theta)
    pend = {n: evaluar_async(pool, d, prueba_n) for n, d in (("red", red), ("guion", ("guion",)), ("azar", ("azar",)))}
    pend_eq = {n: evaluar_equipos_async(pool, d, prueba_n) for n, d in (("red", red), ("guion", ("guion",)), ("solo", ("solo",)))}
    pend_uso = uso_async(pool, red)
    res = {n: f() for n, f in pend.items()}
    for n, e in res.items():
        print(f"PRUEBA {n}\n{texto(e, '  ')}")
    perfiles = list(cargar_perfiles())
    print("red − guion (mismos mundos, troncos | recompensa):")
    for perfil in perfiles:
        print(f"  {perfil:13s} " + " · ".join(
            "{} {:+.2f} ± {:.2f} | R {:+.2f} ± {:.2f}".format(m, *dif_ic(res["red"][perfil][m]["_troncos"], res["guion"][perfil][m]["_troncos"]),
                                                          *dif_ic(res["red"][perfil][m]["_R"], res["guion"][perfil][m]["_R"]))
            for m in ("pacifico", "amenazas")))
    usos = pend_uso()
    for p, uso, igual, total in usos[:len(perfiles)]:
        print(f"uso ({p}, 50 episodios): {dict(uso.most_common())} · igual que su guion {100 * igual / total:.1f} %")
    eqs = {n: f() for n, f in pend_eq.items()}
    for n, eq in eqs.items():
        print(f"PRUEBA EQUIPOS {n}\n{texto_equipos(eq, '  ')}")
    print("troncos del equipo por mundo, red − guion | red − solo:")
    for nombre in eqs["red"]:
        print(f"  {nombre:36s} " + " · ".join(f"{m} " + " | ".join(
            "{:+.2f} ± {:.2f}".format(*dif_ic(eqs["red"][nombre][m]["_troncos"], eqs[o][nombre][m]["_troncos"])) for o in ("guion", "solo"))
            for m in ("pacifico", "amenazas")))
    for p, uso, igual, total in usos[len(perfiles):]:
        print(f"uso ({'+'.join(p)}, 50 episodios): {dict(uso.most_common())} · igual que el guion {100 * igual / total:.1f} %")
    t_prueba = time.time() - t1
    pool.close(); pool.join()

    for e in list(res.values()) + list(eqs.values()):
        for modos in e.values():
            for v in modos.values():
                v.pop("_troncos"); v.pop("_R")
    json.dump({"capas": a_json(theta), "acciones": HABILIDADES, "obs": OBS,
               "perfiles": {p: vector_perfil(w) for p, w in cargar_perfiles().items()}, "episodios": episodios, "semilla": semilla,
               "modo": modo, "agentes": agentes, "fecha": time.strftime("%Y-%m-%d %H:%M"), "prueba_simulador": res, "prueba_equipos": eqs,
               "entrenador": {"script": Path(__file__).name, "actores": n_act, "k": k_ronda, "transiciones": paso,
                              "actualizaciones": actualizaciones, "s_entrenamiento": round(t_entreno), "s_prueba": round(t_prueba)}},
              open(salida, "w"))

    # Comprobación: la inferencia del ejecutor (float64 desde el JSON) da lo mismo que la del entrenamiento (float32)
    theta64 = de_json(json.load(open(salida))["capas"], np.float64)
    env, coinciden = MundoHabilidades(semilla=5, pacifico=False, cal=calibrar()), 0
    o = env.reset()
    for k in range(300):
        coinciden += int(adelante(theta64, o.astype(np.float64)).argmax()) == int(adelante(theta, o).argmax())
        o, _, hecho, _ = env.step(random.randrange(NA))
        if hecho:
            env.poner_perfil(perfiles[k % len(perfiles)]); o = env.reset()
    print(f"coincidencia numpy float64/float32: {coinciden}/300 · guardada en {salida.name} · entrenamiento {t_entreno:.0f} s, "
          f"prueba final {t_prueba:.0f} s, total {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
