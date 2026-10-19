#!/usr/bin/env python3
"""Cofres de ../cofres.json (donde los personajes guardan lo recogido, habilidad depositar) vistos por RCON: foto del contenido
hueco a hueco, lo que aumentó entre dos fotos y quitar ese aumento (para que lo guardado durante un episodio de medida, cuyos
troncos se reponen en el árbol, no se quede en el cofre). Solo quita aumentos de huecos que tenían lo mismo o estaban vacíos; nunca
toca lo que ya había ni lo que alguien haya sacado.
Uso: cofre.py [foto]   (lista el contenido de cada cofre)"""
import json, re, sys
from collections import Counter
from pathlib import Path

import mundo

AQUI = Path(__file__).parent
RUTA = mundo.COFRES  # el del mundo de IO_SERVIDOR (mundo.py)
sys.path.insert(0, str(AQUI.parent / "servidor"))
from rcon import rcon

OW = "execute in minecraft:overworld run"


def cofres():
    try:
        return json.loads(RUTA.read_text()).get("cofres", [])
    except (OSError, ValueError):
        return []


def bloques():
    return [tuple(b) for c in cofres() for b in c["bloques"]]


def _items(texto):
    """«[{count: 64, Slot: 0b, id: "minecraft:oak_log"}, …]» → {hueco: (id sin «minecraft:», cantidad)}. Lo que va entre llaves
    anidadas (components) se salta: solo cuentan Slot, id y count del objeto."""
    if "block data:" not in texto:
        raise RuntimeError("RCON: " + texto[:120])
    s = texto.split("block data:", 1)[1].strip()
    out, nivel, actual = {}, 0, ""
    for ch in s:
        if ch == "{":
            nivel += 1
            if nivel == 1:
                actual = ""
            continue
        if ch == "}":
            nivel -= 1
            if nivel == 0:
                slot, ident, n = re.search(r"Slot: (\d+)b", actual), re.search(r'id: "([^"]+)"', actual), re.search(r"count: (\d+)", actual)
                if slot and ident:
                    out[int(slot.group(1))] = (ident.group(1).removeprefix("minecraft:"), int(n.group(1)) if n else 1)
            continue
        if nivel == 1:
            actual += ch
    return out


def foto():
    """{(x, y, z): {hueco: (objeto, cantidad)}} de cada bloque de cofre (un cofre doble son dos bloques con 27 huecos cada uno)."""
    return {b: _items(rcon(f"data get block {b[0]} {b[1]} {b[2]} Items")) for b in bloques()}


def total(f):
    c = Counter()
    for huecos in f.values():
        for n, k in huecos.values():
            c[n] += k
    return c


def aumento(antes, despues):
    """Lo que entró entre dos fotos, por objeto (solo aumentos)."""
    return +(total(despues) - total(antes))


def quitar_aumento(antes):
    """Deja cada hueco como en `antes` si ahora tiene más de lo mismo o tenía nada. Devuelve (quitado por objeto, avisos)."""
    ahora, quitado, avisos = foto(), Counter(), []
    for b, huecos in ahora.items():
        previo = antes.get(b, {})
        for k, (n, c) in huecos.items():
            p = previo.get(k)
            if p is None:
                rcon(f"{OW} item replace block {b[0]} {b[1]} {b[2]} container.{k} with minecraft:air")
                quitado[n] += c
            elif p[0] == n and c > p[1]:
                rcon(f"{OW} data modify block {b[0]} {b[1]} {b[2]} Items[{{Slot:{k}b}}].count set value {p[1]}")
                quitado[n] += c - p[1]
            elif p[0] != n:
                avisos.append(f"{b} hueco {k}: había {p}, ahora {(n, c)} (no se toca)")
    despues = foto()
    for b, huecos in despues.items():
        for k, (n, c) in huecos.items():
            p = antes.get(b, {}).get(k)
            if (p is None or (p[0] == n and c > p[1])):
                avisos.append(f"{b} hueco {k}: no se pudo dejar como estaba ({(n, c)})")
    return quitado, avisos


def guardar_foto(f, ruta, **extra):
    Path(ruta).write_text(json.dumps({**extra, "foto": {",".join(map(str, b)): h for b, h in f.items()}}, ensure_ascii=False))


def leer_foto(ruta):
    d = json.loads(Path(ruta).read_text())
    return {tuple(int(v) for v in b.split(",")): {int(k): tuple(x) for k, x in h.items()} for b, h in d["foto"].items()}, d


if __name__ == "__main__":
    f = foto()
    for c in cofres():
        sub = {b: f[tuple(b)] for b in map(tuple, c["bloques"])}
        llenos = sum(len(h) for h in sub.values())
        print(f"{c['nombre']} {c['bloques'][0]}: {llenos}/{27 * len(c['bloques'])} huecos · {dict(total(sub))}")
