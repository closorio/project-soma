#!/usr/bin/env python3
"""Banco de recuperar lo suyo tras morir (2026-11-04, tras el banco M y el humo con muerte forzada). Con el servidor ya en marcha y sin
monstruos, en una pasarela en el cielo: el bot lleva 32 de hierro crudo y nada más (sin pico) y muere a 40 bloques de donde reaparece.
«golpe»: en el suelo, y de camino le pega un zombi quieto (M4 perdió 477 objetos). «pozo»: al fondo de un pozo de 1×1 y 8 de hondo, como
los que cava ir_a_mena (el humo se quedó fuera y acabó en un bucle de respirar). «charco»: al fondo de 6 de agua. «sellado»: en una cámara
cerrada bajo 5 de agua, a la que no se llega sin pico.
Criterio fijado antes de medir, 3/3 por caso: «golpe», «pozo» y «charco», los 32 de vuelta en ≤ 90 s, sin morir otra vez y sin abandonar la
agenda; «sellado», que lo resuelva (recupera o se rinde) en ≤ 150 s, no a los 5 min de que caduquen los objetos, y sin morir otra vez.
Escribe logs/recuperar-AAAAMMDD-HHMM.json. Uso: probar_recuperar.py [--n 3] [--solo golpe,pozo,charco,sellado] [--nombre Prueba1] [--puerto 3101]"""
import argparse, json, os, re, signal, subprocess, sys, time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from probar_explorar import r, orden, MUNDO_SV  # noqa: E402

X, Y, Z = 2000, 150, 2000  # en el cielo: nada alrededor
LEJOS = 40
ESPERA = 90
ANCHO = 12  # con 4, el reflejo de caída se disparaba en los bordes tras la pelea (el suelo de verdad no tiene bordes)
HONDO = 12
PASARELA = f"{X - ANCHO} {Y - HONDO} {Z - ANCHO} {X + LEJOS + ANCHO} {Y + 2} {Z + ANCHO}"
ESPERAS = {"golpe": 90, "pozo": 90, "charco": 90, "sellado": 150}


def hierro(n):
    m = re.search(r"Found (\d+) matching", r(f"clear {n} minecraft:raw_iron 0"))
    return int(m[1]) if m else 0


def vida(n):
    m = re.search(r"data: ([0-9.]+)f", r(f"data get entity {n} Health"))
    return float(m[1]) if m else 0


def muertes(n):
    m = re.search(r"has (\d+) \[", r(f"scoreboard players get {n} banco_muertes"))
    return int(m[1]) if m else 0


def sitio(caso):
    """Monta el sitio de la muerte y devuelve la altura de los pies del bot al morir."""
    c = X + LEJOS
    r(f"fill {PASARELA} minecraft:air")
    r(f"fill {X - ANCHO} {Y - 1} {Z - ANCHO} {X + LEJOS + ANCHO} {Y - 1} {Z + ANCHO} minecraft:stone")
    if caso == "golpe":
        return Y
    r(f"fill {c - 6} {Y - HONDO} {Z - 6} {c + 6} {Y - 1} {Z + 6} minecraft:stone")
    if caso == "pozo":
        r(f"fill {c} {Y - 8} {Z} {c} {Y - 1} {Z} minecraft:air")
        return Y - 8
    if caso == "charco":
        r(f"fill {c - 2} {Y - 6} {Z - 2} {c + 2} {Y - 1} {Z + 2} minecraft:water")
        return Y - 6
    r(f"fill {c - 2} {Y - 5} {Z - 2} {c + 2} {Y - 1} {Z + 2} minecraft:water")
    r(f"fill {c} {Y - 9} {Z} {c} {Y - 8} {Z} minecraft:air")
    return Y - 9


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--n", type=int, default=3)
    ap.add_argument("--solo", default="golpe,pozo,charco,sellado")
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
    r("time set 1000")
    r("weather clear")
    r("scoreboard objectives add banco_muertes deathCount")
    r(f"forceload add {X - ANCHO} {Z - ANCHO} {X + LEJOS + ANCHO} {Z + ANCHO}")
    ruta = AQUI / "logs" / f"bot-{n}-recuperar.log"
    log = open(ruta, "w")
    bot = subprocess.Popen(["node", "io.js", f"{n}:{a.puerto}"], cwd=AQUI.parent / "bot", stdout=log, stderr=subprocess.STDOUT,
                           env={**os.environ, "IO_SERVIDOR": MUNDO_SV}, start_new_session=True)
    res = {}
    try:
        for _ in range(60):
            if orden(a.puerto, "estado", 5).startswith("pos "):
                break
            time.sleep(1)
        else:
            raise SystemExit("el bot no se conectó en 60 s")
        orden(a.puerto, "reflejos si")
        r(f"scoreboard players set {n} banco_muertes 0")
        r(f"spawnpoint {n} {X} {Y} {Z}")
        for caso in [c for c in a.solo.split(",") if c]:
            res[caso] = []
            for _ in range(a.n):
                orden(a.puerto, "para")
                r("kill @e[type=minecraft:item]")
                r("kill @e[type=minecraft:zombie]")
                y = sitio(caso)
                if caso == "golpe":
                    r(f"summon minecraft:zombie {X + 6} {Y} {Z + 2} {{NoAI:1b,PersistenceRequired:1b}}")
                r(f"effect give {n} minecraft:instant_health 1 10 true")
                r(f"clear {n}")
                r(f"give {n} minecraft:raw_iron 32")
                r(f"tp {n} {X + LEJOS + 0.5} {y} {Z + 0.5}")
                time.sleep(3)
                muertes0 = muertes(n)
                log.flush()
                antes = ruta.read_text().count("Dejo «recuperar mis cosas»")
                inicio = len(ruta.read_text())
                r(f"kill {n}")
                time.sleep(1)
                for _ in range(30):
                    if vida(n) > 0:
                        break
                    time.sleep(1)
                t0 = time.time()
                if caso == "golpe":
                    time.sleep(3.5)  # ya ha salido a por sus cosas (la agenda arranca a los 2,5 s de reaparecer)
                    r(f"damage {n} 1 minecraft:mob_attack by @e[type=minecraft:zombie,limit=1]")
                tengo, traza, resuelto = 0, [], None
                while time.time() - t0 < ESPERAS[caso]:
                    tengo = hierro(n)
                    if tengo >= 32:
                        break
                    if re.search(r"No encontré mis cosas|Recuperé \d+/", ruta.read_text()[inicio:]):
                        resuelto = "se rinde"
                        break
                    p = re.search(r"Pos: \[([-0-9.]+)d, ([-0-9.]+)d, ([-0-9.]+)d", r(f"data get entity {n}"))
                    if p and int(time.time() - t0) % 5 == 0:
                        traza.append([round(float(p[1])), round(float(p[2])), round(float(p[3]))])
                    time.sleep(1)
                otra = muertes(n) - muertes0 - 1
                dejada = ruta.read_text().count("Dejo «recuperar mis cosas»") - antes
                bien = tengo >= 32 or (caso == "sellado" and resuelto is not None)
                fila = {"ok": bien and otra == 0 and dejada == 0, "hierro": tengo, "otra_muerte": otra, "abandonada": dejada, "resuelto": resuelto,
                        "s": round(time.time() - t0, 1), "traza": traza[:16]}
                res[caso].append(fila)
                print(f"  {caso:8} {'BIEN ' if fila['ok'] else 'FALLO'} {json.dumps(fila, ensure_ascii=False)[:230]}", flush=True)
    finally:
        try:
            os.killpg(bot.pid, signal.SIGTERM)
            bot.wait(15)
        except Exception:
            pass
        r("kill @e[type=minecraft:zombie]")
        r("kill @e[type=minecraft:item]")
        r(f"fill {PASARELA} minecraft:air")
        r(f"forceload remove {X - ANCHO} {Z - ANCHO} {X + LEJOS + ANCHO} {Z + ANCHO}")
        if monstruos:
            r(f"gamerule spawn_monsters {monstruos[1]}")
        salida = AQUI / "logs" / f"recuperar-{time.strftime('%Y%m%d-%H%M')}.json"
        salida.write_text(json.dumps({"fecha": time.strftime("%Y-%m-%d %H:%M"), "mundo": MUNDO_SV, "pruebas": res}, ensure_ascii=False, indent=1) + "\n")
        for c, v in res.items():
            print(f"{c:8} {sum(x['ok'] for x in v)}/{len(v)} (criterio 3/3)", flush=True)
        print("FIN", salida, flush=True)


if __name__ == "__main__":
    main()
