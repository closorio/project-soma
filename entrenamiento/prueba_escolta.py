#!/usr/bin/env python3
"""¿«defiende a X» es defensivo? (2026-11-01) Oqva escolta a Eco (otro personaje, quieto) en una plataforma de arena.py.
  1. Un husk con NoAI a 3 bloques de Eco (no ataca): Oqva no le pega en 15 s (sigue con la salud llena).
  2. Un husk normal junto a Eco: en cuanto le pega, Oqva lo mata en ≤ 40 s.
Eco lleva resistencia (no muere) y los dos van sin reflejos, para que Eco no se defienda solo: arranca los bots con
IO_REFLEJOS=no make bots WORLD=usuario BOTS="Oqva Eco" PORT=3011 MODE=ordenes BOT_DECIDER=guion
Uso: python entrenamiento/prueba_escolta.py [--puerto 3011]"""
import argparse, re, sys, time

from arena import Mundo, Sesion, guardar


def salud(m, etiqueta):
    """La salud del husk con esa etiqueta, o None si ya no está."""
    s = m.r(f"data get entity @e[type=husk,tag={etiqueta},limit=1] Health")
    x = re.search(r"([\d.]+)f", s)
    return float(x.group(1)) if x else None


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--puerto", type=int, default=3011)
    a = ap.parse_args()
    m, eco = Mundo("usuario", puerto=a.puerto), Mundo("usuario", personaje="Eco", puerto=a.puerto + 1)
    if not (m.esperar_conectado() and eco.esperar_conectado()):
        print("faltan Oqva o Eco en el servidor (ver la ayuda)")
        return 1
    with Sesion(m) as s:
        s.suelo_firme()
        s.plataforma(lado=21)
        bx, _, bz = s.base
        y = s.y
        m.r(f"clear {m.personaje}")
        m.dar("iron_sword")
        eco.tp(bx, y, bz)
        m.r("effect give Eco resistance 600 4 true")
        s.en(-4, 0)
        m.orden("orden defiende a Eco", 5)
        time.sleep(3)

        m.r("difficulty easy")  # en pacífico (Sesion) los hostiles desaparecen al invocarlos
        m.r(f"summon husk {bx + 3} {y} {bz} {{NoAI:1b,Tags:[\"quieto\"]}}")
        time.sleep(15)
        h = salud(m, "quieto")
        s.anota("no pega al que no ataca", h is not None and h >= 20, f"salud del husk quieto: {h}")
        m.r("kill @e[type=husk,tag=quieto]")

        m.r(f"summon husk {bx + 2} {y} {bz} {{Tags:[\"malo\"]}}")
        t0, h = time.time(), 20.0
        while time.time() - t0 < 40 and h is not None:
            time.sleep(2)
            h = salud(m, "malo")
        s.anota("mata al que ataca", h is None, f"husk {'muerto' if h is None else f'vivo ({h})'} a los {time.time() - t0:.0f} s")
        m.r("kill @e[type=husk]")
        m.orden("orden para", 5)
    guardar(s.datos("escolta", "defiende a X: solo a quien ataca", "minecraft 26.3"), nota=False)
    return 0 if all(p["pasa"] for p in s.pruebas) else 2


if __name__ == "__main__":
    sys.exit(main())
