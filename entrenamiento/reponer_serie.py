#!/usr/bin/env python3
"""Deja el banco como estaba cuando una serie de medir_ejecutor.py se corta a mitad (RCON de prueba): repone los troncos picados
en los episodios indicados (setblock … keep: solo donde ahora hay aire, sin pisar nada construido después) y devuelve a cada
personaje lo que se le apartó al empezar (ejecutor_apartado.json). Sin --hacer solo lista lo que haría.
Nunca repone dentro de las zonas protegidas por el usuario (../zonas.json): esos troncos solo se cuentan.
Cofre (../cofres.json): lo que la serie guardó en él al empezar («_cofre» en ejecutor_apartado.json) se queda allí, no se devuelve.
Con --cofre, quita del cofre lo que entró durante el episodio cortado (foto de ejecuciones/cofre-episodio.json, que medir_ejecutor.py
toma antes de cada episodio): esos troncos se reponen en el árbol, como lo ganado en el inventario.
Uso: reponer_serie.py SERIE.jsonl ETIQUETA [ETIQUETA…] [--politica guion] [--apartado ejecutor_apartado.json] [--cofre [FOTO]] [--hacer]
     (ETIQUETA: el comienzo de la etiqueta del episodio, p. ej. «p3 (301,8)»)"""
import argparse, json, sys
from collections import Counter
from pathlib import Path

AQUI = Path(__file__).parent
sys.path.insert(0, str(AQUI.parent / "servidor"))
from rcon import rcon
from ejecutor import en_zona
import cofre

OW = "execute in minecraft:overworld"

ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
ap.add_argument("jsonl")
ap.add_argument("etiquetas", nargs="+")
ap.add_argument("--politica")
ap.add_argument("--apartado", default=str(AQUI / "ejecutor_apartado.json"))
ap.add_argument("--sin-apartado", action="store_true", help="no devolver lo apartado")
ap.add_argument("--cofre", nargs="?", const=str(AQUI / "ejecuciones" / "cofre-episodio.json"),
                help="dejar el cofre como en esta foto (por defecto, la del último episodio de medir_ejecutor.py)")
ap.add_argument("--hacer", action="store_true")
a = ap.parse_args()

picados = {}
for linea in open(a.jsonl):
    d = json.loads(linea)
    r = d["resultado"]
    if (any(d["etiqueta"].startswith(e) for e in a.etiquetas) and (not a.politica or d["politica"] == a.politica)
            and d["habilidad"] == "picar_tronco" and r.get("exito") and r.get("pos")):
        picados[tuple(r["pos"])] = r["bloque"]
vedados = {k: b for k, b in picados.items() if en_zona(k[0], k[2])}
picados = {k: b for k, b in picados.items() if k not in vedados}
print(f"en zonas protegidas (no se tocan): {len(vedados)} {dict(Counter(vedados.values()))}")
apartado = {} if a.sin_apartado else json.loads(Path(a.apartado).read_text())
if "_cofre" in apartado:
    print(f"guardado en el cofre al empezar la serie (se queda allí): {apartado['_cofre']}")
apartado = {k: v for k, v in apartado.items() if not k.startswith("_")}
print(f"troncos a reponer: {len(picados)} {dict(Counter(picados.values()))} · a devolver: {apartado}")
foto = None
if a.cofre:
    foto, info = cofre.leer_foto(a.cofre)
    print(f"cofre: foto de {info.get('serie')} «{info.get('etiqueta')}»; entró después {dict(cofre.aumento(foto, cofre.foto()))}")
if not a.hacer:
    sys.exit("(solo lista; con --hacer lo hace)")
puestos = sum("Changed" in rcon(f"{OW} run setblock {x} {y} {z} minecraft:{b} keep") for (x, y, z), b in picados.items())
for nombre, cosas in apartado.items():
    for n, c in cosas.items():
        for k in range(0, c, 64):
            rcon(f"give {nombre} minecraft:{n} {min(64, c - k)}")
print(f"repuestos {puestos} de {len(picados)} (el resto ya no era aire) · devuelto {apartado}")
if foto is not None:
    quitado, avisos = cofre.quitar_aumento(foto)
    print(f"quitado del cofre {dict(quitado)}" + (f" · avisos {avisos}" if avisos else ""))
