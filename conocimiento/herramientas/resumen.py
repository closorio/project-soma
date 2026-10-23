#!/usr/bin/env python3
"""Resumen corto del vault del equipo (conocimiento/) para el hook SessionStart: fases en curso con responsable y siguiente
paso, las últimas decisiones vigentes y el último experimento. Así cada sesión de Claude arranca con el roadmap delante sin
leer el vault entero. Si no hay vault o algo falla, no imprime nada y sale 0 (un hook nunca debe frenar la sesión).
Uso: resumen.py [RUTA_DEL_VAULT]   (por defecto, la carpeta padre de esta)"""
import sys
from pathlib import Path

import notas

VAULT = Path(__file__).resolve().parent.parent
DECISIONES = 5


def resumen(vault):
    vault = Path(vault)
    L = []
    for p, fm in notas.notas_de(vault, "roadmap"):
        if fm.get("estado") == "en-curso":
            linea = "- %s (%s)" % (p.stem, fm.get("responsable") or "sin responsable")
            if fm.get("siguiente"):
                linea += ": siguiente, %s" % fm["siguiente"]
            L.append(linea)
    if L:
        L.insert(0, "En curso:")
    vigentes = [(fm.get("fecha", ""), p, fm) for p, fm in notas.notas_de(vault, "decisiones") if fm.get("estado", "vigente") == "vigente"]
    vigentes.sort(key=lambda x: (x[0], x[1].name), reverse=True)
    if vigentes:
        L.append("Decisiones recientes: " + "; ".join("[[%s]]%s" % (p.stem, " (%s)" % fm["autor"] if fm.get("autor") else "")
                                                    for _, p, fm in vigentes[:DECISIONES]))
    exps = sorted(((fm.get("fecha", ""), p, fm) for p, fm in notas.notas_de(vault, "experimentos")), key=lambda x: (x[0], x[1].name))
    if exps:
        _, p, fm = exps[-1]
        detalle = ", ".join(x for x in (("%s %s" % (fm.get("metrica", ""), fm.get("valor", ""))).strip(),
                                        fm.get("veredicto", "")) if x)
        L.append("Último experimento: [[%s]]%s" % (p.stem, " (%s)" % detalle if detalle else ""))
    if not L:
        return ""
    return "\n".join(["[Conocimiento del equipo: vault de Obsidian en conocimiento/. Cómo y cuándo escribir en él: CLAUDE.md, "
                      "«Conocimiento compartido».]"] + L)


def main(argv=None):
    argv = sys.argv[1:] if argv is None else argv
    try:
        texto = resumen(Path(argv[0]) if argv else VAULT)
        if texto:
            print(texto)
    except Exception:
        pass
    return 0


if __name__ == "__main__":
    sys.exit(main())
