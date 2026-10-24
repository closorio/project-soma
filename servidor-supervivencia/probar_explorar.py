#!/usr/bin/env python3
"""F8.0b · E0 «explorar robusto» (PLAN_F8_perfiles.md): 10 salidas de 60 bloques en 4 terrenos con un bot temporal (bot/io.js con
IO_SERVIDOR; por defecto Prueba1, puerto de control 3101), con el servidor ya en marcha (servidor-local/arrancar.sh y
IO_SERVIDOR=local, o el de supervivencia).
Terrenos:
- llano: el bioma plains más cercano (locate), sobre motion_blocking_no_leaves;
- montaña: el más cercano de jagged/stony/frozen_peaks, windswept_hills, snowy_slopes o grove;
- río: el bioma river más cercano (puede salir con los pies en el agua);
- cueva: un hueco cerrado de 1×2 dentro de un cubo de roca de 11×11×11 hecho con fill 10 bloques bajo el suelo de un llano (sin
  cielo ni salida, con el terreno de verdad encima): tiene que desatascarse y luego explorar. Cada salida, en otro sitio del llano.
Cada salida: con un pico de piedra y 16 de tierra, de día, sin monstruos (spawn_monsters false mientras dura), rumbo n/e/s/o por turnos, «explorar RUMBO 60 150».
Criterio fijado antes de medir: éxito de explorar (≥ 75 % de los 60 bloques o «llegué») sin la causa «sin suelo seco» en
10/10 de cada terreno. Se anota la causa, lo recorrido, los tramos cavados y los desatascos.
Escribe logs/explorar-AAAAMMDD-HHMM.json. Uso: probar_explorar.py [--solo llano,montaña,río,cueva] [--n 10] [--nombre Prueba1] [--puerto 3101]"""
import argparse, json, os, re, signal, subprocess, sys, time, urllib.parse, urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "servidor"))
from rcon import rcon

MUNDO_SV = os.environ.get("IO_SERVIDOR") or "supervivencia"
(AQUI / "logs").mkdir(exist_ok=True)
OW = "execute in minecraft:overworld"
MONTANA = ["minecraft:jagged_peaks", "minecraft:stony_peaks", "minecraft:frozen_peaks", "minecraft:windswept_hills",
           "minecraft:snowy_slopes", "minecraft:grove"]
TERRENOS = {"llano": ["minecraft:plains"], "montaña": MONTANA, "río": ["minecraft:river"], "cueva": None}
RUMBOS = ["norte", "este", "sur", "oeste"]
DESPLAZAMIENTOS = [(0, 0), (12, 0), (0, 12), (-12, 0), (0, -12), (24, 6), (6, 24), (-24, -6), (-6, -24), (18, 18)]
HONDO = 10  # la cueva: el hueco, 10 bloques bajo el suelo del llano
D, SEG = 60, 150


def r(cmd):
    return rcon(cmd, servidor=MUNDO_SV)


def orden(puerto, c, t=200):
    try:
        return urllib.request.urlopen(f"http://127.0.0.1:{puerto}/?c=" + urllib.parse.quote(c), timeout=t).read().decode().strip()
    except Exception as e:
        return f"sin respuesta: {e}"


def localizar(biomas):
    mejor = None
    for b in biomas:
        m = re.search(r"\[(-?\d+), [^,]+, (-?\d+)\] \((\d+) blocks? away\)", r(f"locate biome {b}"))
        if m and (mejor is None or int(m[3]) < mejor[3]):
            mejor = (b, int(m[1]), int(m[2]), int(m[3]))
    return mejor


def poner_en(nombre, x, z):
    r(f"forceload add {x} {z}")
    time.sleep(2.5)
    r(f"{OW} positioned {x} 0 {z} positioned over motion_blocking_no_leaves run tp {nombre} ~ ~ ~")
    time.sleep(2)
    r(f"forceload remove {x} {z}")


def pos(nombre):
    p = re.findall(r"(-?[\d.]+)d", r(f"data get entity {nombre} Pos"))
    return [int(float(v) // 1) for v in p[:3]] if len(p) >= 3 else None


def cueva(nombre, x, z):
    """El bot en un hueco cerrado de 1×2 a HONDO bloques bajo el suelo de (x, z), dentro de un cubo de roca de 11×11×11."""
    poner_en(nombre, x, z)
    p = pos(nombre)
    if not p:
        return None
    y = p[1] - HONDO
    r(f"forceload add {x} {z}")
    time.sleep(1.5)
    r(f"fill {x - 5} {y - 5} {z - 5} {x + 5} {y + 5} {z + 5} minecraft:stone")
    r(f"fill {x} {y} {z} {x} {y + 1} {z} minecraft:air")
    r(f"tp {nombre} {x + 0.5} {y} {z + 0.5}")
    time.sleep(1.5)
    r(f"forceload remove {x} {z}")
    return [x, y, z]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--solo", default=",".join(TERRENOS))
    ap.add_argument("--n", type=int, default=10)
    ap.add_argument("--nombre", default="Prueba1")
    ap.add_argument("--puerto", type=int, default=3101)
    a = ap.parse_args()
    try:
        r("list")
    except OSError:
        sys.exit(f"el servidor de {MUNDO_SV} no responde por RCON: arráncalo")
    monstruos = re.search(r"set to: (\w+)", r("gamerule spawn_monsters"))
    r("gamerule spawn_monsters false")
    log = open(AQUI / "logs" / f"bot-{a.nombre}-explorar.log", "w")
    bot = subprocess.Popen(["node", "io.js", f"{a.nombre}:{a.puerto}"], cwd=AQUI.parent / "bot", stdout=log, stderr=subprocess.STDOUT,
                           env={**os.environ, "IO_SERVIDOR": MUNDO_SV}, start_new_session=True)
    res = {}
    try:
        for _ in range(60):
            if orden(a.puerto, "estado", 5).startswith("pos "):
                break
            time.sleep(1)
        else:
            raise SystemExit("el bot no se conectó en 60 s (mira logs/bot-*-explorar.log)")
        orden(a.puerto, "reflejos no")
        n = a.nombre
        for terreno in [t for t in a.solo.split(",") if t]:
            biomas = TERRENOS[terreno]
            centro = None
            if biomas or terreno == "cueva":
                centro = localizar(biomas or ["minecraft:plains"])
                if not centro:
                    print(f"{terreno}: no encuentro {biomas}", flush=True)
                    continue
                print(f"== {terreno}: {centro[0]} en {centro[1]}, {centro[2]} ({centro[3]} bloques)", flush=True)
                if not biomas:
                    print(f"   (cueva: {HONDO} bajo el suelo del llano, en los puntos de salida separados al doble)", flush=True)
            res[terreno] = []
            for k in range(a.n):
                r("time set 1000")
                r("weather clear")
                r(f"effect give {n} minecraft:instant_health 1 10 true")
                r(f"effect give {n} minecraft:saturation 5 20 true")
                # el kit de alguien que lleva un rato jugando: pico de piedra y bloques (sin pico, picar roca a mano no da tiempo)
                r(f"clear {n}")
                r(f"give {n} minecraft:stone_pickaxe")
                r(f"give {n} minecraft:dirt 16")
                orden(a.puerto, "para")
                if biomas:
                    dx, dz = DESPLAZAMIENTOS[k % len(DESPLAZAMIENTOS)]
                    poner_en(n, centro[1] + dx, centro[2] + dz)
                else:
                    dx, dz = DESPLAZAMIENTOS[k % len(DESPLAZAMIENTOS)]
                    hueco = cueva(n, centro[1] + 2 * dx + 3, centro[2] + 2 * dz + 3)  # bajo el llano (a 120 caía en un manglar)
                    if not hueco:
                        print("  no pude leer la posición para la cueva", flush=True)
                        continue
                orden(a.puerto, "campamento -")  # cada salida con su campamento (la primera posición)
                rumbo = RUMBOS[k % 4]
                t0 = time.time()
                txt = orden(a.puerto, f"hab explorar {rumbo} {D} {SEG}", SEG + 60)
                try:
                    d = json.loads(txt)
                except ValueError:
                    d = {"exito": False, "causa": "sin respuesta: " + txt[:60]}
                ok = bool(d.get("exito")) and "sin suelo seco" not in str(d.get("causa"))
                fila = {"ok": ok, "rumbo": rumbo, "causa": d.get("causa"), "recorrido": d.get("recorrido"), "altura": d.get("altura"),
                        "cavados": d.get("cavados", 0), "desatascos": d.get("desatascos", 0), "rotos": len(d.get("rotos", [])),
                        "puestos": len(d.get("puestos", [])), "s": round(time.time() - t0, 1)}
                res[terreno].append(fila)
                print(f"  {terreno:8} {'BIEN ' if ok else 'FALLO'} {rumbo:6} {d.get('causa')} · {d.get('recorrido')} bloques · "
                      f"cavados {fila['cavados']} · desatascos {fila['desatascos']} ({fila['s']} s)", flush=True)
    finally:
        try:
            os.killpg(bot.pid, signal.SIGTERM)
            bot.wait(15)
        except Exception:
            try:
                os.killpg(bot.pid, signal.SIGKILL)
            except Exception:
                pass
        if monstruos:
            r(f"gamerule spawn_monsters {monstruos[1]}")
        r("save-all flush")
        resumen = {t: {"bien": sum(x["ok"] for x in rs), "de": len(rs), "pasa": sum(x["ok"] for x in rs) == len(rs) and len(rs) > 0}
                   for t, rs in res.items()}
        for t, s in resumen.items():
            print(f"{t:10} {s['bien']}/{s['de']} (criterio 10/10: {'PASA' if s['pasa'] else 'NO PASA'})", flush=True)
        (AQUI / "logs" / f"explorar-{time.strftime('%Y%m%d-%H%M')}.json").write_text(json.dumps(
            {"fecha": time.strftime("%Y-%m-%d %H:%M"), "mundo": MUNDO_SV, "n": a.n, "distancia": D, "resumen": resumen, "pruebas": res},
            ensure_ascii=False, indent=1) + "\n")
        print("FIN", flush=True)


if __name__ == "__main__":
    main()
