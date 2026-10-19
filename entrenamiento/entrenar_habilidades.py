#!/usr/bin/env python3
"""Entrena la red de F2 que elige HABILIDADES (entorno_habilidades.py) y la exporta a politica_habilidades.json.
DQN doble 25→64→64→6 con descuento por duración (γ^(segundos/10)); la mitad de los episodios con amenazas nocturnas.
F3: cada episodio lleva un perfil de perfiles/*.json (por turnos), que entra en la observación (perfil_*) y pondera la
recompensa; la imitación usa el guion de ese perfil (guion_lote lo lee de la observación). Una sola red para todos.
Fase C (varios personajes): cada episodio tiene 1, 2 o 3 agentes por turnos (AGENTES) en el mismo mundo; el primero lleva el
perfil por turnos y los demás uno al azar (perfiles mezclados). Todos usan la misma red y dejan su experiencia en la misma memoria;
la transición de cada agente va de su decisión a su siguiente turno. El guion que se imita incluye la regla del compañero
(ir_a_otro_arbol si el compañero va a mi árbol y llega antes).
Compara, perfil a perfil, en mundos emparejados (mismas semillas) la red con el guion a mano y con el azar, y en equipos de 2 y 3
(EQUIPOS) la red con el guion y con el guion sin la regla del compañero.
Modo «guiado»: explora a medias con el guion y suma una pérdida de imitación del guion (margen, como DQfD) que se apaga
a mitad del entrenamiento; la red parte del guion y solo se aparta de él donde el valor aprendido lo justifica.
Modo «dqfd»: igual, pero la imitación baja a un suelo de 0,1 y se queda (sin ella el DQN se hunde: la diferencia de valor
entre una habilidad útil y una que gasta 1 s en vano es pequeña), y la exploración acaba en el primer cuarto.
Uso: entrenar_habilidades.py [episodios=4000] [semilla=0] [salida=politica_habilidades.json] [libre|guiado|dqfd] [agentes=1,2,3]
(PRUEBA_N=300 y VALIDACION_N=40 en el entorno: mundos por perfil y modo en la prueba final y en cada validación)"""
import json, os, random, sys, time
from collections import deque
from pathlib import Path

import numpy as np
import torch
import torch.nn as nn

from entorno_habilidades import (HABILIDADES, OBS, MundoHabilidades, calibrar, cargar_perfiles, guion_lote, jugar, politica_guion,
                                  politica_guion_solo, vector_perfil)

EPISODIOS = int(sys.argv[1]) if len(sys.argv) > 1 else 4000
SEMILLA = int(sys.argv[2]) if len(sys.argv) > 2 else 0
SALIDA = Path(__file__).parent / (sys.argv[3] if len(sys.argv) > 3 else "politica_habilidades.json")
MODO = sys.argv[4] if len(sys.argv) > 4 else "libre"
GUIADO = MODO in ("guiado", "dqfd")
AGENTES = [int(x) for x in (sys.argv[5] if len(sys.argv) > 5 else "1,2,3").split(",")]
GAMMA, LOTE, NA, NO = 0.97, 256, len(HABILIDADES), len(OBS)  # GAMMA por cada 10 s de juego
random.seed(SEMILLA); np.random.seed(SEMILLA); torch.manual_seed(SEMILLA); torch.set_num_threads(2)
CAL = calibrar()
PERFILES = list(cargar_perfiles())
PRUEBA_N, VALIDACION_N = int(os.environ.get("PRUEBA_N", 300)), int(os.environ.get("VALIDACION_N", 40))
EQUIPOS = [("recolector", "recolector"), ("recolector", "cooperativo"), ("recolector",) * 3, ("recolector", "cooperativo", "supervivencia")]

def nueva_red():
    return nn.Sequential(nn.Linear(NO, 64), nn.ReLU(), nn.Linear(64, 64), nn.ReLU(), nn.Linear(64, NA))

red, objetivo = nueva_red(), nueva_red()
objetivo.load_state_dict(red.state_dict())
opt = torch.optim.Adam(red.parameters(), lr=5e-4)
memoria = deque(maxlen=200_000)

def politica_red(o):
    with torch.no_grad():
        return int(red(torch.from_numpy(o)).argmax())

def evaluar(pol, n=300, base=100_000):
    """Por perfil y modo, en n mundos fijos (semillas base+k; todas las políticas y perfiles ven los mismos): troncos, recompensa,
    muertes, % del tiempo a ≤ 6 bloques del jugador y huidas con éxito."""
    res = {}
    for perfil in PERFILES:
        res[perfil] = {}
        for pacifico in (True, False):
            rng, R, troncos, cerca, huidas, muertes = np.random.default_rng(1), [], [], [], [], 0
            for k in range(n):
                env = MundoHabilidades(semilla=base + k, perfil=perfil, pacifico=pacifico, cal=CAL)
                o, hecho, total = env.reset(), False, 0.0
                while not hecho:
                    o, r, hecho, _ = env.step(pol(o) if pol else int(rng.integers(NA)))
                    total += r
                R.append(total); troncos.append(env.inv); cerca.append(env.t_cerca / env.t); huidas.append(env.huidas)
                muertes += env.salud <= 0
            res[perfil]["pacifico" if pacifico else "amenazas"] = {"troncos": round(float(np.mean(troncos)), 2),
                "ee": round(float(np.std(troncos) / np.sqrt(n)), 2), "recompensa": round(float(np.mean(R)), 2), "muertes": muertes,
                "junto": round(float(np.mean(cerca)), 3), "huidas": round(float(np.mean(huidas)), 2), "_troncos": troncos, "_R": R}
    return res

def evaluar_equipos(pol, n=300, base=200_000):
    """Por equipo de EQUIPOS y modo, en n mundos fijos: troncos y recompensa de cada agente, conflictos (veces que uno fue al
    árbol que era objetivo de un compañero), estorbos (picar fallido con un compañero delante) y muertes."""
    res = {}
    for equipo in EQUIPOS:
        res["+".join(equipo)] = modos = {}
        for pacifico in (True, False):
            troncos, R, conf, est, muertes = [], [], 0, 0, 0
            for k in range(n):
                ags, Rk = jugar(MundoHabilidades(semilla=base + k, perfil=list(equipo), pacifico=pacifico, cal=CAL), pol)
                troncos.append([ag["inv"] for ag in ags]); R.append(Rk)
                conf += sum(ag["conflictos"] for ag in ags); est += sum(ag["estorbos"] for ag in ags)
                muertes += sum(ag["salud"] <= 0 for ag in ags)
            modos["pacifico" if pacifico else "amenazas"] = {
                "troncos": [round(float(x), 2) for x in np.mean(troncos, 0)], "recompensa": [round(float(x), 2) for x in np.mean(R, 0)],
                "conflictos": round(conf / n, 2), "estorbos": round(est / n, 2), "muertes": muertes,
                "_troncos": np.sum(troncos, 1).tolist(), "_R": np.sum(R, 1).tolist()}
    return res

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

t0, paso, mejor, mejor_estado = time.time(), 0, -1e9, None
env = MundoHabilidades(semilla=SEMILLA + 1, cal=CAL)
for ep in range(EPISODIOS):
    eps = max(0.05, 1.0 - ep / ((0.25 if MODO == "dqfd" else 0.5) * EPISODIOS))
    peso_imitacion = max(0.1, 1 - 2 * ep / EPISODIOS) if MODO == "dqfd" else (1 - 2 * ep / EPISODIOS if GUIADO else 0)
    env.pacifico = ep % 2 == 0
    # 5 perfiles × 2 modos × AGENTES por turnos para el primero (todas las combinaciones); los demás, un perfil al azar
    n = AGENTES[ep % len(AGENTES)]
    env.poner_perfil([PERFILES[ep % len(PERFILES)]] + [random.choice(PERFILES) for _ in range(n - 1)])
    o, hecho, pendiente = env.reset(), False, {}
    while not hecho:
        j = env.turno
        if j in pendiente:  # la transición anterior de este agente termina en su observación de ahora
            po, pa, pr, pdt = pendiente.pop(j)
            memoria.append((po, pa, pr, o, 0.0, pdt))
        if random.random() >= eps:
            a = politica_red(o)
        else:
            a = politica_guion(o) if GUIADO and random.random() < 0.5 else random.randrange(NA)
        o2, r, hecho, info = env.step(a)
        if info["fin"]:
            memoria.append((o, a, r, o, 1.0, info["s"]))  # fin del episodio para este agente: el valor siguiente no cuenta
        else:
            pendiente[j] = (o, a, r, info["s"])
        o = o2; paso += 1
        if len(memoria) >= 5000 and paso % 2 == 0:
            s, a_, r_, s2, d, dt = (torch.tensor(np.array(x), dtype=torch.float32) for x in zip(*random.sample(memoria, LOTE)))
            q = red(s).gather(1, a_.long().unsqueeze(1)).squeeze(1)
            with torch.no_grad():  # DQN doble: la red elige, la objetivo valora
                q2 = objetivo(s2).gather(1, red(s2).argmax(1, keepdim=True)).squeeze(1)
                y = r_ + GAMMA ** (dt / 10) * q2 * (1 - d)
            perdida = nn.functional.smooth_l1_loss(q, y)
            if peso_imitacion > 0:  # imitación con margen: Q(guion) ≥ Q(otra) + 0,2
                qs, ag = red(s), torch.from_numpy(guion_lote(s.numpy())).long()
                margen = qs + 0.2 * (torch.arange(NA)[None, :] != ag[:, None]).float()
                perdida = perdida + peso_imitacion * (margen.max(1).values - qs.gather(1, ag[:, None]).squeeze(1)).mean()
            opt.zero_grad(); perdida.backward(); nn.utils.clip_grad_norm_(red.parameters(), 10); opt.step()
        if paso % 2000 == 0:
            objetivo.load_state_dict(red.state_dict())
    if (ep + 1) % (EPISODIOS // 10) == 0:
        e = evaluar(politica_red, VALIDACION_N, base=50_000)  # validación (otras semillas que la prueba final)
        eq = evaluar_equipos(politica_red, VALIDACION_N, base=60_000) if max(AGENTES) > 1 else {}
        if eps <= 0.05 + 1e-9 and nota(e, eq) > mejor:
            mejor, mejor_estado = nota(e, eq), {k: v.clone() for k, v in red.state_dict().items()}
        print(f"episodio {ep + 1} eps {eps:.2f} {time.time() - t0:.0f} s · R total {nota(e, eq):.1f}\n{texto(e, '  ')}\n"
              f"{texto_equipos(eq, '  ')}", flush=True)

if mejor_estado:
    red.load_state_dict(mejor_estado)
res = {n: evaluar(p, PRUEBA_N) for n, p in (("red", politica_red), ("guion", politica_guion), ("azar", None))}
for n, e in res.items():
    print(f"PRUEBA {n}\n{texto(e, '  ')}")
print("red − guion (mismos mundos, troncos | recompensa):")
for perfil in PERFILES:
    dif = {m: (np.array(res["red"][perfil][m]["_troncos"]) - np.array(res["guion"][perfil][m]["_troncos"]),
               np.array(res["red"][perfil][m]["_R"]) - np.array(res["guion"][perfil][m]["_R"])) for m in ("pacifico", "amenazas")}
    print(f"  {perfil:13s} " + " · ".join(f"{m} {d.mean():+.2f} ± {1.96 * d.std() / np.sqrt(len(d)):.2f} | R {dr.mean():+.2f} ± "
                                         f"{1.96 * dr.std() / np.sqrt(len(dr)):.2f}" for m, (d, dr) in dif.items()))

# Elección de habilidades de la red en la prueba y coincidencia con el guion de cada perfil (para ver qué ha aprendido)
from collections import Counter
for perfil in PERFILES:
    uso, igual, total = Counter(), 0, 0
    for k in range(50):
        env = MundoHabilidades(semilla=100_000 + k, perfil=perfil, pacifico=bool(k % 2), cal=CAL)
        o, hecho = env.reset(), False
        while not hecho:
            a = politica_red(o); uso[HABILIDADES[a]] += 1
            igual += a == politica_guion(o); total += 1
            o, _, hecho, _ = env.step(a)
    print(f"uso ({perfil}, 50 episodios): {dict(uso.most_common())} · igual que su guion {100 * igual / total:.1f} %")

# Equipos (fase C): red, guion con la regla del compañero y guion sin ella («solo»), en los mismos mundos
eqs = {n: evaluar_equipos(p, PRUEBA_N) for n, p in (("red", politica_red), ("guion", politica_guion), ("solo", politica_guion_solo))}
for n, eq in eqs.items():
    print(f"PRUEBA EQUIPOS {n}\n{texto_equipos(eq, '  ')}")
print("troncos del equipo por mundo, red − guion | red − solo:")
for nombre in eqs["red"]:
    print(f"  {nombre:36s} " + " · ".join(
        f"{m} " + " | ".join(f"{d.mean():+.2f} ± {1.96 * d.std() / np.sqrt(len(d)):.2f}" for d in
                             (np.array(eqs["red"][nombre][m]["_troncos"]) - np.array(eqs[o][nombre][m]["_troncos"]) for o in ("guion", "solo")))
        for m in ("pacifico", "amenazas")))
for equipo in EQUIPOS:
    uso, igual, total = Counter(), 0, 0
    for k in range(50):
        env = MundoHabilidades(semilla=100_000 + k, perfil=list(equipo), pacifico=bool(k % 2), cal=CAL)
        o, hecho = env.reset(), False
        while not hecho:
            a = politica_red(o); uso[HABILIDADES[a]] += 1
            igual += a == politica_guion(o); total += 1
            o, _, hecho, _ = env.step(a)
    print(f"uso ({'+'.join(equipo)}, 50 episodios): {dict(uso.most_common())} · igual que el guion {100 * igual / total:.1f} %")

capas = [m for m in red if isinstance(m, nn.Linear)]
for e in list(res.values()) + list(eqs.values()):
    for modos in e.values():
        for v in modos.values():
            v.pop("_troncos"); v.pop("_R")
json.dump({"capas": [{"w": c.weight.detach().numpy().tolist(), "b": c.bias.detach().numpy().tolist()} for c in capas],
           "acciones": HABILIDADES, "obs": OBS,
           "perfiles": {p: vector_perfil(w) for p, w in cargar_perfiles().items()}, "episodios": EPISODIOS, "semilla": SEMILLA, "modo": MODO, "agentes": AGENTES,
           "fecha": time.strftime("%Y-%m-%d %H:%M"), "prueba_simulador": res, "prueba_equipos": eqs}, open(SALIDA, "w"))

# Comprobación: la inferencia con numpy (la del ejecutor) da lo mismo que torch
def con_numpy(o, pol=json.load(open(SALIDA))):
    x = np.asarray(o, dtype=np.float64)
    for i, c in enumerate(pol["capas"]):
        x = np.array(c["w"]) @ x + np.array(c["b"])
        if i < len(pol["capas"]) - 1: x = np.maximum(x, 0)
    return int(x.argmax())
env, coinciden = MundoHabilidades(semilla=5, pacifico=False, cal=CAL), 0
o = env.reset()
for k in range(300):
    coinciden += con_numpy(o) == politica_red(o)
    o, _, hecho, _ = env.step(random.randrange(NA))
    if hecho:
        env.poner_perfil(PERFILES[k % len(PERFILES)]); o = env.reset()
print(f"coincidencia numpy/torch: {coinciden}/300 · guardada en {SALIDA.name} · {time.time() - t0:.0f} s")
