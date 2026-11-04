#!/usr/bin/env python3
"""Banco de subir sobre agua y del horno compartido (2026-11-04, tras el banco M), con el servidor ya en marcha y sin monstruos, en
recintos en el cielo. «lago»: bot sobre una columna, justo encima de un estanque, sin orilla cerca, y `subir_a_superficie` (M3 subió en pilar
hasta y≈318). «techo»: lo mismo con un bloque 3 por encima de la cabeza, que tapa el cielo. «horno»: dos bots con un solo horno, uno funde hierro y, 10 s después, el otro cobre (M4 se llevó el hierro de M2).
Criterio fijado antes de medir, 3/3 en cada caso: «lago» y «techo», a ≤ 8 bloques sobre el agua al acabar; «horno», cada bot con sus 6 entre
crudo y lingotes y nada del otro. Escribe logs/subir-horno-AAAAMMDD-HHMM.json. Uso: probar_subir_y_horno.py [--n 3] [--solo lago,techo,horno]"""
import argparse, json, os, re, signal, subprocess, sys, threading, time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from probar_explorar import r, orden, MUNDO_SV  # noqa: E402

X, Y, Z = 2000, 150, 2000  # en el cielo: nada alrededor
ALTO = 48
BOTS = [("Prueba1", 3101), ("Prueba2", 3102)]
N_HORNO = 6
FUNDE = {"Prueba1": ("hierro", "raw_iron", "iron_ingot"), "Prueba2": ("cobre", "raw_copper", "copper_ingot")}


def limpiar():
    r(f"fill {X - 7} {Y - 2} {Z - 7} {X + 7} {Y + ALTO} {Z + 7} minecraft:air")


def contar(n, *items):
    total = 0
    for it in items:
        m = re.search(r"Found (\d+) matching", r(f"clear {n} minecraft:{it} 0"))
        total += int(m[1]) if m else 0
    return total


def preparar(n, *kit):
    orden(dict(BOTS)[n], "para")
    r(f"effect give {n} minecraft:instant_health 1 10 true")
    r(f"effect give {n} minecraft:saturation 5 20 true")
    r(f"clear {n}")
    for g in kit:
        r(f"give {n} minecraft:{g}")


def lago(techo=False):
    n, puerto = BOTS[0]
    preparar(n, "stone_pickaxe", "cobblestone 64", "cobblestone 64")
    limpiar()
    r(f"fill {X - 6} {Y - 1} {Z - 6} {X + 6} {Y + 1} {Z + 6} minecraft:stone")
    r(f"fill {X - 5} {Y} {Z - 5} {X + 5} {Y + 1} {Z + 5} minecraft:water")
    # con los pies en el agua no sube (el pilar falla al instante): sobre una columna, justo encima del agua, con aire a los lados
    r(f"fill {X} {Y} {Z} {X} {Y + 1} {Z} minecraft:stone")
    if techo:  # sin cielo al empezar: tiene que subir de verdad, picar el techo y parar al salir, sin suelo al lado (el tubo no: su borde es suelo)
        r(f"setblock {X} {Y + 5} {Z} minecraft:stone")
    r(f"tp {n} {X + 0.5} {Y + 2} {Z + 0.5}")
    time.sleep(3)
    t0 = time.time()
    txt = orden(puerto, "subir_a_superficie", 120)
    m = re.search(r"Pos: \[[-0-9.]+d, ([-0-9.]+)d", r(f"data get entity {n}"))
    y = float(m[1]) if m else None
    sobre = round(y - (Y + 2), 1) if y is not None else None
    return {"ok": sobre is not None and sobre <= 8, "sobre_el_agua": sobre, "respuesta": txt[:160], "s": round(time.time() - t0, 1)}


def horno():
    preparar(BOTS[0][0], f"raw_iron {N_HORNO}", "coal 4", "furnace")
    preparar(BOTS[1][0], f"raw_copper {N_HORNO}", "coal 4", "furnace")
    limpiar()
    r(f"fill {X - 6} {Y - 1} {Z - 6} {X + 6} {Y - 1} {Z + 6} minecraft:stone")
    r(f"setblock {X} {Y} {Z} minecraft:furnace")
    r(f"tp {BOTS[0][0]} {X - 1.5} {Y} {Z + 0.5}")
    r(f"tp {BOTS[1][0]} {X + 2.5} {Y} {Z + 0.5}")
    time.sleep(3)
    t0, res = time.time(), {}

    def fundir(n, puerto, pausa):
        time.sleep(pausa)
        res[n] = orden(puerto, f"fundir {FUNDE[n][0]} {N_HORNO}", 150)
    hilos = [threading.Thread(target=fundir, args=(n, p, 10 * i)) for i, (n, p) in enumerate(BOTS)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    d = {}
    for n, _ in BOTS:
        otro = next(o for o, _ in BOTS if o != n)
        d[n] = {"suyo": contar(n, *FUNDE[n][1:]), "lingotes": contar(n, FUNDE[n][2]), "ajeno": contar(n, *FUNDE[otro][1:]), "respuesta": res.get(n, "")[:120]}
    return {"ok": all(v["suyo"] == N_HORNO and v["ajeno"] == 0 for v in d.values()), **d, "s": round(time.time() - t0, 1)}


CASOS = {"lago": lago, "techo": lambda: lago(True), "horno": horno}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=3)
    ap.add_argument("--solo", default=",".join(CASOS))
    a = ap.parse_args()
    try:
        r("list")
    except OSError:
        sys.exit(f"el servidor de {MUNDO_SV} no responde por RCON: arráncalo")
    monstruos = re.search(r"set to: (\w+)", r("gamerule spawn_monsters"))
    r("gamerule spawn_monsters false")
    r("time set 1000")
    r("weather clear")
    r(f"forceload add {X - 7} {Z - 7} {X + 7} {Z + 7}")
    log = open(AQUI / "logs" / "bots-subir-horno.log", "w")
    env = {**os.environ, "IO_SERVIDOR": MUNDO_SV}
    bots = [subprocess.Popen(["node", "io.js", f"{n}:{p}"], cwd=AQUI.parent / "bot", stdout=log, stderr=subprocess.STDOUT, env=env, start_new_session=True) for n, p in BOTS]
    res = {c: [] for c in a.solo.split(",") if c}
    try:
        for _, p in BOTS:
            for _ in range(60):
                if orden(p, "estado", 5).startswith("pos "):
                    break
                time.sleep(1)
            else:
                raise SystemExit("un bot no se conectó en 60 s")
        for caso in res:
            for _ in range(a.n):
                fila = CASOS[caso]()
                res[caso].append(fila)
                print(f"  {caso:6} {'BIEN ' if fila['ok'] else 'FALLO'} {json.dumps(fila, ensure_ascii=False)[:300]}", flush=True)
    finally:
        for b in bots:
            try:
                os.killpg(b.pid, signal.SIGTERM)
                b.wait(15)
            except Exception:
                pass
        limpiar()
        r(f"forceload remove {X - 7} {Z - 7} {X + 7} {Z + 7}")
        if monstruos:
            r(f"gamerule spawn_monsters {monstruos[1]}")
        salida = AQUI / "logs" / f"subir-horno-{time.strftime('%Y%m%d-%H%M')}.json"
        salida.write_text(json.dumps({"fecha": time.strftime("%Y-%m-%d %H:%M"), "mundo": MUNDO_SV, "pruebas": res}, ensure_ascii=False, indent=1) + "\n")
        for c, v in res.items():
            print(f"{c:6} {sum(x['ok'] for x in v)}/{len(v)} (criterio 3/3)", flush=True)
        print("FIN", salida, flush=True)


if __name__ == "__main__":
    main()
