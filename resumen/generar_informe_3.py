#!/usr/bin/env python3
"""Genera resumen/informe_3_avance_2026-11-03.html (Informe 3 del Experimento A). Gráficos en SVG inline, sin dependencias."""
import json, statistics as st
from pathlib import Path
from datetime import date

RAIZ = Path("/home/seppuq/Documentos/thereisnospoon/project-soma")
OUT = RAIZ / "resumen" / "informe_3_avance_2026-11-03.html"
GATHER = json.loads((RAIZ / "servidor-supervivencia/logs/conseguir-20261102-2257.json").read_text())

AZUL, AZUL2, GRIS, NAR, VERDE, ROJO, TINTA = "#3b6fb6", "#9db8de", "#c9d3e3", "#d99a2b", "#3f9a5b", "#c0504d", "#1d2330"
FONT = 'font-family="DejaVu Sans, Liberation Sans, Arial, sans-serif"'


def esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def svg(w, h, cuerpo):
    return (f'<svg viewBox="0 0 {w} {h}" width="100%" xmlns="http://www.w3.org/2000/svg" {FONT} font-size="11">'
            '<defs><marker id="fl" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">'
            f'<path d="M0,0 L10,5 L0,10 z" fill="#5a6577"/></marker></defs>{cuerpo}</svg>')


def txt(x, y, s, size=11, anchor="start", color=TINTA, peso="normal"):
    return f'<text x="{x}" y="{y}" font-size="{size}" text-anchor="{anchor}" fill="{color}" font-weight="{peso}">{esc(s)}</text>'


def caja(x, y, w, h, lineas, fondo="#eef2f9", borde=AZUL, size=10.5, r=6):
    out = f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fondo}" stroke="{borde}" stroke-width="1.3"/>'
    n = len(lineas)
    for i, l in enumerate(lineas):
        yy = y + h / 2 + (i - (n - 1) / 2) * (size + 3) + size * 0.35
        out += txt(x + w / 2, yy, l, size, "middle", peso="bold" if i == 0 else "normal")
    return out


def flecha(x1, y1, x2, y2, color="#5a6577", guion=False, ancho=1.3):
    d = ' stroke-dasharray="4 3"' if guion else ""
    return f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="{ancho}"{d} marker-end="url(#fl)"/>'


def figura(svgtxt, pie):
    return f'<figure>{svgtxt}<figcaption>{pie}</figcaption></figure>'


# ---------- Fig. 1: línea temporal (Gantt) ----------
def gantt():
    d0 = date(2026, 10, 18)
    dias = 17  # 18-10 … 03-11
    filas = [
        ("F7 · cierre de la supervivencia", [(18, 23)], AZUL2),
        ("Vault de conocimiento y trabajo a dos", [(23, 33)], AZUL),
        ("F8.0 · fundación de habilidades", [(23, 24)], AZUL),
        ("F8.1 · rol Casual y banco K", [(25, 25)], NAR),
        ("Asistente en 26.3 (ViaProxy, Paper)", [(31, 32)], AZUL),
        ("Mundo compartido: zonas y carteles", [(31, 33)], AZUL2),
        ("Catálogo de estructuras", [(33, 33)], VERDE),
        ("Recolector «consigue» y rol Minero", [(33, 34)], ROJO),
    ]
    hitos = [(23, "plan F8"), (25, "medida 9: 3/8"), (31, "tokens"), (31.6, "A0 7/7"), (33, "castillo 5/7"), (34, "banco minero")]
    x0, w, fh, top = 230, 470, 24, 36

    def X(dia):  # dia: 18..34 (31 = 31-oct, 32 = 1-nov, 33 = 2-nov, 34 = 3-nov)
        return x0 + (dia - 18) / dias * w
    c = ""
    for i in range(dias + 1):
        dia = 18 + i
        etq = f"{dia}" if dia <= 31 else f"{dia - 31}"
        c += f'<line x1="{X(dia)}" y1="{top - 6}" x2="{X(dia)}" y2="{top + fh * len(filas)}" stroke="#e6ebf3"/>'
        if i < dias:
            c += txt(X(dia) + w / dias / 2, top - 10, etq, 9, "middle", "#6b7587")
    c += txt(X(18), 12, "octubre", 9.5, "start", "#6b7587") + txt(X(32), 12, "noviembre", 9.5, "start", "#6b7587")
    for k, (nom, tramos, col) in enumerate(filas):
        y = top + k * fh
        c += txt(x0 - 8, y + fh / 2 + 4, nom, 10.5, "end")
        for a, b in tramos:
            c += f'<rect x="{X(a) + 1}" y="{y + 5}" width="{X(b + 1) - X(a) - 2}" height="{fh - 10}" rx="3" fill="{col}"/>'
    yh = top + fh * len(filas) + 14
    for dia, et in hitos:
        xx = X(dia) + w / dias / 2
        c += f'<path d="M{xx},{yh - 5} l5,5 l-5,5 l-5,-5 z" fill="{TINTA}"/>'
    c += txt(x0 - 8, yh + 4, "hitos", 10.5, "end", "#6b7587")
    for i, (dia, et) in enumerate(hitos):
        xx = X(dia) + w / dias / 2
        c += txt(xx, yh + 20 + (i % 3) * 11, et, 8.8, "middle", "#3b4658")
    return svg(720, yh + 56, c)


# ---------- Fig. 2: banco K ----------
def banco_k():
    med = [("Medida 7", 0, 4), ("Medida 8", 1, 8), ("Medida 9", 3, 8), ("Medida 10 (base fija)", 2, 8)]
    x0, y0, alto, ancho = 60, 20, 170, 110
    c = ""
    for p in (0, 25, 50, 75, 100):
        y = y0 + alto - alto * p / 100
        c += f'<line x1="{x0}" y1="{y}" x2="{x0 + 4 * (ancho + 30)}" y2="{y}" stroke="#e6ebf3"/>' + txt(x0 - 6, y + 4, f"{p} %", 9, "end", "#6b7587")
    for i, (n, b, de) in enumerate(med):
        x = x0 + 20 + i * (ancho + 30)
        h = alto * b / de
        c += f'<rect x="{x}" y="{y0 + alto - h}" width="{ancho}" height="{max(h, 1.5)}" fill="{AZUL}" rx="2"/>'
        c += txt(x + ancho / 2, y0 + alto - h - 6, f"{b}/{de}", 11, "middle", peso="bold")
        c += txt(x + ancho / 2, y0 + alto + 16, n, 10, "middle")
    yc = y0 + alto - alto * 0.75
    c += f'<line x1="{x0}" y1="{yc}" x2="{x0 + 4 * (ancho + 30)}" y2="{yc}" stroke="{ROJO}" stroke-width="1.6" stroke-dasharray="6 4"/>'
    c += txt(x0 + 4 * (ancho + 30), yc - 6, "criterio fijado antes de medir: ≥ 6/8", 10, "end", ROJO, "bold")
    return svg(640, y0 + alto + 30, c)


# ---------- Fig. 3: arquitectura cuerpo / capataz / mente ----------
def capas():
    c = ""
    c += caja(20, 20, 200, 60, ["Mente (IA grande)", "metas de largo plazo", "cara: se usa poco"], "#fff7e8", NAR)
    c += caja(20, 110, 200, 60, ["Capataz (guion)", "elige la siguiente etapa", "gratis: sin IA"], "#eef2f9", AZUL)
    c += caja(20, 200, 200, 60, ["Cuerpo (red + reflejos)", "habilidades: talar, cavar…", "rápido: decenas por segundo"], "#eaf5ee", VERDE)
    c += flecha(120, 80, 120, 108) + flecha(120, 170, 120, 198)
    c += flecha(232, 215, 232, 150, guion=True) + txt(240, 262, "el resultado sube como {éxito, causa}", 9.5, "start", "#5a6577")
    c += caja(380, 110, 300, 60, ["Mundo de Minecraft", "servidor propio, local o compartido"], "#f4f4f4", "#8a94a6")
    c += flecha(220, 230, 378, 150) + flecha(378, 130, 222, 140, guion=True)
    c += txt(300, 125, "observa", 9.5, "middle", "#5a6577") + txt(300, 250, "actúa", 9.5, "middle", "#5a6577")
    return svg(700, 275, c)


# ---------- Fig. 4: etapas del rol Minero ----------
def etapas_minero():
    et = [("madera", 0, 0), ("herramientas", 1, 0), ("piedra", 2, 0), ("herr. piedra", 3, 0), ("comida", 4, 0),
          ("carbón", 0, 1), ("antorchas ×32", 1, 1), ("hierro", 2, 1), ("pico hierro", 3, 1), ("pozo a y=0", 4, 1),
          ("hierro ×32", 0, 2), ("deepslate", 1, 2), ("diamante ×3", 2, 2), ("pico diamante", 3, 2), ("redstone ×32", 4, 2)]
    w, h, gx, gy, x0, y0 = 112, 34, 136, 70, 16, 18
    c = ""
    pos = {}
    for n, (nom, col, fila) in enumerate(et):
        x = x0 + col * gx
        y = y0 + fila * gy
        pos[n] = (x, y)
        fondo = "#eaf5ee" if fila == 0 else ("#eef2f9" if fila == 1 else "#fdeeee")
        borde = VERDE if fila == 0 else (AZUL if fila == 1 else ROJO)
        c += caja(x, y, w, h, [f"{n + 1}. {nom}"], fondo, borde, 10)
    for n in range(len(et) - 1):
        (x1, y1), (x2, y2) = pos[n], pos[n + 1]
        if y1 == y2:
            c += flecha(x1 + w, y1 + h / 2, x2 - 2, y2 + h / 2)
        else:
            c += f'<path d="M{x1 + w / 2},{y1 + h} V{y1 + h + 18} H{x2 + w / 2} V{y2 - 4}" fill="none" stroke="#5a6577" stroke-width="1.3" marker-end="url(#fl)"/>'
    c += txt(x0, y0 + 3 * gy + 6, "verde: lo básico · azul: equiparse y bajar · rojo: los minerales profundos (cada etapa es una orden «consigue»)",
             9.5, "start", "#5a6577")
    return svg(700, y0 + 3 * gy + 14, c)


# ---------- Fig. 5: árbol de submetas de «consigue 1 diamante» ----------
def arbol():
    c = ""
    N = {
        "dia": (285, 10, ["consigue 1 diamante"]), "pico": (60, 85, ["pico de hierro"]), "ant": (285, 85, ["antorchas", "(cota < 30)"]),
        "bajar": (500, 85, ["bajar a y = −58", "escalera + túnel"]), "lin": (20, 165, ["3 lingotes"]), "pal": (160, 165, ["palos + mesa"]),
        "carb": (300, 165, ["carbón"]), "lava": (500, 165, ["tapar lava/agua", "antes de abrir"]), "crudo": (20, 240, ["hierro crudo"]),
        "horno": (300, 240, ["horno + combustible"]), "ppiedra": (20, 315, ["pico de piedra"]), "made": (160, 315, ["madera (talar)"]),
    }
    W, H = 130, 44
    for a, b in [("dia", "pico"), ("dia", "ant"), ("dia", "bajar"), ("pico", "lin"), ("pico", "pal"), ("ant", "carb"), ("ant", "pal"),
                 ("bajar", "lava"), ("lin", "crudo"), ("lin", "horno"), ("crudo", "ppiedra"), ("ppiedra", "made"), ("pal", "made")]:
        xa, ya, _ = N[a]
        xb, yb, _ = N[b]
        if ya == yb:
            c += flecha(xa + W, ya + H / 2, xb - 2, yb + H / 2)
        else:
            c += flecha(xa + W / 2, ya + H, xb + W / 2, yb - 2)
    c += flecha(365, 240, 365, 211)
    for k, (x, y, l) in N.items():
        fondo, borde = ("#fdeeee", ROJO) if k == "dia" else (("#fff7e8", NAR) if k in ("lava", "bajar") else ("#eef2f9", AZUL))
        c += caja(x, y, W, H, l, fondo, borde, 10)
    c += txt(600, 250, "Se resuelve de abajo arriba:", 10, "middle", "#3b4658", "bold")
    for i, s in enumerate(["el bot mira su inventario,", "toma la primera necesidad sin", "cubrir y la apila como submeta;",
                           "al cumplirla, vuelve a la de arriba."]):
        c += txt(600, 266 + i * 14, s, 10, "middle", "#3b4658")
    return svg(700, 365, c)


# ---------- Fig. 6: cotas de las menas ----------
def cotas():
    menas = [("carbón", 40, "#3a3a3a"), ("cobre", 48, "#c46a3b"), ("hierro", 16, "#b98a63"), ("lapislázuli", 0, "#2f55b5"),
             ("oro", -16, "#d4aa1c"), ("redstone", -58, "#c0392b"), ("diamante", -58, "#2bb3b1")]
    x0, w, y0, alto = 70, 560, 14, 230
    ymax, ymin = 80, -64

    def Y(v):
        return y0 + (ymax - v) / (ymax - ymin) * alto
    c = f'<rect x="{x0}" y="{Y(64)}" width="{w}" height="{Y(0) - Y(64)}" fill="#f2efe8"/>'
    c += f'<rect x="{x0}" y="{Y(0)}" width="{w}" height="{Y(-64) - Y(0)}" fill="#e4e6ea"/>'
    c += f'<rect x="{x0}" y="{Y(80)}" width="{w}" height="{Y(64) - Y(80)}" fill="#eaf3fb"/>'
    for v in (64, 40, 16, 0, -16, -40, -58):
        c += txt(x0 - 6, Y(v) + 4, f"y={v}", 9, "end", "#6b7587")
        c += f'<line x1="{x0}" y1="{Y(v)}" x2="{x0 + w}" y2="{Y(v)}" stroke="#d6dbe4" stroke-dasharray="2 3"/>'
    c += txt(x0 + w - 6, Y(72) + 4, "superficie", 9.5, "end", "#3b6fb6") + txt(x0 + w - 6, Y(56), "piedra", 9.5, "end", "#8a7d62")
    c += txt(x0 + 8, Y(-46), "pizarra profunda (deepslate)", 9.5, "start", "#5a6577")
    paso = w / (len(menas) + 1)
    for i, (n, y, col) in enumerate(menas):
        x = x0 + paso * (i + 1)
        c += f'<line x1="{x}" y1="{Y(64)}" x2="{x}" y2="{Y(y)}" stroke="{col}" stroke-width="2" marker-end="url(#fl)"/>'
        c += f'<circle cx="{x}" cy="{Y(y)}" r="6" fill="{col}"/>' + txt(x, Y(y) + 20, n, 10, "middle", peso="bold")
    return svg(700, y0 + alto + 14, c)


# ---------- Fig. 7: resultados del recolector ----------
def recolector():
    nombres = {"hierro": "hierro ×6", "lapis": "lapislázuli ×6", "oro": "oro ×4", "redstone": "redstone ×8"}
    pr = GATHER["pruebas"]
    c = ""
    # barras de éxito (izquierda)
    x0, y0, fh = 110, 20, 34
    c += txt(x0, 12, "Éxitos por material (provisional)", 10.5, "start", peso="bold")
    for i, (k, n) in enumerate(nombres.items()):
        rs = pr.get(k, [])
        y = y0 + 8 + i * fh
        c += txt(x0 - 6, y + 15, n, 10, "end")
        for j in range(5):
            if j < len(rs):
                col = VERDE if rs[j]["ok"] else ROJO
                c += f'<rect x="{x0 + j * 30}" y="{y}" width="26" height="22" rx="3" fill="{col}"/>'
            else:
                c += f'<rect x="{x0 + j * 30}" y="{y}" width="26" height="22" rx="3" fill="#fff" stroke="{GRIS}" stroke-dasharray="3 2"/>'
        ok = sum(x["ok"] for x in rs)
        c += txt(x0 + 158, y + 15, f"{ok}/{len(rs)}", 10.5, "start", peso="bold")
    c += txt(x0, y0 + 8 + 4 * fh + 6, "verde: éxito · rojo: fallo · hueco: falta medir", 9, "start", "#6b7587")
    # tiempos (derecha): puntos por intento y mediana
    X0, W = 420, 260
    tmax = 1300
    c += txt(X0, 12, "Duración de cada intento (minutos)", 10.5, "start", peso="bold")
    for m in (0, 5, 10, 15, 20):
        x = X0 + m * 60 / tmax * W
        c += f'<line x1="{x}" y1="{y0}" x2="{x}" y2="{y0 + 4 * fh + 8}" stroke="#e6ebf3"/>' + txt(x, y0 + 4 * fh + 20, str(m), 9, "middle", "#6b7587")
    for i, (k, n) in enumerate(nombres.items()):
        rs = pr.get(k, [])
        y = y0 + 8 + i * fh + 11
        for r in rs:
            x = X0 + r["s"] / tmax * W
            c += f'<circle cx="{x}" cy="{y}" r="4.5" fill="{VERDE if r["ok"] else ROJO}" fill-opacity="0.85"/>'
        if rs:
            med = st.median(r["s"] for r in rs)
            xm = X0 + med / tmax * W
            c += f'<line x1="{xm}" y1="{y - 9}" x2="{xm}" y2="{y + 9}" stroke="{TINTA}" stroke-width="2"/>'
    c += txt(X0, y0 + 4 * fh + 34, "punto: un intento · raya negra: mediana", 9, "start", "#6b7587")
    return svg(700, y0 + 4 * fh + 42, c)


# ---------- Fig. 8: túnel que tapa la lava ----------
def tunel():
    c = ""
    s = 26
    x0, y0 = 40, 30

    def celda(cx, cy, col, et=""):
        r = f'<rect x="{x0 + cx * s}" y="{y0 + cy * s}" width="{s}" height="{s}" fill="{col}" stroke="#ffffff"/>'
        return r + (txt(x0 + cx * s + s / 2, y0 + cy * s + s / 2 + 4, et, 9, "middle", "#fff", "bold") if et else "")
    for paso, ox in enumerate((0, 9)):
        for cx in range(8):
            for cy in range(4):
                col = "#9aa0a8"
                if cy in (1, 2) and cx < 4:
                    col = "#f7f2e6"
                c += celda(ox + cx, cy, col)
        c += celda(ox + 4, 1, "#c0504d" if paso == 0 else "#7d828a", "?" if paso == 0 else "")
        c += celda(ox + 5, 1, "#e8702a", "lava")
        c += celda(ox + 5, 2, "#e8702a", "lava")
        if paso == 1:
            c += celda(ox + 4, 1, "#f7f2e6") + celda(ox + 4, 2, "#f7f2e6")
            c += celda(ox + 5, 1, "#6d6d6d", "P") + celda(ox + 5, 2, "#6d6d6d", "P")
        c += f'<circle cx="{x0 + (ox + 3) * s + s / 2}" cy="{y0 + 2 * s + s / 2 - 4}" r="8" fill="{AZUL}"/>'
    c += txt(x0 + 4 * s, y0 - 10, "1. Mira las vecinas antes de abrir", 10, "middle", peso="bold")
    c += txt(x0 + 13 * s, y0 - 10, "2. Tapa con piedra y avanza", 10, "middle", peso="bold")
    c += flecha(x0 + 8 * s + 4, y0 + 2 * s, x0 + 9 * s - 4, y0 + 2 * s, ancho=2)
    c += txt(x0, y0 + 4 * s + 20, "azul: el bot · crema: túnel abierto · gris: roca · naranja: lava · P: piedra puesta por el bot",
             9.5, "start", "#5a6577")
    return svg(700, y0 + 4 * s + 30, c)


# ---------- Fig. 9: construir por capas ----------
def capas_obra():
    c = ""
    s = 14
    planos = [  # capa 1 (suelo), capa 2 (paredes con puerta), capa 3 (tejado)
        ["#########", "#########", "#########", "#########", "#########", "#########"],
        ["#########", "#.......#", "#.......#", "#.......#", "#.......#", "####D####"],
        ["TTTTTTTTT", "TTTTTTTTT", "TTTTTTTTT", "TTTTTTTTT", "TTTTTTTTT", "TTTTTTTTT"],
    ]
    col = {"#": "#a98b5f", ".": "#ffffff", "D": "#6b4a2b", "T": "#8b3a3a"}
    for k, pl in enumerate(planos):
        ox, oy = 30 + k * 165, 40
        c += txt(ox + 4.5 * s, oy - 12, ["capa 1 · suelo", "capa 2 · paredes y puerta", "capa 3 · tejado"][k], 10, "middle", peso="bold")
        for j, fila in enumerate(pl):
            for i, ch in enumerate(fila):
                c += f'<rect x="{ox + i * s}" y="{oy + j * s}" width="{s}" height="{s}" fill="{col[ch]}" stroke="#e8e2d6"/>'
        if k < 2:
            c += flecha(ox + 9 * s + 6, oy + 3 * s, ox + 165 - 8, oy + 3 * s)
    ox = 520
    c += txt(ox + 80, 28, "Orden de colocación", 10, "middle", peso="bold")
    for i, l in enumerate(["1. de abajo arriba, capa a capa", "2. lo que cuelga, tras su soporte", "3. andamio si la capa queda alta",
                           "4. pide al cofre lo que falta", "5. la madera es intercambiable"]):
        c += txt(ox, 50 + i * 16, l, 10, "start", "#3b4658")
    return svg(700, 135, c)


# ---------- Fig. 10: trabajo a dos ----------
def a_dos():
    c = ""
    c += caja(20, 20, 150, 50, ["Persona A (seppuq)"], "#fff", "#8a94a6") + caja(530, 20, 150, 50, ["Persona B (count)"], "#fff", "#8a94a6")
    c += caja(20, 110, 150, 50, ["Agente de A", "Claude Code"], "#eef2f9", AZUL) + caja(530, 110, 150, 50, ["Agente de B", "Claude Code"], "#eef2f9", AZUL)
    c += caja(255, 95, 190, 80, ["Vault (Obsidian)", "decisiones · experimentos", "aprendizajes · roadmap · diarios"], "#eaf5ee", VERDE)
    c += caja(255, 205, 190, 40, ["Hub en tiempo real (en pausa)"], "#f4f4f4", "#b6bcc8")
    c += caja(255, 20, 190, 44, ["git: rama develop · PR"], "#fff7e8", NAR)
    c += flecha(95, 70, 95, 108) + flecha(605, 70, 605, 108)
    c += flecha(170, 135, 253, 135) + flecha(530, 135, 447, 135) + flecha(253, 145, 172, 145) + flecha(447, 145, 528, 145)
    c += flecha(350, 93, 350, 66) + flecha(170, 120, 253, 50, guion=True) + flecha(530, 120, 447, 50, guion=True)
    c += f'<line x1="170" y1="155" x2="255" y2="225" stroke="#b6bcc8" stroke-dasharray="3 3"/><line x1="530" y1="155" x2="445" y2="225" stroke="#b6bcc8" stroke-dasharray="3 3"/>'
    return svg(700, 255, c)


# ---------- Fig. 11: qué corre dónde ----------
def coste():
    c = ""
    c += caja(20, 20, 300, 150, [], "#eaf5ee", VERDE)
    c += txt(170, 42, "En la máquina del usuario (gratis)", 11, "middle", peso="bold")
    for i, l in enumerate(["servidores de Minecraft", "bots y capataz (guion)", "entrenamiento de redes (CPU)", "bancos nocturnos (make nightly)",
                           "informes de una línea (make report)"]):
        c += txt(40, 66 + i * 20, "• " + l, 10.5)
    c += caja(380, 20, 300, 150, [], "#fff7e8", NAR)
    c += txt(530, 42, "Con Claude (cuesta cupo)", 11, "middle", peso="bold")
    for i, l in enumerate(["diseñar una fase", "escribir el código", "leer el veredicto, no el registro", "decidir el siguiente paso",
                           "(la mente de Alma, solo a petición)"]):
        c += txt(400, 66 + i * 20, "• " + l, 10.5)
    c += flecha(322, 80, 378, 80) + txt(350, 72, "veredicto", 9, "middle", "#5a6577")
    c += flecha(378, 120, 322, 120) + txt(350, 135, "código", 9, "middle", "#5a6577")
    return svg(700, 185, c)


# ---------- tabla de tiempos del recolector ----------
def tabla_recolector():
    nombres = {"hierro": "Hierro", "lapis": "Lapislázuli", "oro": "Oro", "redstone": "Redstone", "diamante": "Diamante", "cero": "Diamante desde cero"}
    pide = {"hierro": 6, "lapis": 6, "oro": 4, "redstone": 8, "diamante": 2, "cero": 1}
    filas = ""
    for k, n in nombres.items():
        rs = GATHER["pruebas"].get(k, [])
        if rs:
            ts = [r["s"] / 60 for r in rs]
            filas += (f"<tr><td>{n}</td><td class='num'>{pide[k]}</td><td class='num'>{sum(r['ok'] for r in rs)}/{len(rs)}</td>"
                      f"<td class='num'>{min(ts):.1f}</td><td class='num'>{st.median(ts):.1f}</td><td class='num'>{max(ts):.1f}</td>"
                      f"<td>{'pasa' if sum(r['ok'] for r in rs) >= 0.8 * len(rs) else 'no pasa'}{' (faltan ' + str(5 - len(rs)) + ')' if len(rs) < 5 else ''}</td></tr>")
        else:
            filas += f"<tr><td>{n}</td><td class='num'>{pide[k]}</td><td class='num'>—</td><td></td><td></td><td></td><td>sin medir</td></tr>"
    return ("<table><tr><th>Material</th><th>Pide</th><th>Éxitos</th><th>mín. (min)</th><th>mediana</th><th>máx.</th><th>Criterio ≥ 4/5</th></tr>"
            + filas + "</table>")


CSS = """
@page { size: A4; margin: 16mm 16mm 18mm; }
*{box-sizing:border-box}
body{font-family:"DejaVu Sans","Liberation Sans",Arial,sans-serif;font-size:10.3pt;line-height:1.5;color:#1d2330;background:#fff}
h1{font-size:23pt;margin:0 0 3pt;color:#0f2a4a;line-height:1.15}
.sub{color:#5a6577;margin-bottom:10pt;font-size:10.5pt}
h2{font-size:14pt;color:#0f2a4a;border-bottom:1.6px solid #c9d3e3;padding-bottom:2pt;margin:16pt 0 6pt;page-break-after:avoid}
h3{font-size:11pt;margin:9pt 0 2pt;color:#23406b;page-break-after:avoid}
p{margin:4pt 0;text-align:justify}
.caja{background:#f4f7fc;border-left:4px solid #3b6fb6;padding:6pt 10pt;margin:8pt 0;page-break-inside:avoid}
.aviso{background:#fff7e8;border-left:4px solid #d99a2b;padding:6pt 10pt;margin:8pt 0;page-break-inside:avoid}
.ejemplo{background:#f3faf5;border-left:4px solid #3f9a5b;padding:6pt 10pt;margin:8pt 0;page-break-inside:avoid}
.ejemplo b.t,.caja b.t,.aviso b.t{display:block;color:#0f2a4a;margin-bottom:2pt}
table{border-collapse:collapse;width:100%;margin:6pt 0;font-size:9.4pt;page-break-inside:avoid}
th,td{border:1px solid #d3dbe8;padding:3.5pt 6pt;text-align:left;vertical-align:top}
th{background:#eef2f9}
.num{text-align:right;white-space:nowrap}
ul,ol{margin:3pt 0 3pt 16pt;padding:0} li{margin:2pt 0}
figure{margin:8pt 0 10pt;page-break-inside:avoid;border:1px solid #e3e8f0;border-radius:6pt;padding:8pt 8pt 4pt}
figcaption{font-size:8.8pt;color:#5a6577;margin-top:4pt}
.dos{display:flex;gap:10pt;margin:8pt 0;page-break-inside:avoid}
.col{flex:1;border:1.5px solid #c9d3e3;border-radius:6pt;padding:7pt 9pt;background:#fafcff}
.col b.t{display:block;font-size:11pt;color:#0f2a4a;margin-bottom:2pt}
.semaforo td:first-child{width:22pt;text-align:center;font-size:13pt}
.v{color:#3f9a5b}.a{color:#d99a2b}.r{color:#c0504d}.g{color:#9aa3b2}
.salto{page-break-before:always}
.pie{margin-top:14pt;color:#6b7587;font-size:8.6pt;border-top:1px solid #d3dbe8;padding-top:5pt}
.gl dt{font-weight:bold;color:#23406b;margin-top:4pt} .gl dd{margin:0 0 2pt 0}
.portada{border:1.5px solid #c9d3e3;border-radius:8pt;padding:10pt 14pt;background:#fafcff;margin:8pt 0 12pt}
.cifras{display:flex;gap:8pt;margin:8pt 0;page-break-inside:avoid}
.cifras div{flex:1;border:1px solid #d3dbe8;border-radius:6pt;padding:6pt 8pt;text-align:center;background:#fff}
.cifras b{display:block;font-size:17pt;color:#0f2a4a}
.cifras span{font-size:8.6pt;color:#5a6577}
"""

R = GATHER["resumen"]
HTML = f"""<!doctype html>
<html lang="es"><head><meta charset="utf-8"><title>Experimento A · Informe 3 · Avance</title><style>{CSS}</style></head><body>

<h1>Experimento A, tercera parte: de sobrevivir a jugar con un propósito</h1>
<div class="sub">Informe de avance · 3 de noviembre de 2026 · Cubre lo ocurrido desde el informe del 18 de octubre · Proyecto «Mundo simulado»</div>

<div class="portada">
<p><b>Pregunta de investigación.</b> ¿Puede un personaje artificial en un mundo abierto (Minecraft) perseguir metas largas y útiles para una persona —«consígueme cinco diamantes», «constrúyeme este castillo»— combinando reflejos aprendidos, un planificador sin IA y, solo cuando hace falta, una IA grande que razona?</p>
<p><b>Lo que traía el informe 2.</b> Un cuerpo que ya sobrevivía solo (16 de 16 noches) y una mente que planificaba por encima. <b>Lo que trae este:</b> el paso del «sobrevivir» al «jugar con un propósito»: roles de juego completos, un planificador barato (el <i>capataz</i>), un recolector que resuelve cadenas de requisitos, un catálogo de construcciones reales, y una forma de trabajar a dos personas, cada una con su agente, sin perder conocimiento.</p>
</div>

<div class="cifras">
<div><b>~200</b><span>cambios de código (commits) en 16 días</span></div>
<div><b>30</b><span>decisiones razonadas y escritas</span></div>
<div><b>24</b><span>aprendizajes («esto falla por…»)</span></div>
<div><b>0</b><span>muertes en el banco del recolector</span></div>
</div>

<h2>1. En pocas palabras</h2>
<ul>
<li><b>Se cambió de escala:</b> de habilidades sueltas (talar, refugiarse) a <b>roles de juego</b> de muchas horas —el jugador casual, el minero— que encadenan decenas de pasos.</li>
<li><b>Se separó el «qué toca ahora» de la IA cara:</b> un <i>capataz</i> escrito a mano decide la siguiente etapa mirando el inventario. No consume IA y es predecible.</li>
<li><b>Nace el recolector:</b> «consigue N diamantes» resuelve solo todo lo que hay en medio (pico, antorchas, bajar, túnel seguro, volver). Provisionalmente, <b>todos los materiales medidos pasan</b> su criterio y sin una sola muerte.</li>
<li><b>Los bots empiezan a construir obras reales</b> desde planos descargados, capa a capa, pidiendo materiales al cofre.</li>
<li><b>Método:</b> todo se mide con <b>bancos</b> repetibles cuyo criterio se fija <i>antes</i> de medir; el conocimiento se guarda en un <b>vault</b> compartido; y el coste en IA se vigila como una variable del experimento más.</li>
</ul>

<div class="caja"><b class="t">Idea clave para entenderlo todo</b>
En el informe 2 el personaje tenía <b>cuerpo</b> (reflejos rápidos) y <b>mente</b> (IA grande). Ahora tiene <b>tres capas</b>: entre ambas aparece el <b>capataz</b>, que hace de «jefe de obra»: no piensa en grande, pero sabe qué paso viene después. Así la IA cara solo se usa para lo que de verdad requiere razonar.</div>

{figura(capas(), "Figura 1. Las tres capas del personaje. Las órdenes bajan (mente → capataz → cuerpo) y los resultados suben como un par «éxito, causa». La flecha discontinua es la información que vuelve.")}

<h2>2. Cronología del periodo</h2>
<p>El trabajo no fue lineal: varias líneas avanzaron en paralelo y algunas se pausaron a propósito. La figura 2 resume cuándo se trabajó en cada una. Los días sin barras son días sin sesiones; la actividad se concentró en tres tramos (23-25 de octubre, 31 de octubre-1 de noviembre y 2-3 de noviembre).</p>
{figura(gantt(), "Figura 2. Diagrama de Gantt del periodo (18-10 a 03-11). Cada barra es una línea de trabajo; los rombos, hitos medidos.")}

<table>
<tr><th>Tramo</th><th>Qué se hizo</th><th>Por qué importa</th></tr>
<tr><td>18-23 oct</td><td>Cierre de la supervivencia (F7): la red de reflejos se entrena imitando al guion (clonación con DAgger). Se crea el <b>vault</b> de conocimiento y el plan de la fase 8.</td><td>Se pasa de «aprender a sobrevivir» a «aprender a jugar». El conocimiento deja de estar disperso.</td></tr>
<tr><td>24-25 oct</td><td>Fundación de habilidades nuevas (fundir, antorchas, escalera, cazar, cubo…) y primer rol completo, el <b>Casual</b>, medido con el banco K.</td><td>Primera prueba de un objetivo largo: «pico de hierro y cama en dos días».</td></tr>
<tr><td>31 oct-1 nov</td><td>Llegar a la versión nueva del juego (26.3) a través de un traductor de protocolo; movilidad en servidores Paper; puertas; zonas de trabajo marcadas con carteles; <b>economía de tokens</b>.</td><td>Los bots entran en el mundo real del usuario y del compañero, no solo en el de pruebas.</td></tr>
<tr><td>2-3 nov</td><td><b>Catálogo de estructuras</b> (castillo en servidor creativo), <b>recolector</b> «consigue» y rol <b>Minero</b>, y el banco del recolector.</td><td>Los dos grandes propósitos del jugador: construir y obtener recursos raros.</td></tr>
</table>

<h2>3. De sobrevivir a jugar con un propósito</h2>
<p>Un <b>rol</b> es una forma de jugar con un objetivo de largo horizonte. Se diseñaron siete: los principales (Casual, Speedrunner, Redstoner, Builder) y los de apoyo (Granjero, Minero, Explorador). Cada rol es una lista ordenada de <b>etapas</b>; cada etapa tiene un objetivo comprobable («tengo pico de hierro») y las acciones que lo consiguen. Los perfiles del informe anterior (talar más, explorar más…) pasan a ser <i>estilos</i> dentro de los roles.</p>

<h3>3.1 Primero, cimientos medibles</h3>
<p>Antes de juntar etapas, cada habilidad nueva se probó por separado en un servidor propio, con criterios numéricos. Por ejemplo, la habilidad de <b>explorar</b> llegó a su destino en llano 10/10, montaña 10/10, río 10/10 y cueva 8/10. Solo cuando las piezas pasan se monta el rol entero: si falla, se sabe que el fallo está en cómo se combinan, no en una pieza.</p>

<h3>3.2 El banco K: medir un objetivo de dos días</h3>
<p>El rol Casual debía conseguir <b>pico de hierro y cama en dos días de juego</b>. El <b>banco K</b> lanza 8 bots desde 8 puntos fijos del mundo, cuyo terreno se restaura idéntico antes de cada medida para que todas las medidas sean comparables.</p>
{figura(banco_k(), "Figura 3. Resultados del banco K por medida. La línea roja es el criterio de aprobado (≥ 6 de 8), fijado antes de la primera medida. La medida 7 usó 4 bots.")}
<p>El rol <b>no pasó todavía</b>. Pero la medida enseñó dónde está el problema: el pico de hierro ya sale 7/8 veces; lo que falla es la cama. Tras la etapa del hierro el bot está bajo tierra y la habilidad de cazar seguía a una oveja de la superficie <i>sin subir</i>: 19 de 28 cacerías acabaron así. Un fallo así no se ve probando a mano; aparece al repetir con método.</p>

<div class="ejemplo"><b class="t">Ejemplo didáctico: ¿por qué fijar el criterio antes de medir?</b>
Imagine que lanza un dado 8 veces buscando seises y salen 3. Si decide <i>después</i> que «3 está bien», siempre encontrará un motivo para aprobar. Fijando antes «necesito 6 de 8», el resultado no se puede negociar: 3/8 es un suspenso, y obliga a buscar la causa. En el proyecto, cada banco escribe su criterio en la nota del experimento antes de lanzarse.</div>

<h2>4. El capataz: planificar sin gastar IA</h2>
<p>El capataz recorre las etapas de un rol en orden. En cada momento mira el estado del bot (inventario, altura, vida, hambre) y elige <b>la primera etapa cuyo objetivo no está cumplido</b>. Es un algoritmo sencillo, determinista y gratuito: no llama a ninguna IA. Si una etapa falla, lo anota con su causa y lo reintenta o pide ayuda.</p>
{figura(etapas_minero(), "Figura 4. Las 15 etapas del rol Minero, en el orden en que el capataz las recorre. Las de la última fila son órdenes «consigue» (sección 5).")}

<div class="ejemplo"><b class="t">Ejemplo: cómo decide el capataz</b>
Un Minero aparece con un pico de piedra y 3 panes. El capataz recorre: «¿madera?» ✓ (tiene herramientas, así que la etapa ya se dio), «¿herramientas de piedra?» ✓, «¿comida?» ✓, «¿carbón para 32 antorchas?» ✗ → <b>esa</b> es la etapa. Si entre tanto se le rompe el pico, en la siguiente vuelta la primera etapa sin cumplir será «herramientas de piedra» y volverá a ella sola, sin que nadie se lo diga.</div>

<h2>5. El recolector: «Oqva, consigue 5 diamantes»</h2>
<p>El personaje principal (Oqva, antes Soma) recibe una orden en lenguaje natural por el chat. El reto no es picar el diamante, sino <b>todo lo que hay en medio</b>: un diamante solo se puede extraer con pico de hierro; el hierro hay que fundirlo; abajo está oscuro y hay lava. El recolector convierte la orden en un <b>árbol de submetas</b> y lo resuelve de abajo arriba.</p>
{figura(arbol(), "Figura 5. Árbol (simplificado) de submetas de «consigue 1 diamante». Cada flecha se lee «necesita». En naranja, los pasos de riesgo.")}

<h3>5.1 Dónde están los minerales</h3>
<p>Cada mineral aparece sobre todo en una franja de altura. El recolector usa esa tabla para decidir hasta dónde bajar: no tiene sentido buscar diamantes a la altura del carbón.</p>
{figura(cotas(), "Figura 6. Altura a la que el recolector busca cada mineral (por debajo de y = 0 empieza la pizarra profunda; el mar y la superficie están hacia y = 63-70). La esmeralda solo sale en montañas y la netherite exige ir a otra dimensión (el Nether), así que quedan fuera de esta fase.")}

<h3>5.2 Seguridad: el túnel que tapa la lava</h3>
<p>La causa de muerte más frecuente al minar es abrir una pared detrás de la cual hay lava o agua. El recolector cava túneles de 1×2 y, <b>antes de abrir</b> cada casilla, mira sus vecinas: si alguna es líquida, la tapa con piedra y solo entonces avanza. Cada 8 bloques pone una antorcha.</p>
{figura(tunel(), "Figura 7. Regla del túnel seguro, vista de perfil.")}

<h3>5.3 Resultados (provisionales)</h3>
<p>Banco del recolector: un bot temporal aparece en un llano con un equipo inicial, recibe «consigue N material» y se cuenta lo que tiene al final. Cada intento empieza en otro punto, separado 48 bloques del anterior, para que el terreno no se repita. <b>Criterio fijado antes de medir:</b> éxito en ≥ 4 de 5 intentos por material y ninguna muerte en todo el banco.</p>
{figura(recolector(), "Figura 8. Izquierda: cada casilla es un intento. Derecha: duración de cada intento. El banco quedó pausado el 3-11 por decisión del usuario; faltan redstone (2), diamante (5) y diamante desde inventario vacío (5).")}
{tabla_recolector()}
<div class="aviso"><b class="t">Lectura honesta</b>
Lo medido pasa ({R['hierro']['bien']}/{R['hierro']['de']}, {R['lapis']['bien']}/{R['lapis']['de']}, {R['oro']['bien']}/{R['oro']['de']} y {R['redstone']['bien']}/{R['redstone']['de']}, con {GATHER['muertes']} muertes), pero <b>falta lo más difícil</b>: el diamante, a la máxima profundidad, y empezar desde el inventario vacío. El único fallo es instructivo: el lapislázuli exige pico de piedra, el pico se gastó a mitad de faena (5 de 6) y el bot, correctamente, se detuvo explicando la causa en lugar de seguir picando sin herramienta. Le faltó <i>reponer el pico por sí mismo</i>, que es justo lo que el árbol de submetas debería cubrir.</div>

<h2>6. Construir: el catálogo de estructuras</h2>
<p>Hasta ahora los bots solo levantaban planos hechos a mano y de un solo material. Ahora importan <b>plantillas reales</b> descargadas en los formatos habituales de la comunidad (.litematic, .schem, .nbt) y las convierten en una lista ordenada de bloques. Construir bien es más que poner bloques: hay que <b>orientar</b> escaleras y puertas, poner lo que cuelga <i>después</i> de su soporte, montar <b>andamio</b> cuando la capa queda alta y <b>abastecerse</b> en el cofre por tandas.</p>
{figura(capas_obra(), "Figura 9. Ejemplo didáctico: una casita de tres capas y las reglas que sigue el bot al colocarla.")}
<div class="dos">
<div class="col"><b class="t">Obra pequeña: casita de prueba</b>99 de 99 bloques, tanto con la mochila llena como abasteciéndose de un cofre. La orden «deshaz» la retira.</div>
<div class="col"><b class="t">Obra grande: torre de un castillo</b>Un castillo de 132.000 bloques no cabe en el mundo compartido, así que se montó un <b>servidor creativo</b> propio. La torre recortada: 1.086 de 3.210 bloques, <b>sin un solo error de orientación</b>; 5 de 7 pruebas pasan. Se detiene en la capa 9 por el andamio, el siguiente arreglo.</div>
</div>
<div class="ejemplo"><b class="t">Lo que enseñó la obra grande</b>
El navegador del bot trataba las casillas de la obra como «muy caras» y, por encima de cierto coste, <b>prohibidas</b>: el bot no daba un paso dentro de su propia obra. Es un buen ejemplo de un fallo que solo aparece al escalar: con una casita nunca ocurre.</div>

<h2>7. Varios personajes con un modelo compartido</h2>
<p>Objetivo: 2-3 personajes en el mismo mundo usando <b>la misma red</b>, con la misma tasa de éxito que uno solo. Las fases A-C (simulador con varios cuerpos, red de equipo, carga del servidor) se cerraron antes de este periodo; en la D, la prueba con un solo personaje pasa (95 %) y la carga del servidor es asumible. <b>En este periodo no hubo medida nueva</b>: queda medir solo, dúo y trío desde los mismos puntos. Mientras, el trabajo en el mundo compartido avanzó en lo social: cada bot tiene <b>dueño</b>, los bots de un jugador reconocen a sus <b>aliados</b>, y cada dueño marca sus <b>zonas</b> (hogar, obras, vedadas) con carteles en el propio mundo.</p>

<h2>8. Trabajar a dos, cada uno con su agente</h2>
<p>En el proyecto trabajan dos personas, cada una con su propio asistente de programación (Claude Code). El riesgo es que cada agente redescubra lo que el otro ya sabe, o que tomen decisiones incompatibles. La solución fue un <b>vault de conocimiento</b> en Obsidian, dentro del propio repositorio, con una nota por cosa y una plantilla por tipo.</p>
{figura(a_dos(), "Figura 10. Flujo del conocimiento entre las dos personas. El vault viaja por git; el hub en tiempo real se probó y quedó en pausa el 2-11 porque no respondía.")}
<table>
<tr><th>Tipo de nota</th><th>Cuándo se escribe</th><th>Ejemplo real del periodo</th></tr>
<tr><td>Decisión</td><td>Algo que afecta al otro</td><td>«La madera de las plantillas es orientativa» (el bot taló abedul y la casita pedía roble).</td></tr>
<tr><td>Experimento</td><td>Termina una medida</td><td>Banco K, medida 9: 3/8, veredicto «mejora».</td></tr>
<tr><td>Aprendizaje</td><td>Un fallo con causa que no conviene redescubrir</td><td>«Un nido de abejas con abejas en un cofre desconecta al bot».</td></tr>
<tr><td>Roadmap</td><td>Cambia el estado o el siguiente paso</td><td>F8: «siguiente: ronda corta del Casual y otra medida del banco K».</td></tr>
</table>
<p>Una regla sencilla resultó clave: <b>no se reescriben las decisiones</b>; si cambian, se escribe otra y la vieja se marca «sustituida». Así queda la historia de <i>por qué</i> se cambió de opinión (2 de las 30 decisiones están marcadas como sustituidas).</p>

<h2>9. El coste como variable del experimento</h2>
<p>El 31 de octubre, un solo día de trabajo consumió el 8 % del cupo semanal de IA. Se decidió entonces una <b>economía de tokens</b>: la máquina del usuario hace el bucle largo (servidores, bots, entrenamiento, bancos de horas) y la IA solo diseña, escribe código y <b>lee veredictos de una línea</b>, nunca registros enteros. A la línea del asistente se le puso un tope explícito del 5 % semanal.</p>
{figura(coste(), "Figura 11. Reparto del trabajo entre la máquina local y la IA.")}
<div class="ejemplo"><b class="t">Ejemplo: cuánto cuesta «mirar»</b>
Un banco de 30 intentos genera miles de líneas de registro. Si la IA las leyera para saber cómo va, gastaría más que escribiendo el código del banco. En cambio, el banco escribe un JSON con una fila por intento y una línea final («hierro 5/5 PASA · muertes 0»). La IA lee esa línea. Es la misma idea que un resumen ejecutivo: el detalle existe, pero solo se abre si el resumen dice que algo va mal.</div>
<p>El cuerpo de los bots tampoco necesita IA grande: la red de reflejos es pequeña (con estas redes, el procesador normal resultó más rápido que la tarjeta gráfica) y el capataz es guion. La IA grande queda como un recurso escaso que se usa con intención.</p>

<h2>10. Lo que falló, y lo que enseñó</h2>
<table>
<tr><th>Qué pasó</th><th>Causa</th><th>Qué se cambió</th></tr>
<tr><td>El primer bot del recolector murió ahogado.</td><td>El punto de salida cayó en un lago y el bot no sabía salir del agua honda.</td><td>Salir del agua es lo primero; el banco descarta puntos con agua.</td></tr>
<tr><td>Un reinicio del PC borró horas de banco.</td><td>El resultado solo se escribía al final.</td><td>Se guarda tras cada intento y se puede reanudar sin repetir.</td></tr>
<tr><td>Una pausa contó como fallo.</td><td>El intento cortado a mano se guardó como «cancelado».</td><td>Un intento cortado no se cuenta; se repite al reanudar.</td></tr>
<tr><td>El bot no avanzaba dentro de su obra.</td><td>Un coste del navegador por encima de 100 equivale a «prohibido».</td><td>Coste menor en la huella de las obras grandes.</td></tr>
<tr><td>Los bots no cruzaban puertas.</td><td>El navegador trataba la puerta como un muro.</td><td>Las puertas de madera cuentan como paso; el bot abre y cierra detrás.</td></tr>
<tr><td>La cama del Casual no salía.</td><td>Cazar seguía a la oveja de la superficie desde la mina.</td><td>Cazar sube primero a la superficie (pendiente de medir).</td></tr>
<tr><td>El servidor nuevo (26.3) expulsaba al bot.</td><td>La versión nueva exige un mensaje por tick que la librería no enviaba.</td><td>Un envoltorio propio que lo envía, a través de un traductor de protocolo (puerta A0: 7/7).</td></tr>
</table>
<p>Patrón común: casi ningún fallo era del «cerebro» del bot; la mayoría eran <b>fricciones con el mundo</b> (agua, puertas, versiones, el propio montaje de la prueba). Es coherente con lo visto en el informe 2: el cuello de botella está en la interfaz entre el agente y su entorno.</p>

<h2>11. Dónde estamos y qué falta</h2>
<table class="semaforo">
<tr><th></th><th>Línea</th><th>Estado</th><th>Siguiente paso</th></tr>
<tr><td class="v">●</td><td>Habilidades base (F8.0)</td><td>Hechas y medidas</td><td>—</td></tr>
<tr><td class="v">●</td><td>Recolector «consigue»</td><td>Provisional: pasa lo medido, 0 muertes</td><td>Terminar el banco (diamante y desde cero); reponer la herramienta gastada.</td></tr>
<tr><td class="a">●</td><td>Rol Minero</td><td>Diseñado y escrito; sin medir</td><td>Banco de dos días del Minero.</td></tr>
<tr><td class="r">●</td><td>Rol Casual (banco K)</td><td>3/8 (criterio 6/8)</td><td>Ronda corta de arreglos y otra medida.</td></tr>
<tr><td class="a">●</td><td>Catálogo de estructuras</td><td>Casita 99/99; torre 5/7</td><td>Andamio desde la capa 9; castillo entero.</td></tr>
<tr><td class="a">●</td><td>Varios personajes</td><td>Fase D a medias</td><td>Medir solo, dúo y trío.</td></tr>
<tr><td class="a">●</td><td>Asistente en el mundo del usuario</td><td>Puerta A0 7/7; en pausa por cupo</td><td>A1 desde el 7-11.</td></tr>
<tr><td class="a">●</td><td>Mente (Alma)</td><td>Código escrito; sin medida formal</td><td>Medir T1-T3 (solo a petición: consume IA).</td></tr>
<tr><td class="g">●</td><td>Hub en tiempo real</td><td>En pausa</td><td>Reactivar si vuelve a hacer falta.</td></tr>
</table>
<div class="caja"><b class="t">Conclusión del periodo</b>
El proyecto ha pasado de demostrar que un agente <i>sobrevive</i> a demostrar que puede <i>perseguir un encargo</i> de varios pasos con riesgo real (bajar a la mina, esquivar lava, volver con lo pedido). La arquitectura en tres capas permite hacerlo sin que cada paso cueste IA. Lo que queda abierto es la robustez a horizontes largos (dos días de juego) y la coordinación entre varios personajes.</div>

<h2>12. Pequeño glosario</h2>
<dl class="gl">
<dt>Banco</dt><dd>Prueba repetible con condiciones controladas (mismo terreno, mismo equipo) y un criterio de aprobado fijado de antemano.</dd>
<dt>Capataz</dt><dd>Planificador escrito a mano que elige la siguiente etapa de un rol según el estado del bot. No usa IA.</dd>
<dt>Clonación con DAgger</dt><dd>Técnica para entrenar una red imitando a un experto (aquí, el guion) y corrigiéndola en las situaciones donde se equivoca.</dd>
<dt>Etapa</dt><dd>Paso de un rol con un objetivo comprobable («tengo pico de hierro») y las acciones que lo consiguen.</dd>
<dt>Prueba en seco</dt><dd>Prueba del código con un mundo simulado, sin servidor: rápida y gratuita. Se contrapone a la prueba «en el juego».</dd>
<dt>Rol</dt><dd>Forma de jugar con un objetivo largo (Casual, Minero, Builder…), compuesta por etapas.</dd>
<dt>Submeta</dt><dd>Requisito intermedio que hay que cumplir antes de la meta (el pico antes del diamante).</dd>
<dt>Vault</dt><dd>Carpeta de notas enlazadas (Obsidian) que guarda decisiones, experimentos y aprendizajes del proyecto, compartida por git.</dd>
</dl>

<div class="pie">Fuentes: vault <code>conocimiento/</code> (roadmap, 30 decisiones, experimentos, 24 aprendizajes, diarios), historial de git desde el 18-10-2026 y <code>servidor-supervivencia/logs/conseguir-20261102-2257.json</code> (banco del recolector, provisional). Informes anteriores: <code>resumen/INFORME_Experimento_A_2026-10-15.pdf</code> y <code>resumen/INFORME_Supervivencia_2026-10-18.pdf</code>.</div>
</body></html>
"""

OUT.write_text(HTML)
print(OUT)
