#!/usr/bin/env python3
"""Compara series de medir_ejecutor.py (ejecuciones/serie-*.medido.json) por personaje (fase D): troncos por episodio, éxito de ir
al árbol (con ir_a_otro_arbol) y de picar, conflictos (ir al árbol objetivo de otro) y, frente a la primera serie (la referencia,
p. ej. un personaje solo), la proporción de troncos punto a punto (troncos del personaje / troncos de la referencia en ese punto).
Uso: comparar_series.py REFERENCIA.medido.json OTRA.medido.json …"""
import json, math, sys
from collections import defaultdict

import numpy as np


def leer(ruta):
    d = json.load(open(ruta))
    return d, d["episodios"]


def main():
    rutas = sys.argv[1:]
    if not rutas:
        sys.exit(__doc__)
    _, ref = leer(rutas[0])
    base = defaultdict(list)  # punto → troncos de la referencia (media si hay varios personajes)
    for e in ref:
        base[tuple(e["punto"])].append(e["troncos"] or 0)
    base = {p: float(np.mean(v)) for p, v in base.items()}
    for ruta in rutas:
        d, eps = leer(ruta)
        print(f"{ruta.split('/')[-1]} · {d['fecha']} · {d['N']} puntos × {d['segundos']:.0f} s · "
              f"{'a la vez: ' if d.get('a_la_vez') else ''}{', '.join(p['nombre'] + ':' + str(p.get('perfil') or p.get('perfil0')) for p in d.get('equipo', []))}")
        por = defaultdict(list)
        for e in eps:
            por[(e["variante"], e.get("nombre", "Io"))].append(e)
        for (var, nombre), es in por.items():
            t = [e["troncos"] or 0 for e in es]
            ex = lambda habs, i: sum(e.get("exitos", {}).get(h, [0, 0])[i] for e in es for h in habs)
            arbol = (ex(("ir_a_arbol", "ir_a_otro_arbol"), 0), ex(("ir_a_arbol", "ir_a_otro_arbol"), 1))
            picar = (ex(("picar_tronco",), 0), ex(("picar_tronco",), 1))
            r = [(e["troncos"] or 0) / base[tuple(e["punto"])] for e in es if base.get(tuple(e["punto"]))]
            ci = 1.96 * np.std(t, ddof=1) / math.sqrt(len(t)) if len(t) > 1 else float("nan")
            print(f"  {var}/{nombre:5s} troncos {np.mean(t):5.1f} ± {ci:4.1f} {t} · ir al árbol {arbol[0]}/{arbol[1]} · picar "
                  f"{picar[0]}/{picar[1]} ({100 * picar[0] / max(picar[1], 1):.0f} %) · conflictos {sum(e.get('conflictos', 0) for e in es)} · "
                  f"otro árbol {sum(e.get('uso', {}).get('ir_a_otro_arbol', 0) for e in es)} · "
                  f"junto al jugador {100 * np.mean([e.get('junto') or 0 for e in es]):.0f} % · "
                  f"frente a la referencia {100 * np.mean(r):.0f} % (punto a punto: {', '.join(f'{100 * x:.0f}' for x in r)})")


if __name__ == "__main__":
    main()
