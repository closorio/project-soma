#!/usr/bin/env python3
"""Banco de respirar (bot/respirar.js, 2026-11-03, tras el humo del banco M): un bot bajo el agua, con pico de piedra, sin monstruos y
con el servidor ya en marcha, en recintos de piedra en el cielo. «aire»: túnel inundado de 2 de alto, con el aire a 6 bloques por el
agua y 2 de roca encima de la cabeza (lo que pasó en el humo). «techo»: cuarto sellado con 1 de roca encima y el cielo detrás.
Criterio fijado antes de medir: vivo y con la cabeza fuera, 3/3 en cada caso. Cabeza fuera = el aire del server (Air, 0-300) sube de
≤ 200 a ≥ 280: solo se recupera respirando («anchored eyes if block» daba agua aunque respirara). Escribe logs/respirar-AAAAMMDD-HHMM.json.
Uso: probar_respirar.py [--n 3] [--nombre Prueba1] [--puerto 3101]"""
import argparse, json, os, re, signal, subprocess, sys, time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from probar_explorar import r, orden, MUNDO_SV  # noqa: E402

X, Y, Z = 2000, 150, 2000  # en el cielo: nada alrededor
ESPERA = 60


def recinto(caso):
    r(f"fill {X - 9} {Y - 2} {Z - 4} {X + 9} {Y + 8} {Z + 4} minecraft:air")
    if caso == "aire":
        r(f"fill {X - 8} {Y - 1} {Z - 3} {X + 8} {Y + 3} {Z + 3} minecraft:stone")
        r(f"fill {X - 2} {Y} {Z} {X + 5} {Y + 1} {Z} minecraft:water")
        r(f"fill {X + 5} {Y + 2} {Z} {X + 5} {Y + 3} {Z} minecraft:air")  # el aire, sobre el final del túnel
    else:
        r(f"fill {X - 2} {Y - 1} {Z - 2} {X + 2} {Y + 2} {Z + 2} minecraft:stone")
        r(f"fill {X - 1} {Y} {Z - 1} {X + 1} {Y + 1} {Z + 1} minecraft:water")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=3)
    ap.add_argument("--nombre", default="Prueba1")
    ap.add_argument("--puerto", type=int, default=3101)
    a = ap.parse_args()
    n = a.nombre
    try:
        r("list")
    except OSError:
        sys.exit(f"el servidor de {MUNDO_SV} no responde por RCON: arráncalo")
    monstruos = re.search(r"set to: (\w+)", r("gamerule spawn_monsters"))
    r("gamerule spawn_monsters false")
    r("scoreboard objectives add banco_muertes deathCount")
    r(f"forceload add {X - 9} {Z - 4} {X + 9} {Z + 4}")
    log = open(AQUI / "logs" / f"bot-{n}-respirar.log", "w")
    bot = subprocess.Popen(["node", "io.js", f"{n}:{a.puerto}"], cwd=AQUI.parent / "bot", stdout=log, stderr=subprocess.STDOUT,
                           env={**os.environ, "IO_SERVIDOR": MUNDO_SV}, start_new_session=True)
    res = {"aire": [], "techo": []}
    try:
        for _ in range(60):
            if orden(a.puerto, "estado", 5).startswith("pos "):
                break
            time.sleep(1)
        else:
            raise SystemExit("el bot no se conectó en 60 s")
        r(f"scoreboard players set {n} banco_muertes 0")
        for caso in res:
            for _ in range(a.n):
                orden(a.puerto, "para")
                r(f"effect give {n} minecraft:instant_health 1 10 true")
                r(f"effect give {n} minecraft:saturation 5 20 true")
                r(f"clear {n}")
                r(f"give {n} minecraft:stone_pickaxe")
                recinto(caso)
                r(f"tp {n} {X + 0.5} {Y} {Z + 0.5}")
                muertes0 = re.search(r"has (\d+) \[", r(f"scoreboard players get {n} banco_muertes"))
                t0, fuera, bajo = time.time(), None, False
                while time.time() - t0 < ESPERA:
                    time.sleep(1)
                    m = re.search(r"has (\d+) \[", r(f"scoreboard players get {n} banco_muertes"))
                    if m and muertes0 and m[1] != muertes0[1]:
                        fuera = False
                        break
                    aire = re.search(r"(-?\d+)s$", r(f"data get entity {n} Air").strip())
                    bajo = bajo or bool(aire and int(aire[1]) <= 200)
                    if bajo and aire and int(aire[1]) >= 280:
                        fuera = True
                        break
                ok = fuera is True
                res[caso].append({"ok": ok, "murio": fuera is False, "s": round(time.time() - t0, 1)})
                print(f"  {caso:6} {'BIEN ' if ok else 'FALLO'}{' · MUERTO' if fuera is False else ''} ({res[caso][-1]['s']} s)", flush=True)
                time.sleep(6)  # que reaparezca, si murió
    finally:
        try:
            os.killpg(bot.pid, signal.SIGTERM)
            bot.wait(15)
        except Exception:
            pass
        r(f"fill {X - 9} {Y - 2} {Z - 4} {X + 9} {Y + 8} {Z + 4} minecraft:air")
        r(f"forceload remove {X - 9} {Z - 4} {X + 9} {Z + 4}")
        if monstruos:
            r(f"gamerule spawn_monsters {monstruos[1]}")
        salida = AQUI / "logs" / f"respirar-{time.strftime('%Y%m%d-%H%M')}.json"
        salida.write_text(json.dumps({"fecha": time.strftime("%Y-%m-%d %H:%M"), "mundo": MUNDO_SV, "pruebas": res}, ensure_ascii=False, indent=1) + "\n")
        for c, v in res.items():
            print(f"{c:6} {sum(x['ok'] for x in v)}/{len(v)} (criterio 3/3)", flush=True)
        print("FIN", salida, flush=True)


if __name__ == "__main__":
    main()
