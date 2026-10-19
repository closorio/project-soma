#!/usr/bin/env python3
"""Carga del servidor y de los bots mientras se mide (fase D): cada `intervalo` s, CPU (% de un núcleo) y memoria del proceso del
servidor (java … server.jar) y de los bots (node io.js), y el tiempo por tick del servidor (RCON `tick query`, solo lectura: media
y percentiles de los últimos 100 ticks; con más de 50 ms por tick el servidor baja de 20 ticks/s y se notan tirones).
Una línea JSON por muestra en --salida y un resumen al acabar (al cumplirse --segundos o al recibir SIGTERM/SIGINT).
F7.5: --servidor usuario|supervivencia (por defecto IO_SERVIDOR, o el del usuario): el RCON de ese servidor (servidor/rcon.py) y
solo sus procesos: el servidor por su carpeta de trabajo (servidor/ o servidor-supervivencia/) y los bots por su IO_SERVIDOR; así,
con los dos servidores en marcha, cada medida es de uno. --anotar (solo supervivencia) deja el resumen en
mundos/supervivencia/mundo.json («carga»), como pide el plan para el primer arranque.
Uso: medir_carga.py [--segundos 600] [--intervalo 5] [--salida RUTA] [--etiqueta texto] [--servidor S] [--anotar]"""
import argparse, json, os, re, signal, sys, time
from pathlib import Path

import numpy as np

AQUI = Path(__file__).parent
RAIZ = AQUI.resolve().parent
sys.path.insert(0, str(AQUI.parent / "servidor"))
from rcon import rcon

CARPETAS = {"usuario": RAIZ / "servidor", "supervivencia": RAIZ / "servidor-supervivencia"}  # cwd de cada servidor
MUNDO_SV = RAIZ / "mundos" / "supervivencia" / "mundo.json"

HZ = os.sysconf("SC_CLK_TCK")


def mundo_de_bot(pid):
    """El IO_SERVIDOR con el que se lanzó un bot («usuario» si no lo tiene)."""
    try:
        env = Path(f"/proc/{pid}/environ").read_bytes().split(b"\0")
    except OSError:
        return None
    v = next((e.split(b"=", 1)[1].decode() for e in env if e.startswith(b"IO_SERVIDOR=")), "")
    return v or "usuario"


def procesos(servidor="usuario"):
    """{'servidor': [pid], 'bots': [pid…], 'cliente': [pid…]} leyendo /proc (el cliente: el Minecraft del jugador, si está abierto).
    Solo el servidor de `servidor` (por su carpeta de trabajo) y sus bots (por su IO_SERVIDOR)."""
    p = {"servidor": [], "bots": [], "cliente": []}
    for d in Path("/proc").iterdir():
        if not d.name.isdigit():
            continue
        try:
            c = (d / "cmdline").read_bytes().replace(b"\0", b" ").decode(errors="replace")
        except OSError:
            continue
        if "server.jar" in c and "java" in c:
            try:
                cwd = Path(os.readlink(d / "cwd"))
            except OSError:
                continue
            if cwd == CARPETAS[servidor]:
                p["servidor"].append(int(d.name))
        elif "node" in c and "io.js" in c:
            if mundo_de_bot(d.name) == servidor:
                p["bots"].append(int(d.name))
        elif "java" in c and ".minecraft" in c:
            p["cliente"].append(int(d.name))
    return p


def cpu_s(pid):
    try:
        campos = Path(f"/proc/{pid}/stat").read_text().rsplit(")", 1)[1].split()
        return (int(campos[11]) + int(campos[12])) / HZ  # utime + stime
    except (OSError, IndexError):
        return None


def rss_mb(pid):
    try:
        return int(re.search(r"VmRSS:\s+(\d+)", Path(f"/proc/{pid}/status").read_text())[1]) / 1024
    except (OSError, TypeError):
        return None


def ticks(servidor=None):
    """(media, P50, P95, P99) en ms de los últimos 100 ticks."""
    r = rcon("tick query", servidor=servidor)
    m = re.search(r"Average time per tick: ([\d.]+)ms.*P50: ([\d.]+)ms P95: ([\d.]+)ms P99: ([\d.]+)ms", r)
    return tuple(float(v) for v in m.groups()) if m else (None,) * 4


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--segundos", type=float, default=600)
    ap.add_argument("--intervalo", type=float, default=5)
    ap.add_argument("--salida", default=str(AQUI / "ejecuciones" / f"carga-{time.strftime('%Y%m%d-%H%M')}.jsonl"))
    ap.add_argument("--etiqueta", default="")
    ap.add_argument("--servidor", choices=sorted(CARPETAS), default=os.environ.get("IO_SERVIDOR") or "usuario")
    ap.add_argument("--anotar", action="store_true", help="deja el resumen en mundos/supervivencia/mundo.json (solo supervivencia)")
    a = ap.parse_args()
    if a.anotar and a.servidor != "supervivencia":
        ap.error("--anotar solo vale con --servidor supervivencia")
    Path(a.salida).parent.mkdir(exist_ok=True)
    fin = {"ya": False}
    signal.signal(signal.SIGTERM, lambda *_: fin.update(ya=True))
    signal.signal(signal.SIGINT, lambda *_: fin.update(ya=True))
    ps = procesos(a.servidor)
    antes = {k: {pid: cpu_s(pid) for pid in v} for k, v in ps.items()}
    t_antes, t0, muestras = time.time(), time.time(), []
    with open(a.salida, "a") as f:
        while not fin["ya"] and time.time() - t0 < a.segundos:
            time.sleep(a.intervalo)
            ahora, t = {k: {pid: cpu_s(pid) for pid in v} for k, v in ps.items()}, time.time()
            m = {"t": round(t - t0, 1), "etiqueta": a.etiqueta, "servidor": a.servidor}
            for k in ps:
                d = [ahora[k][pid] - antes[k][pid] for pid in ps[k] if ahora[k][pid] is not None and antes[k][pid] is not None]
                m[f"cpu_{k}"] = round(100 * sum(d) / (t - t_antes), 1) if d else None
                m[f"mb_{k}"] = round(sum(rss_mb(pid) or 0 for pid in ps[k])) if ps[k] else None
            m["tick_ms"], m["tick_p50"], m["tick_p95"], m["tick_p99"] = ticks(a.servidor)
            antes, t_antes = ahora, t
            muestras.append(m)
            f.write(json.dumps(m) + "\n"); f.flush()
    res = {"etiqueta": a.etiqueta, "servidor": a.servidor, "muestras": len(muestras), "procesos": ps}
    for c in ("cpu_servidor", "cpu_bots", "cpu_cliente", "mb_servidor", "mb_bots", "tick_ms", "tick_p95", "tick_p99"):
        v = [m[c] for m in muestras if m.get(c) is not None]
        if v:
            res[c] = {"media": round(float(np.mean(v)), 1), "p95": round(float(np.percentile(v, 95)), 1), "max": round(float(max(v)), 1)}
    print("RESULTADO carga: " + json.dumps(res, ensure_ascii=False), flush=True)
    if a.anotar and muestras:
        d = json.loads(MUNDO_SV.read_text())
        mem = [l for l in Path("/proc/meminfo").read_text().splitlines() if l.startswith("MemAvailable:")]
        d["carga"] = {"fecha": time.strftime("%Y-%m-%d %H:%M"), "segundos": round(muestras[-1]["t"]), "bots": len(ps["bots"]),
                      "cliente_abierto": bool(ps["cliente"]), "memoria_disponible_mb_al_acabar": int(mem[0].split()[1]) // 1024 if mem else None,
                      **{k: v for k, v in res.items() if k not in ("procesos", "servidor")}, "salida": os.path.relpath(Path(a.salida).resolve(), RAIZ)}
        MUNDO_SV.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
        print(f"anotado en {MUNDO_SV.relative_to(RAIZ)} (carga)", flush=True)


if __name__ == "__main__":
    main()
