#!/usr/bin/env python3
"""Compara políticas de habilidades con la prueba final del simulador de entrenar_habilidades.py (300 mundos por perfil y modo,
semillas 100 000+k; equipos de 2 y 3, semillas 200 000+k), todas en los mismos mundos y con la inferencia del ejecutor (float64).
La primera es la referencia (la que está en uso). Para cada una: red − guion por fila, y para las demás, nueva − referencia por fila
con su intervalo del 95 % y en total (suma de las filas en cada mundo).
Criterio («iguala o supera», fijado antes de mirar): (1) en total, nueva − referencia no es peor de forma significativa (el
intervalo del 95 % llega a 0 o por encima), por perfiles y por equipos; (2) ninguna fila es peor de forma significativa con la
corrección por comparar 18 filas (|z| > 3); (3) la fidelidad al guion y el % junto al jugador del cooperativo no bajan más de
2 puntos. «Supera» si además el total es mejor de forma significativa.
Uso: comparar_politicas.py [nombre=]ruta.json … (la primera, la referencia)   Entorno: PRUEBA_N=300, EVALUADORES=12, SALIDA=
comparacion_politicas.json, y BASE_PERFILES=100000 BASE_EQUIPOS=200000 (otras semillas para confirmar una elección en mundos nuevos)."""
import os

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
import json
import multiprocessing as mp
import sys
import time
from pathlib import Path

import numpy as np

from entorno_habilidades import HABILIDADES, OBS, cargar_perfiles
from entrenar_habilidades_rapido import EQUIPOS, dif_ic, evaluar_async, evaluar_equipos_async, texto, texto_equipos, uso_async
from red_numpy import de_json

AQUI = Path(__file__).parent


def main():
    politicas = {}
    for arg in sys.argv[1:]:
        nombre, _, ruta = arg.rpartition("=")
        ruta = Path(ruta) if Path(ruta).is_absolute() else AQUI / ruta
        pol = json.loads(ruta.read_text())
        assert pol["acciones"] == HABILIDADES and pol["obs"] == OBS, f"{ruta.name} no es de este entorno"
        politicas[nombre or ruta.stem] = ("red", de_json(pol["capas"], np.float64))
    if len(politicas) < 2:
        sys.exit(__doc__)
    n = int(os.environ.get("PRUEBA_N", 300))
    base_p, base_e = int(os.environ.get("BASE_PERFILES", 100_000)), int(os.environ.get("BASE_EQUIPOS", 200_000))
    t0 = time.time()
    pool = mp.get_context("spawn").Pool(int(os.environ.get("EVALUADORES", 12)))
    descs = {**politicas, "guion": ("guion",), "solo": ("solo",)}
    pend = {k: evaluar_async(pool, d, n, base_p) for k, d in descs.items() if k != "solo"}
    pend_eq = {k: evaluar_equipos_async(pool, d, n, base_e) for k, d in descs.items()}
    pend_uso = {k: uso_async(pool, d) for k, d in politicas.items()}
    res = {k: f() for k, f in pend.items()}
    eqs = {k: f() for k, f in pend_eq.items()}
    usos = {k: f() for k, f in pend_uso.items()}
    pool.close(); pool.join()
    perfiles = list(cargar_perfiles())
    modos = ("pacifico", "amenazas")
    filas_p = [(p, m) for p in perfiles for m in modos]
    filas_e = [("+".join(e), m) for e in EQUIPOS for m in modos]

    for k in list(politicas) + ["guion"]:
        print(f"PRUEBA {k}\n{texto(res[k], '  ')}\n{texto_equipos(eqs[k], '  ')}")
    resumen = {"n": n, "bases": [base_p, base_e], "fecha": time.strftime("%Y-%m-%d %H:%M"), "politicas": {}}
    ref = next(iter(politicas))
    for k in politicas:
        fid = {p: round(100 * igual / total, 1) for p, _, igual, total in usos[k]}
        r = resumen["politicas"][k] = {
            "nota": round(sum(res[k][p][m]["recompensa"] for p, m in filas_p) + sum(sum(eqs[k][e][m]["recompensa"]) for e, m in filas_e), 2),
            "fidelidad_guion": {"+".join(p) if isinstance(p, tuple) else p: v for p, v in fid.items()},
            "junto_cooperativo": {m: res[k]["cooperativo"][m]["junto"] for m in modos},
            "red_menos_guion": {f"{p} {m}": [round(x, 3) for x in (*dif_ic(res[k][p][m]["_troncos"], res["guion"][p][m]["_troncos"]),
                                                                 *dif_ic(res[k][p][m]["_R"], res["guion"][p][m]["_R"]))] for p, m in filas_p},
            "equipo_menos_guion": {f"{e} {m}": [round(x, 3) for x in dif_ic(eqs[k][e][m]["_troncos"], eqs["guion"][e][m]["_troncos"])]
                                   for e, m in filas_e}}
        print(f"\n== {k}: nota {r['nota']:.1f} · fidelidad al guion " + ", ".join(f"{p} {v:.1f} %" for p, v in r["fidelidad_guion"].items()))
        print("red − guion (troncos | recompensa): " + " · ".join(
            f"{f} {v[0]:+.2f} ± {v[1]:.2f} | R {v[2]:+.2f} ± {v[3]:.2f}" for f, v in r["red_menos_guion"].items()))
        print("equipo − guion (troncos del equipo): " + " · ".join(f"{f} {v[0]:+.2f} ± {v[1]:.2f}" for f, v in r["equipo_menos_guion"].items()))
        if k == ref:
            continue
        # nueva − referencia en los mismos mundos: por fila (recompensa) y en total (suma de las filas de cada mundo)
        por_fila = {}
        for p, m in filas_p:
            d = np.array(res[k][p][m]["_R"]) - np.array(res[ref][p][m]["_R"])
            por_fila[f"{p} {m}"] = d
        for e, m in filas_e:
            por_fila[f"{e} {m}"] = np.array(eqs[k][e][m]["_R"]) - np.array(eqs[ref][e][m]["_R"])
        z = {f: (d.mean() / (d.std() / np.sqrt(len(d))) if d.std() > 0 else 0.0) for f, d in por_fila.items()}
        tot_p = sum(por_fila[f"{p} {m}"] for p, m in filas_p)
        tot_e = sum(por_fila[f"{e} {m}"] for e, m in filas_e)
        (mp_, ip), (me, ie) = dif_ic(tot_p, 0), dif_ic(tot_e, 0)
        peores = [f for f, v in z.items() if v < -3]
        fid_ref = resumen["politicas"][ref]["fidelidad_guion"]
        bajan = [p for p, v in r["fidelidad_guion"].items() if v < fid_ref[p] - 2]
        junto_baja = [m for m in modos if r["junto_cooperativo"][m] < resumen["politicas"][ref]["junto_cooperativo"][m] - 0.02]
        iguala = mp_ + ip >= 0 and me + ie >= 0 and not peores and not bajan and not junto_baja
        supera = iguala and (mp_ - ip > 0 or me - ie > 0)
        r["frente_a_referencia"] = {"referencia": ref, "total_perfiles_R": [round(mp_, 3), round(ip, 3)],
                                    "total_equipos_R": [round(me, 3), round(ie, 3)],
                                    "por_fila_R": {f: [round(float(d.mean()), 3), round(float(1.96 * d.std() / np.sqrt(len(d))), 3)]
                                                   for f, d in por_fila.items()},
                                    "filas_peores_z3": peores, "fidelidad_baja": bajan, "junto_cooperativo_baja": junto_baja,
                                    "veredicto": "supera" if supera else "iguala" if iguala else "no iguala"}
        print(f"{k} − {ref} (recompensa, mismos mundos): perfiles {mp_:+.2f} ± {ip:.2f} · equipos {me:+.2f} ± {ie:.2f} · por fila: " +
              " · ".join(f"{f} {d.mean():+.2f} ± {1.96 * d.std() / np.sqrt(len(d)):.2f}" for f, d in por_fila.items()))
        print(f"filas peores (z < −3): {peores or 'ninguna'} · fidelidad que baja > 2 puntos: {bajan or 'ninguna'} · junto del "
              f"cooperativo que baja > 2 puntos: {junto_baja or 'no'} → {r['frente_a_referencia']['veredicto'].upper()}")
    salida = AQUI / os.environ.get("SALIDA", "comparacion_politicas.json")
    json.dump(resumen, open(salida, "w"), ensure_ascii=False, indent=1)
    print(f"\nguardada en {salida.name} · {time.time() - t0:.0f} s")


if __name__ == "__main__":
    main()
