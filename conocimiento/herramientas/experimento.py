#!/usr/bin/env python3
"""Nota de experimento para el vault (conocimiento/experimentos/) a partir de los JSON de medida de entrenamiento/.
Así el resultado viaja por git aunque entrenamiento/ejecuciones/ no lo haga, y se puede comparar en la tabla de Obsidian.
Formatos que entiende:
  - serie medida en Minecraft (medir_ejecutor.py: ejecutor_medido.json o ejecuciones/serie-*.medido.json): troncos por
    episodio de cada variante política · perfil, media ± desviación típica;
  - comparación en el simulador (comparar_politicas.py: comparacion_politicas*.json): nota, fidelidad media al guion y la
    diferencia frente a la referencia.
Uso: experimento.py RUTA.json [--titulo T] [--autor A] [--veredicto mejora|igual|peor|dudoso] [--vault RUTA] [--dry-run]
El autor por defecto es SOMA_AGENTE. No pisa una nota que ya exista (puede tener la conclusión escrita a mano).
Después: rellenar «Conclusión» y «veredicto», y commit + push (ver CLAUDE.md)."""
import argparse, json, os, statistics, sys
from pathlib import Path

import notas

VAULT = Path(__file__).resolve().parent.parent
RAIZ = VAULT.parent


def r1(x):
    return "%.1f" % (x + 1e-9)


def _fecha(datos):
    f = str(datos.get("fecha") or "")
    return f, f[:10], f[11:16].replace(":", "")


def _nota_medida(datos, fuente, autor, titulo, veredicto):
    variantes = {}
    for e in datos["episodios"]:
        variantes.setdefault((e.get("politica", "?"), e.get("perfil") or "-"), []).append(float(e.get("troncos", 0)))
    politicas = list(dict.fromkeys(p for p, _ in variantes))
    claves = list(variantes)
    media = lambda v: statistics.fmean(v)
    sd = lambda v: statistics.stdev(v) if len(v) > 1 else 0.0
    fecha, dia, hm = _fecha(datos)
    titulo = titulo or "ejecutor " + " ".join(politicas)
    base = next((p for p, _ in claves[1:] if p != claves[0][0]), claves[1][1] if len(claves) > 1 else "")
    fm = {"tipo": "experimento", "fecha": fecha, "autor": autor, "titulo": titulo, "entorno": "minecraft",
          "politica": politicas, "N": datos.get("N", ""), "semilla": datos.get("semilla", ""), "metrica": "troncos/episodio",
          "valor": r1(media(variantes[claves[0]])), "base": base, "veredicto": veredicto, "fuente": fuente}
    equipo = ", ".join("%s:%s" % (m.get("nombre"), m.get("puerto")) for m in datos.get("equipo", []))
    L = ["# %s" % titulo, "",
         "Serie medida en Minecraft con `medir_ejecutor.py`: %s s por episodio, %s puntos, semilla %s%s." % (
             datos.get("segundos", "?"), datos.get("N", "?"), datos.get("semilla", "?"), "; equipo " + equipo if equipo else ""),
         "", "| variante | episodios | troncos/episodio |", "|---|---|---|"]
    L += ["| %s · %s | %d | %s ± %s |" % (p, perfil, len(v), r1(media(v)), r1(sd(v))) for (p, perfil), v in variantes.items()]
    return dia, hm, titulo, fm, L


def _nota_comparacion(datos, fuente, autor, titulo, veredicto):
    pol = datos["politicas"]
    mejor = max(pol, key=lambda k: pol[k].get("nota", float("-inf")))
    referencia = next((v["frente_a_referencia"].get("referencia") for v in pol.values() if v.get("frente_a_referencia")), next(iter(pol)))
    fecha, dia, hm = _fecha(datos)
    titulo = titulo or Path(fuente).stem.replace("_", " ")
    fm = {"tipo": "experimento", "fecha": fecha, "autor": autor, "titulo": titulo, "entorno": "simulador",
          "politica": mejor, "N": datos.get("n", ""), "semilla": "", "metrica": "nota", "valor": str(pol[mejor].get("nota", "")),
          "base": referencia, "veredicto": veredicto, "fuente": fuente}
    L = ["# %s" % titulo, "",
         "Comparación en el simulador con `comparar_politicas.py`: %s mundos emparejados por perfil y equipo%s." % (
             datos.get("n", "?"), "; bases " + ", ".join(map(str, datos["bases"])) if datos.get("bases") else ""),
         "", "| política | nota | fidelidad al guion % (media) | R frente a la referencia (perfiles) |", "|---|---|---|---|"]
    for nombre, v in pol.items():
        fid = v.get("fidelidad_guion") or {}
        fid_txt = r1(statistics.fmean(fid.values())) if fid else "—"
        if nombre == referencia:
            frente = "(referencia)"
        elif (v.get("frente_a_referencia") or {}).get("total_perfiles_R"):
            m, e = v["frente_a_referencia"]["total_perfiles_R"][:2]
            frente = "%+.2f ± %.2f" % (m, e)
        else:
            frente = "—"
        L.append("| %s | %s | %s | %s |" % (nombre, v.get("nota", "—"), fid_txt, frente))
    return dia, hm, titulo, fm, L


def nota(datos, fuente, autor, titulo=None, veredicto="pendiente"):
    """(nombre de archivo, texto) de la nota de experimento para esos datos."""
    if isinstance(datos, dict) and isinstance(datos.get("episodios"), list) and datos["episodios"]:
        dia, hm, titulo, fm, L = _nota_medida(datos, fuente, autor, titulo, veredicto)
    elif isinstance(datos, dict) and isinstance(datos.get("politicas"), dict) and datos["politicas"]:
        dia, hm, titulo, fm, L = _nota_comparacion(datos, fuente, autor, titulo, veredicto)
    else:
        raise ValueError("formato desconocido: ni serie medida (episodios) ni comparación (politicas)")
    L += ["", "Fuente: `%s`" % fuente, "", "## Conclusión", "", "(Qué significa, si cambia algo del roadmap y qué se hace después.)", ""]
    nombre = "%s-%s-%s.md" % (dia or "sin-fecha", hm or "0000", notas.babosa(titulo))
    return nombre, notas.a_frontmatter(fm) + "\n".join(L)


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("ruta", type=Path)
    ap.add_argument("--titulo")
    ap.add_argument("--autor", default=os.environ.get("SOMA_AGENTE") or "")
    ap.add_argument("--veredicto", default="pendiente", choices=["pendiente", "mejora", "igual", "peor", "dudoso"])
    ap.add_argument("--vault", type=Path, default=VAULT)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args(argv)
    try:
        fuente = str(a.ruta.resolve().relative_to(RAIZ))
    except ValueError:
        fuente = str(a.ruta)
    try:
        nombre, texto = nota(json.loads(a.ruta.read_text(encoding="utf-8")), fuente, a.autor, a.titulo, a.veredicto)
    except (OSError, ValueError) as e:
        print("ERROR: %s" % e)
        return 1
    if a.dry_run:
        print(texto)
        return 0
    destino = a.vault / "experimentos" / nombre
    if destino.exists():
        print("ERROR: ya existe %s (no la piso: usa --titulo para otra nota)" % destino)
        return 1
    destino.parent.mkdir(parents=True, exist_ok=True)
    destino.write_text(texto, encoding="utf-8")
    print("nota escrita: %s" % destino)
    return 0


if __name__ == "__main__":
    sys.exit(main())
