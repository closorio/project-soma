"""Banco del rodeo (2026-10-31): ¿anda el bot por algo que no sea llano y recto? Tres carriles en una plataforma de arena.py:
llano, un escalón de 1 bloque y un muro de 5×2 que obliga a rodear. En cada uno, `ir` a la meta (≤ 30 s) y cuántas veces el
server lo recolocó (`[mov]` de bot/io.js). Sirve para separar el server Paper del compañero (donde no avanza) del proxy y de
nuestro código: se pasa en `local` (26.1.2 directo) y en `usuario` (26.3 vanilla por ViaProxy).
Uso: make bench-detour WORLD=local|usuario [PORT=3001]   (el bot ya conectado en ese mundo)
"""
import argparse, math, re, sys, time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from arena import RAIZ, Mundo, Sesion  # noqa: E402

TOTAL = re.compile(r"\((\d+) en total\)")


def recolocado(log):
    """Cuántas veces lleva el server recolocando al bot (la última cuenta del registro)."""
    if not log.exists():
        return 0
    t = TOTAL.findall(log.read_text(encoding="utf-8", errors="replace")[-200000:])
    return int(t[-1]) if t else 0


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mundo", default="local", choices=("local", "usuario", "paper"))
    ap.add_argument("--puerto", type=int, default=3001)
    a = ap.parse_args()
    m = Mundo(a.mundo, "Soma", a.puerto)
    log = RAIZ / "servidor-supervivencia" / "logs" / f"bots-{a.mundo}.log"
    if not m.esperar_conectado(20):
        print(f"Soma no está en {a.mundo}: arranca el server y make bots WORLD={a.mundo} BOTS=Soma MODE=ordenes")
        return 1
    # la plataforma está en el cielo: «apartarse (caída)» saltaría en cada borde y una vez lo tiró desde y=200
    m.orden("reflejos no", 10)
    with Sesion(m) as s:
        s.plataforma()
        bx, y, bz = s.base[0], s.y, s.base[2]
        # carril del escalón (x = bx): de z = bz-2 en adelante el suelo sube 1
        m.r(f"fill {bx - 2} {y} {bz - 2} {bx + 2} {y} {bz + 4} grass_block")
        # carril del muro (x = bx+6): muro de 5×2 en z = bz-3, de x+4 a x+8; hay que rodearlo por x+3 o x+9
        m.r(f"fill {bx + 4} {y} {bz - 3} {bx + 8} {y + 1} {bz - 3} stone")
        # muro de lado a lado en z = bz+6 con una puerta de roble cerrada en x = bx: solo se pasa abriéndola (bot/puertas.js)
        m.r(f"fill {bx - 10} {y} {bz + 6} {bx + 10} {y + 2} {bz + 6} stone")
        m.r(f"setblock {bx} {y} {bz + 6} oak_door[half=lower,facing=south,open=false]")
        m.r(f"setblock {bx} {y + 1} {bz + 6} oak_door[half=upper,facing=south,open=false]")
        casos = [("llano", (-6, -8), (-6, 2, y)), ("escalón de 1", (0, -8), (0, 2, y + 1)), ("rodear un muro", (6, -8), (6, 2, y)),
                 ("cruzar una puerta", (-3, 3), (0, 9, y))]
        for nombre, (dx, dz), (tx, tz, ty) in casos:
            m.orden("para", 10)
            s.en(dx, dz)
            antes = recolocado(log)
            meta = (bx + tx, ty, bz + tz)
            r = m.orden("ir %d %d %d" % meta, 30)
            m.orden("para", 10)
            p = m.pos()
            d = math.dist((p[0], p[2]), (meta[0] + 0.5, meta[2] + 0.5)) if p else 99
            n = recolocado(log) - antes
            s.anota(nombre, d <= 2.5, f"a {d:.1f} de la meta · recolocado {n} veces · {r[:60]}")
    m.orden("reflejos si", 10)
    pasan = sum(p["pasa"] for p in s.pruebas)
    print(f"rodeo en {a.mundo}: {pasan}/{len(s.pruebas)}")
    return 0 if pasan == len(s.pruebas) else 1


if __name__ == "__main__":
    sys.exit(main())
