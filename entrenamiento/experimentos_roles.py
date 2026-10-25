#!/usr/bin/env python3
"""F8.1 · banco K (y de cualquier rol v2): N personajes con el capataz de un rol (bot/capataz.js) a la vez, desde cero, en el mundo
de IO_SERVIDOR (por defecto local, 26.1.2), con el servidor ya en marcha (servidor-local/arrancar.sh).
Cada rotación: 4 puntos en llanos sin estrenar (--zona); con Casual, solo puntos con ≥ 3 ovejas a ≤ 48 bloques (--ovejas) (sobre motion_blocking_no_leaves), inventario vacío, memoria
persistente borrada, `time set 0`, monstruos encendidos, reflejos encendidos, modo libre; dura --dias días de Minecraft (por
defecto 2 = 40 min). Cada 15 s lee `progreso` de cada personaje (etapas hechas con su día y su hora, y el inventario) y las muertes
(su memoria persistente).
Criterio de Casual fijado antes de medir (PLAN_F8_perfiles.md, banco K): pico de hierro y cama en ≤ 2 días en ≥ 6 de 8; muertes ≤ 1
cada 3 días (se informa por ejecución). Escribe logs/rol-ROL-AAAAMMDD-HHMM.json (y lo va escribiendo durante la medida).
Uso: experimentos_roles.py [--rol casual] [--dias 2] [--rotaciones 2] [--puertos 3201] [--prefijo K]"""
import argparse, json, math, os, re, signal, subprocess, sys, time, urllib.parse, urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
sys.path.insert(0, str(RAIZ / "servidor"))
from rcon import rcon, hora  # noqa: E402

MUNDO = os.environ.get("IO_SERVIDOR") or "local"
OW = "execute in minecraft:overworld"
LOGS = RAIZ / "servidor-supervivencia" / "logs"
# a 200 bloques entre sí: cada personaje con su terreno (a 60 se repartían las pocas ovejas del llano: 9 en 128 bloques a la redonda)
ROTACIONES = [[(0, 100), (100, 0), (0, -100), (-100, 0)], [(100, 100), (-100, 100), (100, -100), (-100, -100)],
              [(0, 200), (200, 0), (0, -200), (-200, 0)]]
HITOS = {"pico_hierro": lambda inv: inv.get("pico", 0) >= 1, "cama": lambda inv: inv.get("cama", 0) >= 1,
         "antorchas": lambda inv: inv.get("antorchas", 0) >= 8, "horno": lambda inv: inv.get("horno", 0) >= 1,
         "hierro": lambda inv: inv.get("hierro", 0) + inv.get("hierro_mena", 0) >= 3}
HITOS_MEMORIA = ("casa",)  # los de progresion.estado().memoria (la casa construida queda en la memoria persistente)
MIN_MB = 800


def r(cmd):
    return rcon(cmd, servidor=MUNDO)


def orden(puerto, c, t=30):
    try:
        return urllib.request.urlopen(f"http://127.0.0.1:{puerto}/?c=" + urllib.parse.quote(c), timeout=t).read().decode().strip()
    except Exception as e:
        return f"sin respuesta: {e}"


def memoria_mb():
    for l in open("/proc/meminfo"):
        if l.startswith("MemAvailable:"):
            return int(l.split()[1]) // 1024


def llano(zona=0):
    """El llano más cercano a (1500·zona, 1500·zona): cada medida en terreno sin tocar (la caza de medidas anteriores acaba con las
    ovejas, y las talas con los árboles cercanos)."""
    o = 1500 * zona
    m = re.search(r"\[(-?\d+), [^,]+, (-?\d+)\]", r(f"{OW} positioned {o} 64 {o} run locate biome minecraft:plains"))
    return (int(m[1]), int(m[2])) if m else (o, o)


def poner_en(nombre, x, z):
    r(f"forceload add {x} {z}")
    time.sleep(2.5)
    r(f"{OW} positioned {x} 0 {z} positioned over motion_blocking_no_leaves run tp {nombre} ~ ~ ~")
    time.sleep(1.5)
    r(f"forceload remove {x} {z}")


def muertes(nombre):
    f = RAIZ / "mundos" / MUNDO / f"memoria_{nombre}.json"
    try:
        return len(json.loads(f.read_text()).get("muertes", []))
    except (OSError, ValueError):
        return 0


def ovejas_en(x, z, radio=48):
    """Cuántas ovejas hay a ≤ radio de (x, z) (carga los trozos un momento: sin ellos el servidor no sabe de sus entidades)."""
    r(f"forceload add {x - 32} {z - 32} {x + 32} {z + 32}")
    time.sleep(5)
    m = re.search(r"Count: (\d+)", r(f"{OW} positioned {x} 64 {z} if entity @e[type=minecraft:sheep,distance=..{radio}]"))
    r(f"forceload remove {x - 32} {z - 32} {x + 32} {z + 32}")
    return int(m[1]) if m else 0


def al_llano(x, z):
    m = re.search(r"\[(-?\d+), [^,]+, (-?\d+)\]", r(f"{OW} positioned {x} 64 {z} run locate biome minecraft:plains"))
    return (int(m[1]), int(m[2])) if m else (x, z)


def elegir_puntos(n, k, zona, ovejas, separacion=150):
    """n puntos de salida en llano para la rotación k. Con ovejas > 0 (Casual: la cama pide 3 de lana; decisión del usuario,
    2026-10-24, porque esta semilla tiene muy pocas), solo los que tienen al menos esas ovejas a ≤ 48 bloques, a ≥ separacion
    entre sí; si en la zona no hay bastantes, en las siguientes. Devuelve [(x, z, ovejas)]."""
    if not ovejas:
        centro = llano(zona)
        return [(*al_llano(centro[0] + dx, centro[1] + dz), None) for dx, dz in ROTACIONES[k % len(ROTACIONES)][:n]]
    elegidos = []
    for zz in range(zona, zona + 6):
        centro = llano(zz)
        print(f"   buscando puntos con ≥ {ovejas} ovejas alrededor del llano {centro}…", flush=True)
        for radio in (0, 100, 200, 300, 400):
            for g in (range(0, 360, 45) if radio else [0]):
                x, z = al_llano(round(centro[0] + radio * math.cos(math.radians(g))), round(centro[1] + radio * math.sin(math.radians(g))))
                if any(math.hypot(x - ex, z - ez) < separacion for ex, ez, _ in elegidos):
                    continue
                c = ovejas_en(x, z)
                if c >= ovejas:
                    elegidos.append((x, z, c))
                    print(f"   punto {len(elegidos)}: {x}, {z} con {c} ovejas", flush=True)
                    if len(elegidos) == n:
                        return elegidos
    raise SystemExit(f"no encuentro {n} puntos con ≥ {ovejas} ovejas (llevo {len(elegidos)})")


def rotacion(a, k, puntos, nombres, puertos, salida, res):
    for n in nombres:
        (RAIZ / "mundos" / MUNDO / f"memoria_{n}.json").unlink(missing_ok=True)
    args = [f"{n}:{p}:recolector:ordenes:capataz@{a.rol}" for n, p in zip(nombres, puertos)]
    log = open(LOGS / f"bots-rol-{a.rol}-{k}.log", "w")
    bot = subprocess.Popen(["node", "io.js", *args], cwd=RAIZ / "bot", stdout=log, stderr=subprocess.STDOUT,
                           env={**os.environ, "IO_SERVIDOR": MUNDO, "IO_BOTS": ",".join(nombres)}, start_new_session=True)
    filas = {}
    try:
        for _ in range(90):
            if all(orden(p, "estado", 5).startswith("pos ") for p in puertos):
                break
            time.sleep(1)
        else:
            raise SystemExit("los bots no se conectaron en 90 s")
        r("gamerule spawn_monsters true")
        r("weather clear")
        for i, (n, p) in enumerate(zip(nombres, puertos)):
            px, pz, nov = puntos[i]
            r(f"clear {n}")
            r(f"effect clear {n}")
            r(f"effect give {n} minecraft:instant_health 1 10 true")
            r(f"effect give {n} minecraft:saturation 1 20 true")
            poner_en(n, px, pz)
            orden(p, "campamento aqui")
            orden(p, "reflejos si")
            filas[n] = {"rotacion": k, "punto": [px, pz], "ovejas": nov, "hitos": {}, "etapas": {}, "muertes": 0, "ultima": None}
        r("time set 0")
        dia0, _ = hora(MUNDO)
        for p in puertos:
            orden(p, "modo libre")
        t0 = time.time()
        while True:
            time.sleep(15)
            # F8.1: si el proceso de los bots se cae, la rotación acaba (antes seguía preguntando a puertos muertos y el servidor,
            # sin jugadores, se pausaba)
            if bot.poll() is not None:
                log.flush()
                error = [l for l in (LOGS / f"bots-rol-{a.rol}-{k}.log").read_text(errors="replace").splitlines() if "Error" in l]
                for f in filas.values():
                    f["caido"] = error[-1][:300] if error else f"salió con {bot.returncode}"
                res[f"rot{k}"] = filas
                salida.write_text(json.dumps({"rol": a.rol, "mundo": MUNDO, "dias": a.dias, "resultados": res}, ensure_ascii=False, indent=1) + "\n")
                print(f"  ¡el proceso de los bots se cayó! {next(iter(filas.values()))['caido']}", flush=True)
                break
            if memoria_mb() < MIN_MB:
                raise SystemExit(f"solo quedan {memoria_mb()} MB de memoria disponible: paro")
            dia, ticks = hora(MUNDO)
            dias = (dia - dia0) + ticks / 24000 if dia is not None else (time.time() - t0) / 1200
            for n, p in zip(nombres, puertos):
                try:
                    pr = json.loads(orden(p, "progreso", 10))
                except ValueError:
                    continue
                f = filas[n]
                f["ultima"] = {"etapa": pr.get("etapa"), "falta": pr.get("falta")}
                for id_, h in (pr.get("hechas") or {}).items():
                    f["etapas"].setdefault(id_, {"dias": round(dias, 2), **h})
                inv = (pr.get("estado") or {}).get("inv", {})
                for h, ok in HITOS.items():
                    if ok(inv) and h not in f["hitos"]:
                        f["hitos"][h] = round(dias, 2)
                mem = (pr.get("estado") or {}).get("memoria", {})
                for h in HITOS_MEMORIA:
                    if mem.get(h) and h not in f["hitos"]:
                        f["hitos"][h] = round(dias, 2)
                f["muertes"] = muertes(n)
            res[f"rot{k}"] = filas
            salida.write_text(json.dumps({"rol": a.rol, "mundo": MUNDO, "dias": a.dias, "resultados": res}, ensure_ascii=False, indent=1) + "\n")
            print(f"  día {dias:4.2f} · " + " · ".join(f"{n}: {f['ultima']['etapa'] if f['ultima'] else '?'} {sorted(f['hitos'])}"
                                                    for n, f in filas.items()), flush=True)
            if dias >= a.dias or time.time() - t0 > a.dias * 1200 * 1.5:
                break
    finally:
        try:
            os.killpg(bot.pid, signal.SIGTERM)
            bot.wait(20)
        except Exception:
            try:
                os.killpg(bot.pid, signal.SIGKILL)
            except Exception:
                pass
    return filas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rol", default="casual")
    ap.add_argument("--dias", type=float, default=2)
    ap.add_argument("--rotaciones", type=int, default=2)
    ap.add_argument("--puertos", type=int, default=3201)
    ap.add_argument("--prefijo", default="K")
    ap.add_argument("--n", type=int, default=4)
    ap.add_argument("--zona", type=int, default=None, help="terreno de la medida (por defecto, uno nuevo cada vez)")
    ap.add_argument("--ovejas", type=int, default=None, help="ovejas mínimas a ≤ 48 de cada punto (por defecto 3 con casual, 0 con los demás)")
    a = ap.parse_args()
    try:
        r("list")
    except OSError:
        sys.exit(f"el servidor de {MUNDO} no responde por RCON: arráncalo")
    LOGS.mkdir(exist_ok=True)
    salida = LOGS / f"rol-{a.rol}-{time.strftime('%Y%m%d-%H%M')}.json"
    nombres = [f"{a.prefijo}{i + 1}" for i in range(a.n)]
    puertos = [a.puertos + i for i in range(a.n)]
    zona = a.zona if a.zona is not None else int(time.time() // 3600) % 40 + 1
    print(f"rol {a.rol} · {a.n} personajes × {a.rotaciones} rotaciones · {a.dias} días · zonas desde {zona}", flush=True)
    ovejas = a.ovejas if a.ovejas is not None else (3 if a.rol == "casual" else 0)
    res = {}
    for k in range(a.rotaciones):
        print(f"== rotación {k + 1}", flush=True)
        puntos = elegir_puntos(a.n, k, zona + 7 * k, ovejas)  # cada rotación en zonas sin estrenar (las de la anterior quedan atrás)
        rotacion(a, k, puntos, nombres, puertos, salida, res)
    filas = [f for rot in res.values() for f in rot.values()]
    bien = [f for f in filas if f["hitos"].get("pico_hierro", 99) <= 2 and f["hitos"].get("cama", 99) <= 2]
    muertes_3d = [round(f["muertes"] * 3 / a.dias, 2) for f in filas]
    resumen = {"pico_hierro_y_cama_en_2_dias": len(bien), "de": len(filas), "pasa": len(bien) >= 6 * len(filas) / 8,
               "muertes_por_3_dias": muertes_3d, "muertes_ok": all(m <= 1 for m in muertes_3d)}
    print(f"pico de hierro y cama en ≤ 2 días: {len(bien)}/{len(filas)} (criterio ≥ 6/8: {'PASA' if resumen['pasa'] else 'NO PASA'}) · "
          f"muertes por 3 días {muertes_3d} ({'bien' if resumen['muertes_ok'] else 'demasiadas'})", flush=True)
    salida.write_text(json.dumps({"rol": a.rol, "mundo": MUNDO, "dias": a.dias, "resumen": resumen, "resultados": res},
                                 ensure_ascii=False, indent=1) + "\n")
    print("FIN", salida, flush=True)


if __name__ == "__main__":
    main()
