#!/usr/bin/env python3
"""¿Colocar falla a ratos en el mundo 26.3 por ViaProxy? (abierto el 2026-11-01, planes/asistente/TRAMPAS.md)
En una plataforma de arena.py, `--rondas` veces: Oqva va a un trozo nuevo, pone tierra a su lado dos veces y, cada 5 rondas,
una mesa. Cada puesto se comprueba por RCON (así se ven también los fantasma: el bot cree que está y el server no).
Los fallos se imprimen con sus `intentos` (colocar.js: apoyo, mano, distancia de los ojos, error, quién pisa la casilla).
Para el detalle de cada intento, arranca el bot con IO_DEPURAR_COLOCAR=si.
Uso: python entrenamiento/prueba_colocar.py [--rondas 10] [--puerto 3011] [--mundo usuario]"""
import argparse, json, sys

from arena import RAIZ, Mundo, Sesion, guardar


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--rondas", type=int, default=10)
    ap.add_argument("--puerto", type=int, default=3001)
    ap.add_argument("--mundo", default="usuario")
    a = ap.parse_args()
    m = Mundo(a.mundo, puerto=a.puerto)
    if not m.esperar_conectado():
        print(f"{m.personaje} no está en el servidor {a.mundo}")
        return 1
    bien = fantasmas = fallos = 0
    from mundo import propio  # 2026-11-02: los datos de cada persona, en su copia «.local»
    with Sesion(m, ficheros=[propio(RAIZ / "mundos" / a.mundo / "obras.json")]) as s:
        s.suelo_firme()
        s.plataforma(lado=31)
        m.r(f"clear {m.personaje}")
        m.dar("dirt 64", "crafting_table 4")
        for i in range(a.rondas):
            s.en(-12 + (i % 5) * 6, -12 + (i // 5) * 6)
            cosas = ["dirt", "dirt"] + (["crafting_table"] if i % 5 == 4 else [])
            for item in cosas:
                q = m.hab(f"poner {item}")
                p = q.get("pos")
                real = bool(p) and "passed" in m.r(f"execute if block {p[0]} {p[1]} {p[2]} minecraft:{item}")
                if q.get("exito") and real:
                    bien += 1
                    continue
                if q.get("exito"):
                    fantasmas += 1
                else:
                    fallos += 1
                print(f"ronda {i} {item}: {'FANTASMA' if q.get('exito') else 'FALLO'} {json.dumps(q, ensure_ascii=False)}", flush=True)
        total = bien + fantasmas + fallos
        s.anota("colocar", bien == total, f"{bien}/{total} puestos; {fantasmas} fantasmas; {fallos} fallos")
    guardar(s.datos("colocar-26-3", "colocar en 26.3 por ViaProxy", "minecraft 26.3"), nota=False)
    return 0 if bien == total else 2


if __name__ == "__main__":
    sys.exit(main())
