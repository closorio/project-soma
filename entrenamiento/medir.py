#!/usr/bin/env python3
"""Pruebas repetibles: tp por RCON a puntos fijos a 12-30 bloques del arbolado (sin agua), luego `cerebro 80`.
Uso: medir.py [N=30] [semilla=42] [--puerto 3001] [--nombre Soma] [--puertos 3001,3002,…] [--excluir X1,Z1,X2,Z2]
Con N=60 el error típico baja de ±8 a ±6 puntos; informa de la proporción con su intervalo.
--puerto/--nombre: el personaje (por defecto Soma en 3001; el nombre, el que dice el bot en ese puerto) para el tp por RCON.
--puertos: varios personajes a la vez (fase D): en cada punto van todos al mismo sitio y lanzan `cerebro 80` a la vez (un hilo
cada uno); cuenta los aciertos de cada uno. --excluir: no usar puntos dentro de ese rectángulo (cambia la serie de puntos).
Tampoco usa puntos dentro de las zonas protegidas del mundo (zonas.json de mundo.py, se relee en cada punto: puede añadir más).
Mundo: el de IO_SERVIDOR (mundo.py): en el del usuario, alrededor del arbolado (303, 32); en el de supervivencia, del campamento o la
aparición (mundo.json). --seco: no manda nada (ni RCON ni órdenes al bot): escribe la serie de puntos sin la comprobación del agua,
que necesita el servidor (sirve para ver que la serie no cambia)."""
import argparse, json, math, random, re, sys, threading, time, urllib.parse, urllib.request
from pathlib import Path
sys.path.insert(0, "/home/seppuq/Documentos/thereisnospoon/laboratorio/mundo-simulado/servidor")
from rcon import rcon
import mundo

def orden(c, t=200, puerto=3001):
    try:
        return urllib.request.urlopen(f"http://127.0.0.1:{puerto}/?c=" + urllib.parse.quote(c), timeout=t).read().decode().strip()
    except Exception as e:
        return "ERROR " + str(e)[:40]

ZONAS = mundo.ZONAS
def en_zona(x, z):
    """¿Cae (x, z) en alguna zona protegida de zonas.json del mundo (bot/zonas.js)?"""
    try:
        zs = json.loads(ZONAS.read_text()).get("zonas", [])
    except (OSError, ValueError):
        return False
    return any(min(q["x1"], q["x2"]) <= x <= max(q["x1"], q["x2"]) and min(q["z1"], q["z2"]) <= z <= max(q["z1"], q["z2"]) for q in zs)

def nombre_de(puerto, defecto="Soma"):
    m = re.search(r'"yo":"([^"]+)"', orden("personajes", 10, puerto))
    return m[1] if m else defecto

ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
ap.add_argument("N", nargs="?", type=int, default=30)
ap.add_argument("semilla", nargs="?", type=int, default=42)
ap.add_argument("--puerto", type=int, default=3001)
ap.add_argument("--nombre")
ap.add_argument("--puertos", help="varios personajes a la vez: 3001,3002,…")
ap.add_argument("--excluir", help="rectángulo X1,Z1,X2,Z2 sin puntos de partida")
ap.add_argument("--seco", action="store_true", help="sin servidor ni bot: solo la serie de puntos (sin la comprobación del agua)")
a = ap.parse_args()
if not mundo.CENTRO:
    raise SystemExit(f"el mundo {mundo.NOMBRE} no tiene centro (mundo.json: aparicion o campamento)")
CX, CZ = mundo.CENTRO
N = a.N
random.seed(a.semilla)
puertos = [int(p) for p in a.puertos.split(",")] if a.puertos else [a.puerto]
nombres = [a.nombre] if a.nombre and len(puertos) == 1 else [f"p{p}" if a.seco else nombre_de(p) for p in puertos]
zona = [int(v) for v in a.excluir.split(",")] if a.excluir else None
fuera = lambda x, z: not zona or not (min(zona[0], zona[2]) <= x <= max(zona[0], zona[2]) and min(zona[1], zona[3]) <= z <= max(zona[1], zona[3]))
ok = {n: 0 for n in nombres}
invalidas = {n: 0 for n in nombres}

def prueba(k, res):
    res[k] = orden("cerebro 80", 420, puertos[k])

for i in range(1, N + 1):
    while True:  # sin puntos de partida en el agua (el mar rodea el arbolado)
        ang, rad = random.uniform(0, 2 * math.pi), random.uniform(12, 30)
        x, z = round(CX + rad * math.cos(ang)), round(CZ + rad * math.sin(ang))
        if fuera(x, z) and not en_zona(x, z) and (a.seco or "passed" not in rcon(f"execute in minecraft:overworld positioned {x} 64 {z} positioned over world_surface if block ~ ~-1 ~ water")):
            break
    if a.seco:
        print(f"{i:2d} ({x},{z}) SECO", flush=True)
        continue
    for p, n in zip(puertos, nombres):
        orden("para", 10, p)
        rcon(f"execute in minecraft:overworld positioned {x} 64 {z} positioned over motion_blocking_no_leaves run tp {n} ~ ~ ~")
    time.sleep(3)
    res = [None] * len(puertos)
    hilos = [threading.Thread(target=prueba, args=(k, res)) for k in range(len(puertos))]
    for h in hilos: h.start()
    for h in hilos: h.join()
    time.sleep(2)
    for k, (n, r) in enumerate(zip(nombres, res)):
        if "picó" in r:
            ok[n] += 1; estado = "OK"
            m = re.search(r"picó (\w+)@(-?\d+),(-?\d+),(-?\d+)", r)  # reponer el tronco: el banco no debe gastar el arbolado
            if m and not en_zona(int(m[2]), int(m[4])): rcon(f"execute in minecraft:overworld run setblock {m[2]} {m[3]} {m[4]} minecraft:{m[1]}")
        elif r.startswith("ERROR") or "sin árbol" in r: invalidas[n] += 1; estado = "INVÁLIDA"
        else: estado = "FALLO"
        quien = f" {n}" if len(puertos) > 1 else ""
        print(f"{i:2d} ({x},{z}){quien} {estado} · {len(r.split())} tokens · {r[:80]}", flush=True)

if a.seco:
    print(f"SECO: {N} puntos del mundo {mundo.NOMBRE} alrededor de ({CX},{CZ}); zonas de {ZONAS}")
    sys.exit()
for n in nombres:
    v = N - invalidas[n]
    p = ok[n] / v if v else 0
    ee = math.sqrt(p * (1 - p) / v) * 100 if v else 0
    quien = f" {n}" if len(puertos) > 1 else ""
    print(f"RESULTADO{quien}: {ok[n]}/{v} válidas ({invalidas[n]} inválidas) · {p*100:.0f} % ± {1.96*ee:.0f} (95 %)")
if len(puertos) > 1:
    v = sum(N - invalidas[n] for n in nombres)
    print(f"RESULTADO conjunto: {sum(ok.values())}/{v} válidas · {100 * sum(ok.values()) / max(v, 1):.0f} %")
