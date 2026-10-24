#!/usr/bin/env python3
"""Pruebas de las habilidades de F2 en el servidor local (bot en 127.0.0.1:PUERTO, RCON de prueba).
Uso: probar_habilidades.py [N=20] [semilla=42] [M=6] [--puerto 3001] [--nombre Soma]
(--nombre: el del personaje para el tp por RCON; por defecto, el que dice el bot en ese puerto)
1. Cadena del árbol desde los mismos puntos que medir.py: ir_a_arbol → picar_tronco ×2 → recoger (repone los troncos);
   cuenta como acierto si suben los troncos del inventario.
2. M pruebas de huir e ir_a_jugador con un aldeano quieto (NoAI) invocado por RCON y retirado al final.
Escribe habilidades_medidas.json (éxito, causas y tiempos por habilidad) para calibrar entorno_habilidades.py."""
import argparse, json, math, random, re, statistics, sys, time, urllib.parse, urllib.request
from collections import Counter, defaultdict
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "servidor"))  # servidor/rcon.py
from rcon import rcon

OW = "execute in minecraft:overworld"
ETIQUETA = "prueba_hab"

ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
ap.add_argument("N", nargs="?", type=int, default=20)
ap.add_argument("semilla", nargs="?", type=int, default=42)
ap.add_argument("M", nargs="?", type=int, default=6)
ap.add_argument("--puerto", type=int, default=3001)
ap.add_argument("--nombre")
A = ap.parse_args()

def orden(c, t=200):
    try:
        return urllib.request.urlopen(f"http://127.0.0.1:{A.puerto}/?c=" + urllib.parse.quote(c), timeout=t).read().decode().strip()
    except Exception as e:
        return "ERROR " + str(e)[:40]

NOMBRE = A.nombre or (re.search(r'"yo":"([^"]+)"', orden("personajes", 10)) or [None, "Soma"])[1]

def hab(c, t=200):
    r = orden(c, t)
    try:
        return json.loads(r)
    except ValueError:
        return {"habilidad": c.split()[0], "exito": False, "causa": "sin respuesta: " + r[:40], "ms": 0}

def punto():
    """Igual que medir.py: 12-30 bloques del arbolado (303, 32), sin agua debajo."""
    while True:
        ang, rad = random.uniform(0, 2 * math.pi), random.uniform(12, 30)
        x, z = round(303 + rad * math.cos(ang)), round(32 + rad * math.sin(ang))
        if "passed" not in rcon(f"{OW} positioned {x} 64 {z} positioned over world_surface if block ~ ~-1 ~ water"):
            return x, z

def troncos():
    """Troncos en el inventario, leídos de la orden estado («oak_logx64, …»)."""
    return sum(int(n) for n in re.findall(r"_logx(\d+)", orden("estado", 10)))

def tp(x, z):
    orden("para", 10)
    rcon(f"{OW} positioned {x} 64 {z} positioned over motion_blocking_no_leaves run tp {NOMBRE} ~ ~ ~")
    time.sleep(3)

registro = defaultdict(list)  # habilidad → resultados
def anota(r):
    registro[r.get("habilidad", "?")].append(r)
    return r

N, M = A.N, A.M
random.seed(A.semilla)

# 1 · cadena del árbol
cadena_ok = solos = picados = 0  # solos: troncos que entran al inventario al picar, sin recoger
for i in range(1, N + 1):
    x, z = punto(); tp(x, z)
    antes = troncos()
    pasos = [anota(hab("ir_a_arbol 80", 420))]
    if pasos[-1]["exito"]:
        for _ in range(2):  # dos troncos seguidos: el segundo mide «tronco al alcance» sin volver a andar
            pasos.append(anota(hab("picar_tronco", 30)))
        time.sleep(0.6)
        solos += troncos() - antes
        picados += sum(r["exito"] for r in pasos[1:3])
        pasos.append(anota(hab("recoger", 60)))
        for r in pasos[1:3]:  # reponer después de recoger: si no, el objeto queda dentro del bloque y salta a la copa
            if r["exito"]:
                rcon(f"{OW} run setblock {r['pos'][0]} {r['pos'][1]} {r['pos'][2]} minecraft:{r['bloque']}")
    ganados = troncos() - antes  # al picar junto al árbol el objeto a veces entra solo, sin recoger
    ok = ganados > 0
    cadena_ok += ok
    resumen = " → ".join(f"{p['habilidad']}:{'ok' if p['exito'] else p['causa']}({p['ms'] / 1000:.0f}s)" for p in pasos)
    print(f"{i:2d} ({x},{z}) {'OK' if ok else 'FALLO'} +{ganados} troncos · {resumen}", flush=True)
    time.sleep(1)

# 2 · huir e ir_a_jugador con un aldeano quieto
def aldeano(x, z):
    rcon(f"kill @e[type=minecraft:villager,tag={ETIQUETA}]")
    rcon(f"{OW} positioned {x} 64 {z} positioned over motion_blocking_no_leaves run summon minecraft:villager ~ ~ ~ "
         f"{{NoAI:1b,Silent:1b,Invulnerable:1b,PersistenceRequired:1b,Tags:[\"{ETIQUETA}\"]}}")
    time.sleep(1.5)

try:
    anota(hab("huir"))                         # pacífico: debe dar «sin amenaza»
    anota(hab("ir_a_jugador nadie_conectado"))  # debe dar «no veo a …»
    for j in range(1, M + 1):
        x, z = punto(); tp(x, z)
        aldeano(x + 2, z)
        rh = anota(hab("huir villager 12", 60))
        rj = anota(hab("ir_a_jugador villager", 120))
        print(f"h{j} ({x},{z}) huir:{rh['causa']} {rh.get('desde', '')}→{rh.get('distancia', '')} · "
              f"ir_a_jugador:{rj['causa']} {rj.get('desde', '')}→{rj.get('distancia', '')}", flush=True)
finally:
    rcon(f"kill @e[type=minecraft:villager,tag={ETIQUETA}]")

# Resumen por habilidad; en JSON van también las muestras [éxito, causa, segundos, pasos] para calibrar entorno_habilidades.py
medidas = {}
for h, rs in registro.items():
    ms = [r["ms"] for r in rs]
    medidas[h] = {"n": len(rs), "exitos": sum(r["exito"] for r in rs),
                  "causas": dict(Counter(re.sub(r":.*", "", r["causa"]) for r in rs)),
                  "s_mediana": round(statistics.median(ms) / 1000, 1), "s_max": round(max(ms) / 1000, 1),
                  "muestras": [[int(r["exito"]), re.sub(r":.*", "", r["causa"]), round(r["ms"] / 1000, 1), r.get("pasos")] for r in rs]}
for h, m in medidas.items():
    print(f"{h:13s} {m['exitos']}/{m['n']} · mediana {m['s_mediana']} s · {m['causas']}")
print(f"RESULTADO cadena (andar → picar → recoger, troncos en el inventario): {cadena_ok}/{N} · "
      f"entran solos al picar: {solos}/{picados}")
Path(__file__).with_name("habilidades_medidas.json").write_text(
    json.dumps({"fecha": time.strftime("%Y-%m-%d %H:%M"), "N": N, "cadena": cadena_ok, "auto": round(solos / max(picados, 1), 2),
                "habilidades": medidas}, ensure_ascii=False))
