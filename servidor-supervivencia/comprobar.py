#!/usr/bin/env python3
"""Prueba del mundo de supervivencia con un bot temporal, con el servidor ya en marcha (./arrancar.sh):
1. conecta el bot (bot/io.js con IO_SERVIDOR=supervivencia; por defecto Prueba1, puerto de control 3101) y mira que responda;
2. cuenta los árboles que ve (orden `arboles`, ≤ 64 bloques);
3. pone la medianoche y espera a que aparezcan monstruos (RCON) y a que el bot vea alguno con `percibir` (≤ 24 bloques);
4. cierra el bot (kill de su PID), vuelve a poner el día y guarda el mundo. El servidor sigue en marcha: ./parar.sh lo para.
Solo usa órdenes de consulta (nada se apunta en el diario de los personajes). El resultado va a logs/comprobacion-*.json.
Uso: python3 comprobar.py [--nombre Prueba1] [--puerto 3101] [--espera 240]
"""
import argparse, json, os, re, signal, socket, subprocess, sys, time, urllib.parse, urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "servidor"))
from rcon import rcon

MUNDO_SV = os.environ.get("IO_SERVIDOR") or "supervivencia"  # F8: el mismo banco en otro mundo (p. ej. local, 26.1.2)
(Path(__file__).resolve().parent / "logs").mkdir(exist_ok=True)  # registros del banco (ignorados por git)

HOSTILES = ("zombie", "skeleton", "creeper", "spider", "enderman", "witch", "drowned", "husk", "stray", "slime",
            "zombie_villager", "cave_spider", "phantom", "bogged")

def r(cmd):
    return rcon(cmd, servidor=MUNDO_SV)

def orden(puerto, c, t=15):
    try:
        return urllib.request.urlopen(f"http://127.0.0.1:{puerto}/?c=" + urllib.parse.quote(c), timeout=t).read().decode().strip()
    except Exception as e:
        return f"sin respuesta: {e}"

def hostiles_servidor():
    """{tipo: cuántos} de los monstruos cargados en el mundo."""
    n = {}
    for h in HOSTILES:
        m = re.search(r"Count: (\d+)", r(f"execute if entity @e[type=minecraft:{h}]"))  # «Test passed. Count: N» / «Test failed»
        if m:
            n[h] = int(m[1])
    return n

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nombre", default="Prueba1")
    ap.add_argument("--puerto", type=int, default=3101)
    ap.add_argument("--espera", type=int, default=240, help="segundos de noche como mucho")
    a = ap.parse_args()
    try:
        r("list")
    except OSError:
        sys.exit("el servidor de supervivencia no responde por RCON (25576): arráncalo con ./arrancar.sh")
    with socket.socket() as s:
        if s.connect_ex(("127.0.0.1", a.puerto)) == 0:
            sys.exit(f"el puerto de control {a.puerto} ya está ocupado")

    res = {"nombre": a.nombre, "puerto": a.puerto, "inicio": time.strftime("%Y-%m-%d %H:%M:%S")}
    log = open(AQUI / "logs" / f"bot-{a.nombre}.log", "w")
    bot = subprocess.Popen(["node", "io.js", f"{a.nombre}:{a.puerto}"], cwd=AQUI.parent / "bot", stdout=log, stderr=subprocess.STDOUT,
                           env={**os.environ, "IO_SERVIDOR": MUNDO_SV}, start_new_session=True)
    res["pid_bot"] = bot.pid
    try:
        for _ in range(60):  # hasta 60 s para entrar
            time.sleep(1)
            e = orden(a.puerto, "estado")
            if e.startswith("pos "):
                break
        res["estado"] = e
        res["responde"] = e.startswith("pos ")
        print("estado:", e)
        if not res["responde"]:
            return res
        res["arboles"] = orden(a.puerto, "arboles")
        print("árboles:", res["arboles"])
        res["percibir_dia"] = orden(a.puerto, "percibir")

        r("time set 18000")  # medianoche
        t0, vistos = time.time(), []
        while time.time() - t0 < a.espera:
            time.sleep(10)
            res["hostiles_servidor"] = hostiles_servidor()
            p = orden(a.puerto, "percibir")
            ents = p.split("entidades: ", 1)[-1]
            vistos = sorted({h for h in HOSTILES if re.search(rf"\b{h}@", ents)})
            print(f"{time.time() - t0:4.0f} s · en el mundo: {res['hostiles_servidor']} · el bot ve: {vistos or 'ninguno'}")
            if vistos:
                res["percibir_noche"] = p
                break
        res["segundos_noche"] = round(time.time() - t0)
        res["bot_ve_hostiles"] = vistos
        res["estado_final"] = orden(a.puerto, "estado")
    finally:
        os.kill(bot.pid, signal.SIGTERM)  # solo el bot que lanzó este script, por su PID
        try:
            bot.wait(15)
        except subprocess.TimeoutExpired:
            os.kill(bot.pid, signal.SIGKILL)
        r("time set 1000")
        r("save-all flush")
        res["fin"] = time.strftime("%Y-%m-%d %H:%M:%S")
        (AQUI / "logs" / f"comprobacion-{time.strftime('%Y%m%d-%H%M')}.json").write_text(json.dumps(res, ensure_ascii=False, indent=1) + "\n")
    return res

if __name__ == "__main__":
    res = main()
    ok = res.get("responde") and res.get("hostiles_servidor") and res.get("bot_ve_hostiles")
    print("RESUMEN:", "bien" if ok else "incompleto", "· responde:", res.get("responde"), "· monstruos en el mundo:",
          sum((res.get("hostiles_servidor") or {}).values()), "· el bot ve:", res.get("bot_ve_hostiles"))
