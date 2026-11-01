#!/usr/bin/env python3
"""Cliente RCON de Minecraft (stdlib) con un servidor por mundo, el mismo IO_SERVIDOR que bot/mundo.js y entrenamiento/mundo.py.

    from rcon import rcon        # con sys.path.insert(0, <proyecto>/servidor), como hacen los scripts
    rcon("list")                 # el mundo de IO_SERVIDOR (sin valor: el del usuario)
    rcon("time set day", servidor="local")
    python3 servidor/rcon.py [--servidor S] [--host H] [--puerto N] [--clave-archivo F] ORDEN…

Mundos (puerto RCON y clave):
- usuario: 127.0.0.1:25575, clave en servidor/.rcon (una línea) o en servidor/server.properties.
- supervivencia: 127.0.0.1:25576, clave en servidor-supervivencia/server.properties (rcon.password).
- local (F8): servidor-local/, puerto en mundos/local/mundo.json: rcon.puerto (25577), clave en servidor-local/server.properties.
- companero: host y puerto en mundos/companero/mundo.json: rcon {host, puerto} (sin host, el de servidor.host); la clave solo
  por IO_RCON_CLAVE, IO_RCON_CLAVE_ARCHIVO o rcon.clave_archivo (nunca en el repo).
IO_RCON_HOST, IO_RCON_PUERTO, IO_RCON_CLAVE_ARCHIVO e IO_RCON_CLAVE (y las opciones de la CLI) mandan sobre todo lo anterior.

Una conexión por orden y un cerrojo por servidor entre procesos (flock sobre servidor/.lock-<mundo>): la salida de RCON se
reparte entre las conexiones abiertas a la vez (conocimiento/aprendizajes/RCON compartido entre conexiones.md), así que nunca
hay dos órdenes en vuelo al mismo servidor. Las respuestas largas llegan en varios paquetes: tras la orden se manda un paquete
centinela y se lee hasta su respuesta. Si no conecta lanza OSError (ConnectionError, TimeoutError o PermissionError si la clave
no vale); un mundo desconocido o sin clave lanza ValueError."""
import argparse
import fcntl
import json
import os
import re
import socket
import struct
import sys
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
MUNDOS = {
    "usuario": {"carpeta": AQUI, "puerto": 25575, "clave": [AQUI / ".rcon", AQUI / "server.properties"]},
    "supervivencia": {"carpeta": RAIZ / "servidor-supervivencia", "puerto": 25576,
                      "clave": [RAIZ / "servidor-supervivencia" / "server.properties"]},
    "local": {"carpeta": RAIZ / "servidor-local", "puerto": 25577, "clave": [RAIZ / "servidor-local" / "server.properties"],
              "mundo_json": RAIZ / "mundos" / "local" / "mundo.json"},
    "paper": {"carpeta": RAIZ / "servidor-paper", "puerto": 25580, "clave": [RAIZ / "servidor-paper" / "server.properties"]},
    "companero": {"carpeta": None, "puerto": 25575, "clave": [], "mundo_json": RAIZ / "mundos" / "companero" / "mundo.json"},
}
LOGIN, ORDEN, RESPUESTA = 3, 2, 0
ESPERA_S = 10.0


def _leer_clave(archivo):
    """La clave de un archivo: rcon.password de un server.properties o la primera línea de cualquier otro."""
    p = Path(archivo)
    if not p.is_file():
        return None
    texto = p.read_text(encoding="utf-8")
    if p.name == "server.properties":
        for linea in texto.splitlines():
            if linea.startswith("rcon.password="):
                return linea.split("=", 1)[1].strip() or None
        return None
    return texto.strip().splitlines()[0].strip() if texto.strip() else None


def destino(servidor=None, host=None, puerto=None, clave_archivo=None):
    """(nombre, host, puerto, clave) del servidor pedido; ValueError si el mundo no existe o no hay clave."""
    nombre = servidor or os.environ.get("IO_SERVIDOR") or "usuario"
    if nombre not in MUNDOS:
        raise ValueError(f"IO_SERVIDOR desconocido: {nombre!r} ({', '.join(MUNDOS)})")
    m = MUNDOS[nombre]
    datos = {}
    if m.get("mundo_json") and m["mundo_json"].is_file():
        d = json.loads(m["mundo_json"].read_text(encoding="utf-8"))
        datos = {**(d.get("rcon") or {}), "_host_juego": (d.get("servidor") or {}).get("host")}
    h = host or os.environ.get("IO_RCON_HOST") or datos.get("host") or (
        datos.get("_host_juego") if nombre == "companero" else None) or "127.0.0.1"
    p = int(puerto or os.environ.get("IO_RCON_PUERTO") or datos.get("puerto") or m["puerto"])
    clave = os.environ.get("IO_RCON_CLAVE")
    archivos = [clave_archivo or os.environ.get("IO_RCON_CLAVE_ARCHIVO") or datos.get("clave_archivo")]
    for a in [x for x in archivos if x] + m["clave"]:
        if clave:
            break
        clave = _leer_clave(Path(a) if Path(a).is_absolute() else RAIZ / a)
    if not clave:
        raise ValueError(f"mundo {nombre}: no hay clave RCON (IO_RCON_CLAVE, IO_RCON_CLAVE_ARCHIVO o "
                         f"{', '.join(str(c.relative_to(RAIZ)) for c in m['clave']) or 'rcon.clave_archivo en mundo.json'})")
    return nombre, h, p, clave


def _paquete(ident, tipo, cuerpo):
    datos = struct.pack("<ii", ident, tipo) + cuerpo.encode("utf-8") + b"\x00\x00"
    return struct.pack("<i", len(datos)) + datos


def _recibir(s, n):
    trozos = b""
    while len(trozos) < n:
        t = s.recv(n - len(trozos))
        if not t:
            raise ConnectionError("el servidor cerró la conexión RCON")
        trozos += t
    return trozos


def _leer_paquete(s):
    (largo,) = struct.unpack("<i", _recibir(s, 4))
    ident, tipo = struct.unpack("<ii", _recibir(s, 8))
    cuerpo = _recibir(s, largo - 8)
    return ident, tipo, cuerpo[:-2].decode("utf-8", errors="replace")


def rcon(cmd, servidor=None, host=None, puerto=None, clave_archivo=None):
    """Manda una orden al RCON del mundo y devuelve la respuesta (texto entero, aunque llegue en varios paquetes)."""
    nombre, h, p, clave = destino(servidor, host, puerto, clave_archivo)
    cerrojo = AQUI / f".lock-{nombre}"
    with open(cerrojo, "a") as fc:
        fcntl.flock(fc, fcntl.LOCK_EX)
        try:
            with socket.create_connection((h, p), timeout=ESPERA_S) as s:
                s.sendall(_paquete(1, LOGIN, clave))
                ident, _, _ = _leer_paquete(s)
                if ident == -1:
                    raise PermissionError(f"RCON {h}:{p}: la clave no vale")
                s.sendall(_paquete(2, ORDEN, cmd))
                s.sendall(_paquete(3, RESPUESTA, ""))  # centinela: su respuesta llega después de todos los trozos de la orden
                partes = []
                while True:
                    ident, _, cuerpo = _leer_paquete(s)
                    if ident == 3:
                        break
                    if ident == 2:
                        partes.append(cuerpo)
                return "".join(partes)
        finally:
            fcntl.flock(fc, fcntl.LOCK_UN)



def hora(servidor=None, r=None):
    """(día, ticks del día 0-23999) del mundo, en 1.21.11 y en 26.1; (None, None) si no se entiende la respuesta.
    1.21.11: «time query daytime» → «The time is N» y «time query day» → «The time is D» (el número de día).
    26.1 (relojes y «timelines»): «time query daytime» ya no existe; «time query time» → «Clock minecraft:overworld is at N»,
    el reloj acumulado del mundo (lo que cambia `time set`), así que día = N // 24000 y ticks = N % 24000 («time query day» da
    solo los ticks del día). `r`: otra función para mandar órdenes (el RCON de mentira de las pruebas en seco)."""
    r = r or (lambda c: rcon(c, servidor))
    t = r("time query daytime")
    m = re.search(r"The time is (\d+)", t)
    if m:
        d = re.search(r"The time is (\d+)", r("time query day"))
        return (int(d[1]) if d else None), int(m[1])
    m = re.search(r"is at (-?\d+) tick", r("time query time"))
    if not m:
        return None, None
    n = int(m[1])
    return n // 24000, n % 24000

def main():
    a = argparse.ArgumentParser(description="Manda una orden al RCON de un mundo (IO_SERVIDOR por defecto).")
    a.add_argument("--servidor", choices=list(MUNDOS))
    a.add_argument("--host")
    a.add_argument("--puerto", type=int)
    a.add_argument("--clave-archivo")
    a.add_argument("orden", nargs="+")
    x = a.parse_args()
    try:
        print(rcon(" ".join(x.orden), x.servidor, x.host, x.puerto, x.clave_archivo))
    except (OSError, ValueError) as e:
        sys.exit(f"rcon: {e}")


if __name__ == "__main__":
    main()
