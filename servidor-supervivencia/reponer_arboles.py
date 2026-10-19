#!/usr/bin/env python3
"""F7.6c · árboles junto a los 4 puntos de partida (mundos/supervivencia/mundo.json, «puntos»), con el servidor de supervivencia en
marcha. Tras F7.5-F7.6b no quedaba ningún árbol a ≤ 24 bloques de ningún punto (los bots los talaron noche a noche; en el bosque
intacto hay 30-55): la noche del perfil recolector no medía lo mismo en la primera ejecución que en la última.
Cada punto recibe los mismos 6 árboles (roble y abedul, los del bioma «forest»), a 6-14 bloques y en los mismos rumbos (ARBOLES), con
`place feature` por RCON; si el sitio no vale (agua, pendiente, otro árbol), prueba casillas cercanas. Lo plantado queda en
mundos/supervivencia/arboles.json (la base de cada tronco). Volver a lanzarlo antes de cada noche repone solo los que falten (sin
el tronco entero), en el mismo sitio si se puede o al lado: así todas las noches empiezan con el mismo arbolado.
Fuerza la carga de los trozos mientras trabaja (en 1.21.11 sin jugador cerca no hay nada cargado) y la quita al acabar.
Uso: python3 reponer_arboles.py   → «RESULTADO arboles: {"en_pie": …, "plantados": …, "fallos": …}»
"""
import json, math, re, sys, time
from pathlib import Path

import probar_noche as pn

r, OW = pn.r, pn.OW
ESTADO = pn.RAIZ / "mundos" / "supervivencia" / "arboles.json"
ARBOLES = [(6, 20, "oak"), (8, 95, "birch"), (10, 165, "oak"), (12, 235, "birch"), (14, 305, "oak"), (11, 340, "birch")]  # (radio, rumbo °, especie)
CERCA = [(2, 0), (0, 2), (-2, 0), (0, -2), (3, 3), (-3, 3), (3, -3), (-3, -3)]  # si el sitio no vale
LIBRE = 4  # ningún tronco a menos de 4 bloques de un punto o del campamento (que el bot aparezca sin un árbol encima)


def entero(base):
    """Tronco intacto: las 4 casillas de abajo (roble 4-6 de alto, abedul 5-7). Si un bot lo taló a medias o cavó en la base, se
    planta otro al lado (en la base queda el tocón y place feature no puede)."""
    return all("passed" in r(f"{OW} if block {base[0]} {base[1] + dy} {base[2]} #minecraft:logs") for dy in range(4))


def plantar(x, z, especie, prohibidos):
    for dx, dz in [(0, 0)] + CERCA:
        px, pz = x + dx, z + dz
        if any(math.hypot(px - a, pz - b) < LIBRE for a, b in prohibidos) or pn.liquido(px, pz):
            continue
        y = pn.altura(px, pz)
        if y is None:
            continue
        t = r(f"{OW} run place feature minecraft:{especie} {px} {y} {pz}")
        if "Placed" in t:
            return [px, y, pz]
    return None


def main():
    d = json.loads(pn.MUNDO.read_text())
    puntos, camp = d["puntos"], d["campamento"]
    prohibidos = [(p[0], p[2]) for p in puntos] + [(camp[0], camp[2])]
    estado = json.loads(ESTADO.read_text()) if ESTADO.exists() else {"arboles": []}
    previos = {(a["punto"], a["n"]): a for a in estado["arboles"]}
    xs, zs = [p[0] for p in puntos], [p[2] for p in puntos]
    caja = (min(xs) - 20, min(zs) - 20, max(xs) + 20, max(zs) + 20)
    r(f"{OW} run forceload add {caja[0]} {caja[1]} {caja[2]} {caja[3]}")
    time.sleep(3)  # que carguen
    en_pie = plantados = 0
    fallos, arboles = [], []
    try:
        for i, p in enumerate(puntos):
            for n, (radio, rumbo, especie) in enumerate(ARBOLES):
                previo = previos.get((i, n))
                if previo and entero(previo["base"]):
                    en_pie += 1
                    arboles.append(previo)
                    continue
                x0, z0 = (previo["base"][0], previo["base"][2]) if previo else \
                    (round(p[0] + radio * math.cos(math.radians(rumbo))), round(p[2] + radio * math.sin(math.radians(rumbo))))
                base = plantar(x0, z0, especie, prohibidos)
                if base:
                    plantados += 1
                    arboles.append({"punto": i, "n": n, "especie": especie, "base": base})
                else:
                    fallos.append([i, n, x0, z0])
                    if previo:
                        arboles.append(previo)
    finally:
        r(f"{OW} run forceload remove {caja[0]} {caja[1]} {caja[2]} {caja[3]}")
    ESTADO.write_text(json.dumps({"nota": "F7.6c: 6 árboles por punto de partida (servidor-supervivencia/reponer_arboles.py); "
                                          "base = casilla del tronco más bajo", "fecha": time.strftime("%Y-%m-%d %H:%M:%S"),
                                  "arboles": arboles}, ensure_ascii=False, indent=1))
    print("RESULTADO arboles: " + json.dumps({"en_pie": en_pie, "plantados": plantados, "fallos": fallos}))
    return 1 if fallos else 0


if __name__ == "__main__":
    sys.exit(main())
