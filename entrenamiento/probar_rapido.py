#!/usr/bin/env python3
"""Pruebas de entrenar_habilidades_rapido.py: el aprendiz de red_numpy.py hace las mismas cuentas que el de torch de
entrenar_habilidades.py (gradiente de un lote y 300 pasos de Adam con los mismos lotes, con y sin imitación), y cuánto tarda cada uno.
Uso: probar_rapido.py   (sale con código 1 si algo no cuadra)"""
import os
os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import sys, time

import numpy as np
import torch
import torch.nn as nn

from entorno_habilidades import guion_lote
from red_numpy import NA, NO, Adam, capas, de_json, gradiente, red_nueva

torch.set_num_threads(2)
GAMMA, LOTE, M = 0.97, 256, 20_000
rng = np.random.default_rng(0)
S, S2 = rng.random((M, NO), dtype=np.float32), rng.random((M, NO), dtype=np.float32)
A, R = rng.integers(0, NA, M), rng.normal(0, 2, M).astype(np.float32)
D, DT = (rng.random(M) < 0.02).astype(np.float32), rng.uniform(1, 40, M).astype(np.float32)
G = guion_lote(S).astype(np.int64)


def red_torch(theta):
    red = nn.Sequential(nn.Linear(NO, 64), nn.ReLU(), nn.Linear(64, 64), nn.ReLU(), nn.Linear(64, NA))
    with torch.no_grad():
        for p, x in zip(red.parameters(), capas(theta)):
            p.copy_(torch.from_numpy(x.copy()))
    return red


def paso_torch(red, objetivo, opt, idx, peso):
    """El paso de entrenar_habilidades.py, tal cual (salvo que el lote viene dado)."""
    s, a_, r_, s2, d, dt = (torch.from_numpy(x[idx]) for x in (S, A, R, S2, D, DT))
    q = red(s).gather(1, a_.long().unsqueeze(1)).squeeze(1)
    with torch.no_grad():
        q2 = objetivo(s2).gather(1, red(s2).argmax(1, keepdim=True)).squeeze(1)
        y = r_ + GAMMA ** (dt / 10) * q2 * (1 - d)
    perdida = nn.functional.smooth_l1_loss(q, y)
    if peso > 0:
        qs, ag = red(s), torch.from_numpy(guion_lote(s.numpy())).long()
        margen = qs + 0.2 * (torch.arange(NA)[None, :] != ag[:, None]).float()
        perdida = perdida + peso * (margen.max(1).values - qs.gather(1, ag[:, None]).squeeze(1)).mean()
    opt.zero_grad(); perdida.backward(); nn.utils.clip_grad_norm_(red.parameters(), 10); opt.step()


def theta_de(red):
    return np.concatenate([p.detach().numpy().ravel() for p in red.parameters()])


def theta_a_torch(red, theta):
    with torch.no_grad():
        for p, x in zip(red.parameters(), capas(theta)):
            p.copy_(torch.from_numpy(x.copy()))


fallos = 0
for peso in (1.0, 0.1, 0.0):
    # 300 pasos de entrenamiento con numpy; en cada uno, el gradiente de torch en el mismo punto y con el mismo lote (sin recorte
    # que lo enmascare: SGD con lr 1 da theta − gradiente), y un Adam de torch alimentado con los gradientes de numpy.
    # (Comparar dos trayectorias enteras no sirve: Adam lleva cada peso ±lr por paso aunque su gradiente sea ruido de redondeo
    # de 1e-9, y torch contra sí mismo con otro orden de suma también se separa.)
    theta0 = red_nueva(np.random.default_rng(1))
    theta, obj, adam = theta0.copy(), theta0.copy(), Adam(theta0.size)
    red, objetivo, sombra = red_torch(theta0), red_torch(theta0), red_torch(theta0)
    sgd, opt = torch.optim.SGD(red.parameters(), lr=1.0), torch.optim.Adam(sombra.parameters(), lr=5e-4)
    err_g = 0.0
    for k in range(300):
        idx = rng.choice(M, LOTE, replace=False)
        theta_a_torch(red, theta)
        paso_torch(red, objetivo, sgd, idx, peso)
        g_np = gradiente(theta, obj, S[idx], A[idx], R[idx], S2[idx], D[idx], DT[idx], G[idx], peso)
        g_t = theta - theta_de(red)
        if np.abs(g_t).max() > 0:
            err_g = max(err_g, float(np.abs(g_np - g_t).max() / np.abs(g_t).max()))
        adam.paso(theta, g_np)
        for p_, x in zip(sombra.parameters(), capas(g_np.copy())):
            p_.grad = torch.from_numpy(x.copy())
        opt.step()
        if (k + 1) % 100 == 0:
            obj = theta.copy(); theta_a_torch(objetivo, theta)
    err_t = float(np.abs(theta - theta_de(sombra)).max())
    ok = err_g < 1e-3 and err_t < 1e-5
    fallos += not ok
    print(f"imitación {peso}: gradiente en 300 lotes, error relativo máximo {err_g:.1e} · Adam tras 300 pasos, diferencia máxima "
          f"{err_t:.1e} (los pesos se movieron {np.abs(theta - theta0).max():.1e}) · {'bien' if ok else 'MAL'}")

# Inferencia: la del ejecutor (float64 desde el JSON) frente a la del entrenamiento (float32)
from red_numpy import a_json, adelante
theta = red_nueva(np.random.default_rng(3))
x = S[:5000]
coinciden = int((adelante(de_json(a_json(theta), np.float64), x.astype(np.float64)).argmax(1) == adelante(theta, x).argmax(1)).sum())
fallos += coinciden < 4995
print(f"inferencia float64 (ejecutor) y float32 (entrenamiento): {coinciden}/5000 iguales")

# La evaluación repartida en trozos da lo mismo que el bucle secuencial de evaluar()/evaluar_equipos() del original
import random
from entorno_habilidades import MundoHabilidades, calibrar, jugar, politica_guion
from entrenar_habilidades_rapido import _politica, _tarea_equipo, _tarea_perfil, actor, eps_de

CAL = calibrar()
theta = red_nueva(np.random.default_rng(4))
for desc in (("guion",), ("red", theta), ("azar",)):
    pol, rng_az, sec = _politica(desc), np.random.default_rng(1), []
    for k in range(12):
        env = MundoHabilidades(semilla=100_000 + k, perfil="cooperativo", pacifico=False, cal=CAL)
        o, hecho, total = env.reset(), False, 0.0
        while not hecho:
            o, r, hecho, _ = env.step(pol(o) if pol else int(rng_az.integers(NA)))
            total += r
        sec.append((total, env.inv, env.t_cerca / env.t, env.huidas, bool(env.salud <= 0)))
    trozos = _tarea_perfil(desc, "cooperativo", False, 100_000, 0, 12) if desc[0] == "azar" else \
        _tarea_perfil(desc, "cooperativo", False, 100_000, 0, 5) + _tarea_perfil(desc, "cooperativo", False, 100_000, 5, 12)
    ok = trozos == sec
    fallos += not ok
    print(f"evaluación por perfil ({desc[0]}): {'igual' if ok else 'DISTINTA'} que el bucle secuencial")
sec = []
for k in range(6):
    ags, Rk = jugar(MundoHabilidades(semilla=200_000 + k, perfil=["recolector", "cooperativo", "supervivencia"], pacifico=True, cal=CAL),
                    _politica(("red", theta)))
    sec.append(([ag["inv"] for ag in ags], Rk, sum(ag["conflictos"] for ag in ags), sum(ag["estorbos"] for ag in ags),
                sum(bool(ag["salud"] <= 0) for ag in ags)))
eq = ("recolector", "cooperativo", "supervivencia")
ok = _tarea_equipo(("red", theta), eq, True, 200_000, 0, 2) + _tarea_equipo(("red", theta), eq, True, 200_000, 2, 6) == sec
fallos += not ok
print(f"evaluación de equipos: {'igual' if ok else 'DISTINTA'} que el bucle secuencial")


# El actor guarda las mismas transiciones que el bucle de entrenar_habilidades.py (mismos mundos y mismas tiradas), aunque juegue
# el episodio en rondas de pocas decisiones
class Conexion:
    def __init__(self, mensajes):
        self.mensajes, self.enviado = list(mensajes), []

    def recv(self):
        return self.mensajes.pop(0)

    def send(self, x):
        self.enviado.append(x)


for ep in (3, 1, 2):  # 1, 2 y 3 personajes
    conexion = Conexion([(theta, ep, 7)] + [(theta, None, 7)] * 200 + [None])
    actor(0, conexion, 3, 100, "dqfd", [1, 2, 3])
    paquetes = [p for p, _ in conexion.enviado if p is not None]
    fin = [f for _, f in conexion.enviado if f is not None]
    s_act = np.concatenate([p[0] for p in paquetes]); a_act = np.concatenate([p[1] for p in paquetes])
    d_act = np.concatenate([p[4] for p in paquetes])
    # bucle original con las mismas semillas que el actor 0 de la semilla 3
    azar, perfiles = random.Random(3000), ["constructor", "cooperativo", "explorador", "recolector", "supervivencia"]
    env = MundoHabilidades(semilla=3001, cal=CAL)
    eps = eps_de(ep, 100, "dqfd")
    env.pacifico = ep % 2 == 0
    n = [1, 2, 3][ep % 3]
    env.poner_perfil([perfiles[ep % 5]] + [azar.choice(perfiles) for _ in range(n - 1)])
    o, hecho, pendiente, memoria = env.reset(), False, {}, []
    while not hecho:
        j = env.turno
        if j in pendiente:
            po, pa, pr, pdt = pendiente.pop(j)
            memoria.append((po, pa, pr, o, 0.0, pdt))
        if azar.random() >= eps:
            a = int(adelante(theta, o).argmax())
        else:
            a = politica_guion(o) if azar.random() < 0.5 else azar.randrange(NA)
        o2, r, hecho, info = env.step(a)
        if info["fin"]:
            memoria.append((o, a, r, o, 1.0, info["s"]))
        else:
            pendiente[j] = (o, a, r, info["s"])
        o = o2
    ok = fin == [ep] and len(memoria) == len(a_act) and np.array_equal(np.array([m[0] for m in memoria]), s_act) and \
        np.array_equal(np.array([m[1] for m in memoria]), a_act) and np.array_equal(np.array([m[4] for m in memoria]), d_act)
    fallos += not ok
    print(f"actor, episodio {ep} ({n} personajes): {len(a_act)} transiciones, {'iguales' if ok else 'DISTINTAS'} a las del bucle original")

# Tiempo por actualización (lote 256, memoria de 200 000 como al final del entrenamiento)
M2 = 200_000
grande = [np.resize(x, (M2,) + x.shape[1:]) for x in (S, A, R, S2, D, DT, G)]
theta, obj, adam = theta0.copy(), theta0.copy(), Adam(theta0.size)
t = time.perf_counter()
for _ in range(2000):
    idx = rng.choice(M2, LOTE, replace=False)
    s, a, r, s2, d, dt, g = (x[idx] for x in grande)
    adam.paso(theta, gradiente(theta, obj, s, a, r, s2, d, dt, g, 0.5))
t_np = (time.perf_counter() - t) / 2000
red, objetivo = red_torch(theta0), red_torch(theta0)
opt = torch.optim.Adam(red.parameters(), lr=5e-4)
t = time.perf_counter()
for _ in range(300):
    paso_torch(red, objetivo, opt, rng.choice(M, LOTE, replace=False), 0.5)
t_t = (time.perf_counter() - t) / 300
print(f"actualización: numpy {1000 * t_np:.2f} ms · torch {1000 * t_t:.2f} ms (sin contar el muestreo del deque, que en el original "
      f"añade ~1,7 ms con la memoria llena)")
sys.exit(1 if fallos else 0)
