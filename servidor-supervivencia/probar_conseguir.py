#!/usr/bin/env python3
"""Banco del recolector avanzado (bot/conseguir.js, 2026-11-02): «consigue N MATERIAL» con un bot temporal (bot/io.js con
IO_SERVIDOR; por defecto Prueba1, puerto de control 3101), con el servidor ya en marcha (servidor-local/arrancar.sh y
IO_SERVIDOR=local, o el de supervivencia). En el terreno de verdad: cada intento, en otro punto de un llano (locate biome plains),
a 48 bloques del anterior, de día, sin monstruos (salvo --monstruos) y con la cuenta de muertes (scoreboard deathCount).
Kits (lo que lleva un jugador que ya ha empezado): «piedra» = pico de piedra, 8 antorchas, 8 de pan y 32 de piedra; «hierro» =
lo mismo con pico de hierro; «nada» = el inventario vacío (todo el camino: ármate, hierro, pico de hierro, carbón, bajar…).
Materiales y lo que se pide: hierro 6, lapis 6, oro 4, redstone 8, diamante 2 (con el kit de cada uno: hierro y lapis con piedra,
el resto con hierro), y «cero» = diamante 1 desde nada.
Criterio fijado antes de medir: lo pedido en el inventario del bot (`conseguir` por el puerto se lo queda)
en ≥ 4/5 de cada material, y 0 muertes en todo el banco. Se anota la causa, lo conseguido, los pasos y los segundos.
Escribe logs/conseguir-AAAAMMDD-HHMM.json. Uso: probar_conseguir.py [--solo hierro,lapis,oro,redstone,diamante,cero] [--n 5]
[--nombre Prueba1] [--puerto 3101] [--monstruos] [--seguir logs/conseguir-….json] (lo reanuda)"""
import argparse, json, os, re, signal, subprocess, sys, time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI))
from probar_explorar import r, orden, localizar, poner_en, MUNDO_SV  # noqa: E402

# material → (lo que se pide, kit, objetos que cuentan)
CASOS = {
    "hierro": (6, "piedra", ["raw_iron", "iron_ingot"]),
    "lapis": (6, "piedra", ["lapis_lazuli"]),
    "oro": (4, "hierro", ["raw_gold", "gold_ingot"]),
    "redstone": (8, "hierro", ["redstone"]),
    "diamante": (2, "hierro", ["diamond"]),
    "cero": (1, "nada", ["diamond"]),
}
KITS = {"piedra": ["stone_pickaxe", "torch 8", "bread 8", "cobblestone 32"],
        "hierro": ["iron_pickaxe", "torch 8", "bread 8", "cobblestone 32"], "nada": []}
PASO = 48
SEG = 1900  # conseguir corta a los 30 min


def contar(nombre, items):
    n = 0
    for it in items:
        m = re.search(r"Found (\d+) matching", r(f"clear {nombre} minecraft:{it} 0"))
        n += int(m[1]) if m else 0
    return n


def muertes(nombre):
    m = re.search(r"has (\d+) \[", r(f"scoreboard players get {nombre} banco_muertes"))
    return int(m[1]) if m else 0


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--solo", default=",".join(CASOS))
    ap.add_argument("--n", type=int, default=5)
    ap.add_argument("--nombre", default="Prueba1")
    ap.add_argument("--puerto", type=int, default=3101)
    ap.add_argument("--monstruos", action="store_true")
    ap.add_argument("--seguir", metavar="JSON", help="reanudar: salta los intentos ya hechos de ese JSON y sigue escribiéndolo")
    a = ap.parse_args()
    try:
        r("list")
    except OSError:
        sys.exit(f"el servidor de {MUNDO_SV} no responde por RCON: arráncalo")
    monstruos = re.search(r"set to: (\w+)", r("gamerule spawn_monsters"))
    if not a.monstruos:
        r("gamerule spawn_monsters false")
    r("scoreboard objectives add banco_muertes deathCount")
    log = open(AQUI / "logs" / f"bot-{a.nombre}-conseguir.log", "w")
    bot = subprocess.Popen(["node", "io.js", f"{a.nombre}:{a.puerto}"], cwd=AQUI.parent / "bot", stdout=log, stderr=subprocess.STDOUT,
                           env={**os.environ, "IO_SERVIDOR": MUNDO_SV}, start_new_session=True)
    res, n = {}, a.nombre
    # 2026-11-02: el PC se reinició a mitad del banco y no quedó nada (el JSON se escribía al final): ahora, tras cada intento
    salida = Path(a.seguir) if a.seguir else AQUI / "logs" / f"conseguir-{time.strftime('%Y%m%d-%H%M')}.json"
    if a.seguir:
        res = json.loads(salida.read_text()).get("pruebas", {})
        print(f"== sigo {salida.name}: " + ", ".join(f"{c} {len(v)}" for c, v in res.items()), flush=True)

    def guardar():
        total = sum(x["murio"] for rs in res.values() for x in rs)
        resumen = {c: {"bien": sum(x["ok"] for x in rs), "de": len(rs), "pasa": len(rs) > 0 and sum(x["ok"] for x in rs) >= 0.8 * len(rs)}
                   for c, rs in res.items()}
        salida.write_text(json.dumps({"fecha": time.strftime("%Y-%m-%d %H:%M"), "mundo": MUNDO_SV, "n": a.n, "resumen": resumen,
                                      "muertes": total, "pruebas": res}, ensure_ascii=False, indent=1) + "\n")
        return resumen, total
    try:
        for _ in range(60):
            if orden(a.puerto, "estado", 5).startswith("pos "):
                break
            time.sleep(1)
        else:
            raise SystemExit("el bot no se conectó en 60 s (mira logs/bot-*-conseguir.log)")
        centro = localizar(["minecraft:plains"])
        if not centro:
            raise SystemExit("no encuentro un llano")
        print(f"== llano en {centro[1]}, {centro[2]} ({centro[3]} bloques)", flush=True)
        r(f"scoreboard players set {n} banco_muertes 0")
        k = sum(len(v) for v in res.values())  # al reanudar, otros puntos (no repite terreno)
        for caso in [c for c in a.solo.split(",") if c]:
            pide, kit, items = CASOS[caso]
            material = "diamante" if caso == "cero" else caso
            res.setdefault(caso, [])
            for _ in range(a.n - len(res[caso])):
                k += 1
                r("time set 1000")
                r("weather clear")
                r(f"effect give {n} minecraft:instant_health 1 10 true")
                r(f"effect give {n} minecraft:saturation 5 20 true")
                r(f"clear {n}")
                for g in KITS[kit]:
                    r(f"give {n} minecraft:{g}")
                orden(a.puerto, "para")
                # sin agua a los pies (el primer humo cayó en un lago y se ahogó): el siguiente punto, hasta 6
                for _ in range(6):
                    poner_en(n, centro[1] + PASO * (k % 7) - 3 * PASO, centro[2] + PASO * (k // 7))
                    if "passed" not in r(f"execute at {n} if block ~ ~ ~ minecraft:water"):
                        break
                    k += 1
                orden(a.puerto, "campamento -")
                antes = muertes(n)
                t0 = time.time()
                txt = orden(a.puerto, f"conseguir {material} {pide}", SEG + 60)  # por el puerto se lo queda (la orden de chat lo entregaría)
                if '"cancelado"' in txt:  # lo cortó una pausa (Ctrl-C): no es un intento, --seguir lo repite
                    raise SystemExit("intento cancelado: reanuda con --seguir")
                tengo = contar(n, items)
                murio = muertes(n) - antes
                ok = tengo >= pide and not murio
                fila = {"ok": ok, "pide": pide, "tengo": tengo, "murio": murio, "respuesta": txt[:200], "s": round(time.time() - t0, 1)}
                res[caso].append(fila)
                guardar()
                print(f"  {caso:9} {'BIEN ' if ok else 'FALLO'} {tengo}/{pide}{' · MUERTO' if murio else ''} · {txt[:90]} ({fila['s']} s)",
                      flush=True)
                if not ok and "sin respuesta" in txt:
                    orden(a.puerto, "para")
                    time.sleep(5)
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
        resumen, total_muertes = guardar()
        for c, s in resumen.items():
            print(f"{c:10} {s['bien']}/{s['de']} (criterio ≥ 4/5: {'PASA' if s['pasa'] else 'NO PASA'})", flush=True)
        print(f"muertes: {total_muertes} (criterio 0: {'PASA' if total_muertes == 0 else 'NO PASA'})", flush=True)
        print("FIN", flush=True)


if __name__ == "__main__":
    main()
