#!/usr/bin/env python3
"""Puertas del asistente A1, A2, A4 y A5 (PLAN_asistente.md), escritas ANTES de las habilidades: los criterios de abajo
están fijados y no se cambian para que algo pase. Cada fase es una función `fase_AX(m, s, a)` que apunta sus pruebas con
`s.anota`. Las piezas (plataforma, cantera, huerto, corral, restauración) están en arena.py.
Hace falta el servidor del mundo y Soma conectado en el puerto 3001, en modo órdenes:
  local:   make server-start && make bots WORLD=local BOTS=Soma MODE=ordenes BOT_DECIDER=guion
  usuario: make user-server-start proxy-start assistant      (humo: una pasada, --n 1)
Uso: python entrenamiento/banco_asistente.py --fase A2 [--mundo local|usuario] [--n N] [--minutos M]   (o make bench-assistant)
A3 (expedición) no está aquí: va en terreno de verdad, con el banco K (planes/asistente/A3.md)."""
import argparse, math, sys, time

from arena import RAIZ, Mundo, Sesion, contar_cofre, guardar, muertes_desde, reiniciar_bots

LOG = lambda mundo: RAIZ / "servidor-supervivencia" / "logs" / f"bots-{mundo}.log"
UTILES = ("stone", "cobblestone", "deepslate", "cobbled_deepslate", "coal", "raw_iron", "coal_ore", "iron_ore", "granite", "diorite", "andesite")
DATOS = lambda mundo: RAIZ / "mundos" / mundo


# --- A1 · rol, órdenes y memoria ------------------------------------------------------------------------------------------------
# Puerta: «ve a X Y Z» llega a ≤ 3 en 10/10 (puntos a 20-80 bloques, en una plataforma llana de 161×161); «base aquí» deja la
# base en la memoria persistente; tras reiniciar el proceso, la base sigue (y el bot la dice en «estado»). El parser (30/30)
# se mide en seco: bot/probar_asistente_seco.js.
PUNTOS_A1 = [(20, 0), (0, 25), (-30, 0), (0, -35), (40, 10), (-45, -10), (50, 30), (-60, 20), (70, -20), (0, 80)]


def fase_A1(m, s, a):
    s.plataforma(lado=161)
    s.en(0, 0)
    bien = []
    for dx, dz in PUNTOS_A1:
        s.en(0, 0)
        x, z = s.base[0] + dx, s.base[2] + dz
        m.orden(f"orden_esperar ve a {x} {s.y} {z}", 200)
        p = m.pos()
        bien.append(bool(p) and math.hypot(p[0] - x - 0.5, p[2] - z - 0.5) <= 3)
    s.anota("ve a", sum(bien) == len(bien), f"{sum(bien)}/{len(bien)} a ≤ 3")
    s.en(0, 0)
    r = m.orden("orden base aquí")
    mem = DATOS(m.nombre) / "memoria_Soma.json"
    base = mem.exists() and '"base": [' in mem.read_text(encoding="utf-8")
    s.anota("base aquí", base, r[:80])
    reiniciar_bots(m.nombre)
    ok = m.esperar_conectado(90)
    time.sleep(5)
    e = m.orden("estado")
    s.anota("recuerda tras reiniciar", ok and base and "base" in e, e[:120])


# --- A2 · minar en un punto fijo ------------------------------------------------------------------------------------------------
# Puerta (por ejecución): desde la base, con pico de hierro, «mina en X Y Z» sobre una cantera a 40 bloques: en `--minutos`
# (30) hay ≥ 64 bloques útiles en el cofre de la base, 0 muertes, y vuelve a minar tras cada viaje al cofre.
# La fase pasa con ≥ 4/5 ejecuciones buenas (--n 5).
def fase_A2(m, s, a):
    buenas = 0
    for k in range(a.n):
        s.plataforma(lado=91)
        cx, cy, cz = s.base[0] + 40, s.y - 4, s.base[2]
        s.cantera(dx=40, lado=12, alto=8, menas=(("iron_ore", 12), ("coal_ore", 12)))
        s.en(0, 0)
        m.r(f"clear {m.personaje}")
        m.dar("iron_pickaxe", "iron_pickaxe", "torch 32", "bread 16", "chest")
        c = m.hab("poner chest")
        cofre = c.get("pos")
        m.orden("orden base aquí")
        desde = (LOG(m.nombre).stat().st_size if LOG(m.nombre).exists() else 0)
        m.orden(f"orden mina en {cx} {cy} {cz} hasta llenar")
        time.sleep(a.minutos * 60)
        m.orden("orden quédate")
        en_cofre = contar_cofre(m, *cofre) if cofre else {}
        utiles = sum(v for k2, v in en_cofre.items() if k2 in UTILES)
        texto = LOG(m.nombre).read_text(encoding="utf-8", errors="replace")[desde:] if LOG(m.nombre).exists() else ""
        viajes = texto.count("[hab] depositar")
        muertes = muertes_desde(LOG(m.nombre), desde)
        buena = utiles >= 64 and muertes == 0 and viajes >= 1
        buenas += buena
        s.anota(f"ejecución {k + 1}", buena, f"{utiles} útiles en el cofre, {viajes} viajes, {muertes} muertes")
    s.anota("puerta A2", buenas >= math.ceil(0.8 * a.n), f"{buenas}/{a.n} buenas (hacen falta {math.ceil(0.8 * a.n)})")


# --- A4 · muerte y recuperación -------------------------------------------------------------------------------------------------
# Puerta: 8 muertes de día y 4 de noche, a 60 bloques de la base, con un inventario fijo: recupera ≥ 80 % de los objetos en
# ≥ 6/8 de día y ≥ 2/4 de noche, 0 segundas muertes; con 2 muertes en lava no sale de la base (no lo intenta).
INVENTARIO_A4 = [("cobblestone", 32), ("oak_log", 16), ("iron_ingot", 8), ("coal", 16), ("torch", 16), ("bread", 8),
                 ("stone_pickaxe", 1), ("stone_sword", 1), ("dirt", 32), ("wheat_seeds", 16)]


def una_muerte(m, s, noche=False, lava=False):
    s.en(0, 0)
    m.r(f"clear {m.personaje}")
    for item, n in INVENTARIO_A4:
        m.dar(f"{item} {n}")
    total = sum(n for _, n in INVENTARIO_A4)
    s.en(60, 0)
    m.r("time set 18000" if noche else "time set 1000")
    desde = LOG(m.nombre).stat().st_size if LOG(m.nombre).exists() else 0
    m.r(f"damage {m.personaje} 1000 minecraft:{'lava' if lava else 'fall'}")
    time.sleep(150)  # reaparece en la base (cama o punto de aparición) y va a por sus cosas: < 4,5 min, antes de que desaparezcan
    tiene = sum(m.cuantos(item) for item, _ in INVENTARIO_A4)
    muertes = muertes_desde(LOG(m.nombre), desde)
    p = m.pos()
    lejos = bool(p) and math.hypot(p[0] - s.base[0], p[2] - s.base[2]) > 20
    return tiene / total, muertes, lejos


def fase_A4(m, s, a):
    s.plataforma(lado=161)
    s.en(0, 0)
    m.r(f"spawnpoint {m.personaje} {s.base[0]} {s.y} {s.base[2]}")  # reaparece en la plataforma, como con la cama fija
    dia = noche = segundas = 0
    for k in range(8):
        f, mu, _ = una_muerte(m, s)
        dia += f >= 0.8
        segundas += mu > 1
        s.anota(f"día {k + 1}", f >= 0.8 and mu == 1, f"{f:.0%} recuperado, {mu} muertes")
    m.r("difficulty normal")  # de noche, con monstruos de verdad
    for k in range(4):
        f, mu, _ = una_muerte(m, s, noche=True)
        noche += f >= 0.8
        segundas += mu > 1
        s.anota(f"noche {k + 1}", f >= 0.8 and mu == 1, f"{f:.0%} recuperado, {mu} muertes")
    m.r("difficulty peaceful")
    no_va = 0
    for k in range(2):
        _, _, lejos = una_muerte(m, s, lava=True)
        no_va += not lejos
    s.anota("puerta A4", dia >= 6 and noche >= 2 and segundas == 0 and no_va == 2,
            f"día {dia}/8, noche {noche}/4, {segundas} segundas muertes, lava: no fue {no_va}/2")


# --- A5 · granja mínima ---------------------------------------------------------------------------------------------------------
# Puerta (por ejecución, --n 8): un huerto de 3×3 con trigo maduro: «cosecha» lo cosecha 9/9 y lo resiembra 9/9; en un corral
# con 2 vacas, «cría vacas» da ≥ 1 cría; con 10 vacas, no cría (tope); 20 min de «cuida la granja» sin atascos ni muertes.
# La fase pasa con cosecha y resiembra en 8/8, cría en ≥ 6/8, tope siempre, y la rutina sin muertes.
def vacas(m, x, y, z, r):
    """Cuántas vacas hay a ≤ r de (x, y, z) («execute if entity» dice «Test passed, count: N»)."""
    t = m.r(f"execute positioned {x} {y} {z} if entity @e[type=cow,distance=..{r}]")
    return int(([w for w in t.replace(",", " ").split() if w.isdigit()] or ["0"])[-1])


def fase_A5(m, s, a):
    cos = cria = tope = rut = 0
    for k in range(a.n):
        s.plataforma(lado=41)
        casillas = s.huerto(dx=-6, dz=-6, lado=3, cultivo="wheat[age=7]")
        s.corral("cow", 2, dx=8, dz=0, lado=7)
        s.corral("cow", 10, dx=-10, dz=10, lado=9)
        s.en(-3, -3)
        m.r(f"clear {m.personaje}")
        m.dar("wheat_seeds 16", "wheat 16", "shears", "chest", "stone_hoe")
        m.hab("poner chest")
        m.orden("orden base aquí")
        m.orden("orden_esperar cosecha", 200)
        resem = sum("passed" in m.r(f"execute if block {x} {y + 1} {z} minecraft:wheat") for x, y, z in casillas)
        trigo = m.cuantos("wheat")
        bien = resem == 9 and trigo >= 16 + 9
        cos += bien
        s.en(8, 0)
        m.orden("orden_esperar cría vacas", 200)
        time.sleep(5)
        n_vacas = vacas(m, s.base[0] + 8, s.y, s.base[2], 5)
        cria += n_vacas >= 3
        s.en(-10, 10)
        m.orden("orden_esperar cría vacas", 120)
        n10 = vacas(m, s.base[0] - 10, s.y, s.base[2] + 10, 6)
        tope += n10 <= 10
        desde = LOG(m.nombre).stat().st_size if LOG(m.nombre).exists() else 0
        m.orden("orden cuida la granja")
        time.sleep(a.minutos * 60)
        m.orden("orden quédate")
        texto = LOG(m.nombre).read_text(encoding="utf-8", errors="replace")[desde:] if LOG(m.nombre).exists() else ""
        sin_lio = muertes_desde(LOG(m.nombre), desde) == 0 and "atascado" not in texto
        rut += sin_lio
        s.anota(f"ejecución {k + 1}", bien and n_vacas >= 3 and n10 <= 10 and sin_lio,
                f"resembrado {resem}/9, trigo {trigo}; vacas {n_vacas} (2 + crías); corral lleno {n10}; rutina {'bien' if sin_lio else 'mal'}")
    s.anota("puerta A5", cos == a.n and cria >= math.ceil(0.75 * a.n) and tope == a.n and rut == a.n,
            f"cosecha {cos}/{a.n}, cría {cria}/{a.n}, tope {tope}/{a.n}, rutina {rut}/{a.n}")


FASES = {"A1": fase_A1, "A2": fase_A2, "A4": fase_A4, "A5": fase_A5}
TITULOS = {"A1": "rol, órdenes y memoria", "A2": "minar en un punto fijo", "A4": "muerte y recuperación", "A5": "granja mínima"}
N_POR_DEFECTO = {"A1": 1, "A2": 5, "A4": 1, "A5": 8}
MIN_POR_DEFECTO = {"A2": 30, "A5": 20}


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--fase", required=True, choices=sorted(FASES))
    ap.add_argument("--mundo", default="local", choices=["local", "usuario"])
    ap.add_argument("--n", type=int, help="ejecuciones (por defecto, las de la puerta)")
    ap.add_argument("--minutos", type=float, help="minutos por ejecución donde aplica (A2: 30, A5: 20)")
    a = ap.parse_args()
    a.n = a.n or N_POR_DEFECTO[a.fase]
    a.minutos = a.minutos or MIN_POR_DEFECTO.get(a.fase, 0)
    m = Mundo(a.mundo)
    if not m.esperar_conectado():
        print(f"Soma no está en el mundo {a.mundo}: mira el docstring (cómo arrancarlo)")
        return 1
    with Sesion(m, ficheros=[DATOS(a.mundo) / f for f in ("cofres.json", "obras.json", "zonas.json", "memoria_Soma.json")]) as s:
        s.suelo_firme()
        FASES[a.fase](m, s, a)
    datos = s.datos(a.fase, TITULOS[a.fase], "minecraft 26.3" if a.mundo == "usuario" else "minecraft 26.1.2")
    guardar(datos)
    return 0 if datos["pasa"] else 2


if __name__ == "__main__":
    sys.exit(main())
