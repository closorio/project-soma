#!/usr/bin/env python3
"""Parte corto del proyecto (economía de tokens, 2026-10-31): lo que ha pasado en las últimas horas, en ≤ 20 líneas, para que
Claude lea esto en vez de los registros. Lee los registros de bots (servidor-supervivencia/logs/bots-*.log) y de los
servidores (servidor*/logs/consola.log) que cambiaron en ese tiempo, el último nocturno y la última nota de experimento.
Uso: python entrenamiento/parte.py [--horas 24]   (o make report)"""
import argparse, collections, re, time
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
FALLO = re.compile(r"\[hab\] (\S+).*?→ fallo: ([^(]+?)(?: \(\d+ ms\))?$")
MUERTE_SV = re.compile(r"System chat: (\S+) (was .+|drowned|fell .+|died|burned .+|blew up|hit the ground .+|starved .+|suffocated .+|tried to swim in lava.*)$")


def recientes(patron, horas):
    corte = time.time() - horas * 3600
    return [p for p in sorted(RAIZ.glob(patron)) if p.is_file() and p.stat().st_mtime >= corte]


def frontmatter(p):
    d = {}
    for linea in p.read_text(encoding="utf-8", errors="replace").split("---")[1].splitlines() if p.exists() else []:
        if ":" in linea:
            k, v = linea.split(":", 1)
            d[k.strip()] = v.strip().strip('"')
    return d


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--horas", type=float, default=24)
    a = ap.parse_args()
    L = [f"Parte de las últimas {a.horas:g} h ({time.strftime('%Y-%m-%d %H:%M')})"]
    for log in recientes("servidor-supervivencia/logs/bots-*.log", a.horas):
        texto = log.read_text(encoding="utf-8", errors="replace").splitlines()
        kicks = collections.Counter(re.sub(r'.*expulsado: |[\\"{}]|translate:', "", l).replace('translate:', '')[:60] for l in texto if "[mc] expulsado" in l)
        muertes = sum("ha muerto" in l for l in texto)
        fallos = collections.Counter(f"{m.group(1)}: {m.group(2).strip()[:40]}" for l in texto if (m := FALLO.search(l)))
        exitos = sum("→ éxito" in l for l in texto)
        L.append(f"- {log.stem}: {exitos} éxitos, {sum(fallos.values())} fallos, {muertes} muertes, {sum(kicks.values())} expulsiones"
                 + (f" ({kicks.most_common(1)[0][0]})" if kicks else ""))
        if fallos:
            L.append("    fallos más vistos: " + "; ".join(f"{k} ×{n}" for k, n in fallos.most_common(3)))
    for log in recientes("servidor*/logs/consola.log", a.horas):
        texto = log.read_text(encoding="utf-8", errors="replace").splitlines()
        muertes = [m.group(1) + " " + m.group(2)[:40] for l in texto if (m := MUERTE_SV.search(l))]
        aire = sum("standing on air" in l for l in texto)
        L.append(f"- {log.parent.parent.name}: {len(muertes)} muertes" + (f" (última: {muertes[-1]})" if muertes else "")
                 + (f", {aire} avisos «standing on air»" if aire else ""))
    noct = recientes("entrenamiento/ejecuciones/nocturno-*.log", a.horas)
    if noct:
        fin = [l for l in noct[-1].read_text(encoding="utf-8", errors="replace").splitlines() if l.startswith("==")]
        L.append(f"- nocturno {noct[-1].stem[9:]}: " + " · ".join(l.strip("= ") for l in fin[-4:]))
    notas = sorted((RAIZ / "conocimiento" / "experimentos").glob("*.md"))
    if notas:
        f = frontmatter(notas[-1])
        L.append(f"- último experimento: {notas[-1].stem} · {f.get('metrica', '')} {f.get('valor', '')} · veredicto {f.get('veredicto', '?')}")
    print("\n".join(L[:20]))


if __name__ == "__main__":
    main()
