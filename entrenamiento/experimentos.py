#!/usr/bin/env python3
"""F5 · Experimentos en el servidor local: ¿los perfiles producen comportamientos distintos y medibles con la misma red?
Un perfil por ejecución, un solo personaje (Soma, antes Io), el mismo mundo, la semilla 42 y los mismos puntos de partida que medir_ejecutor.py
(fuera de las zonas protegidas), episodios de 4 min con la red (politica_habilidades.json, solo lectura).
Matriz: perfiles × condiciones {pacifico, amenazas} × N puntos. Variantes: ruido (en la observación que ve la red) y meta (orden
«perfil NOMBRE» a mitad). Réplicas de una celda, para medir la dispersión.
- Jugador: un aldeano quieto en --jugador X,Z (jugador_prueba villager, como el banco real 2) para medir la cooperación.
- Amenazas: el servidor está en pacífico. Un oso polar quieto (NoAI, sin gravedad, invulnerable, etiqueta amenaza_exp), que el bot
  trata como hostil (amenaza_prueba polar_bear), aparece a 10-24 bloques y se le acerca a 1 bloque/s por RCON (a su altura), como
  el hostil del simulador (entorno_habilidades.py). Desaparece si queda a > 32 bloques, a los 120 s o, con prob. 0,5, tras una
  huida (de < 8 a ≥ 16 bloques), o si el personaje sale del arbolado de pruebas (> 40 bloques de su centro, 303,32: si no, la
  persecución lo saca del arbolado; visto el 2026-10-14, acabó hundido en un lago a 110 bloques); no entra en las zonas
  protegidas y solo aparece con el personaje dentro del arbolado. El calendario (esperas, distancia y ángulo de aparición, si
  pierde el rastro) sale de la semilla y del punto: es el mismo para todos los perfiles en ese punto. No hace daño de verdad:
  «vida perdida simulada» como en el simulador (≈ 1 por segundo a ≤ 2 bloques; sin amenaza, +1 cada 4 s); «muerte simulada» si
  llega a 0 (vuelve a 20). También se mide la vida real (Health por RCON).
- Noche: la entrada «noche» de la red se fija (pacífico 0, amenazas 1): en el simulador los hostiles solo salen de noche y el reloj
  del servidor avanza (si no, el perfil supervivencia cambiaría según la hora). El resto de la observación es la del bot.
- Ruido (variante ruido): las distancias vistas (< 1) × U(0,9; 1,1), recortadas a 1; cada entrada se pone a 0 con prob. 0,05.
- Meta (variante meta:A>B): empieza con el perfil A y a los --cambio s (120) recibe por el puerto la orden «perfil B».
Métricas por ejecución: troncos, vida perdida (real y simulada), muertes (reales y simuladas), huidas e interrupciones por
amenaza, distancia recorrida (posiciones por RCON cada 0,5 s), % de decisiones a ≤ 6 bloques del jugador, uso de habilidades y
(añadida tras la primera serie) % de las decisiones con la amenaza a la vista que fueron huir.
Entre ejecuciones deja el banco como estaba (medir_ejecutor.limpiar: repone lo picado y quita lo ganado) y fotografía el arbolado
y las zonas antes y después (nunca toca las zonas). No usa el cofre: el reflejo se apaga mientras dura (y se restaura al final);
los troncos y huevos que lleve el personaje se apartan al empezar y se le devuelven al terminar.
Salida: ejecuciones/experimentos-AAAAMMDD.json (una entrada por ejecución; se guarda tras cada una y --seguir continúa) y el
detalle de cada decisión en ejecuciones/experimentos-AAAAMMDD-HHMM.jsonl. `resumen` da la tabla compacta, la dispersión de cada
celda repetida y las comparaciones con el recolector, con la σ de la celda del criterio (--criterio) y con la de su propia condición
(con --diario, también en mente/diario.md). Con --seguir y sin --salida continúa el último experimentos-AAAAMMDD.json.
Criterio (fijado antes de medir): un perfil se distingue del recolector en una métrica si |media de la diferencia por punto| >
2 σ_rep (σ_rep: desviación típica entre réplicas del mismo punto en la celda repetida, agrupada) y la diferencia tiene el mismo
signo en todos los puntos.
Uso: experimentos.py medir [--perfiles recolector,constructor,cooperativo,supervivencia,explorador] [--condiciones pacifico,amenazas]
                           [--variantes ruido:recolector,ruido:cooperativo,meta:recolector>cooperativo,meta:cooperativo>recolector]
                           [--repetir recolector/amenazas:2] [--N 4] [--semilla 42] [--segundos 240] [--cambio 120]
                           [--jugador 284,43] [--excluir 305,10,317,21] [--puerto 3001] [--salida RUTA] [--seguir] [--solo K]
     experimentos.py resumen [RUTA] [--diario]"""
import argparse, json, math, random, re, sys, threading, time
from collections import Counter
from pathlib import Path

import numpy as np

import medir_ejecutor as me
import mundo
from ejecutor import AQUI, anotar, en_zona, episodio, nombre_de, orden, politica, poner_perfil
from entorno_habilidades import HABILIDADES, I
from medir_ejecutor import OW, foto_arbolado, comparar_arbolado, inventario, limpiar, picados_de, rcon, tp

ETIQUETA_AMENAZA = "amenaza_exp"
CENTRO, CORREA = mundo.CENTRO, 40  # la amenaza solo persigue dentro del arbolado de pruebas (en el del usuario, 303,32)
TIPO_AMENAZA = "polar_bear"  # no hay osos polares en el arbolado: ninguna entidad del mundo cuenta como amenaza por error
DISTANCIAS = [I[n] for n in ("arbol_dist", "jugador_dist", "amenaza_dist", "companero_dist", "companero_arbol_dist", "otro_arbol_dist")]
CORTO = {"ir_a_arbol": "A", "picar_tronco": "P", "recoger": "R", "ir_a_jugador": "J", "huir": "H", "ir_a_otro_arbol": "O"}
PERFILES = "recolector,constructor,cooperativo,supervivencia,explorador"
VARIANTES = "ruido:recolector,ruido:cooperativo,meta:recolector>cooperativo,meta:cooperativo>recolector"
CONDICION_VARIANTES = "pacifico"
METRICAS = ["troncos", "junto", "distancia", "huidas", "huir_vista", "interrupciones", "vida_sim", "muertes_sim"]


# ---------- amenaza y vigía (posiciones, vida) ----------

def calendario(semilla, k, n=40):
    """Esperas, distancia y ángulo de aparición y monedas de «pierde el rastro» de las amenazas de un punto (las mismas para
    todos los perfiles en ese punto)."""
    rng = np.random.default_rng([semilla, k, 7])
    return [{"espera": float(rng.uniform(10, 30) if i == 0 else rng.uniform(15, 45)), "r": float(rng.uniform(10, 24)),
             "a": float(rng.uniform(0, 2 * math.pi)), "monedas": [bool(m) for m in rng.random(12) < 0.5]} for i in range(n)]


def _vector(texto):
    v = re.findall(r"(-?[\d.]+)d", texto)
    return tuple(map(float, v)) if len(v) == 3 else None


def pos_de(nombre):
    return _vector(rcon(f"data get entity {nombre} Pos"))


def salud_de(nombre):
    m = re.search(r"entity data: (-?[\d.]+)f", rcon(f"data get entity {nombre} Health"))
    return float(m.group(1)) if m else None


def quitar_amenazas():
    rcon(f"kill @e[tag={ETIQUETA_AMENAZA}]")


class Vigia(threading.Thread):
    """Cada 0,5 s durante un episodio: posición y vida del personaje (RCON) y, con amenazas, la amenaza de prueba (aparecer,
    acercarse a 1 bloque/s, desaparecer) y la vida simulada."""

    def __init__(self, nombre, cal=None):
        super().__init__(daemon=True)
        self.nombre, self.cal, self.parar = nombre, cal, threading.Event()
        self.muestras = []  # (t, x, y, z, salud)
        self.amenaza = None  # {"pos": [x, y, z], "t0", "cerca", "huidas", "slot"}
        self.slot, self.proxima = 0, (cal[0]["espera"] if cal else None)
        self.sim, self.vida_sim, self.muertes_sim, self.expuesto = 20.0, 0.0, 0, 0.0
        self.aparecidas, self.fin_amenazas, self.en_zona, self.zona_pos = 0, Counter(), 0, []

    def _aparecer(self, t, bot):
        s = self.cal[self.slot % len(self.cal)]
        for giro in range(8):
            a = s["a"] + giro * math.pi / 4
            x, z = bot[0] + s["r"] * math.cos(a), bot[2] + s["r"] * math.sin(a)
            if not en_zona(math.floor(x), math.floor(z)):
                rcon(f"{OW} run summon minecraft:{TIPO_AMENAZA} {x:.2f} {bot[1]:.2f} {z:.2f} {{NoAI:1b,NoGravity:1b,Invulnerable:1b,"
                     f"Silent:1b,PersistenceRequired:1b,Tags:[\"{ETIQUETA_AMENAZA}\"]}}")
                self.amenaza = {"pos": [x, bot[1], z], "t0": t, "cerca": False, "huidas": 0, "slot": s}
                self.aparecidas += 1
                return
        self.proxima = t + 10  # todo en zonas: lo intenta luego

    def _quitar(self, t, motivo):
        quitar_amenazas()
        self.fin_amenazas[motivo] += 1
        self.amenaza = None
        self.slot += 1
        self.proxima = t + self.cal[self.slot % len(self.cal)]["espera"]

    def run(self):
        t0 = time.time()
        previo = t0
        while not self.parar.is_set():
            ahora = time.time()
            t, dt = ahora - t0, ahora - previo
            previo = ahora
            bot, salud = pos_de(self.nombre), salud_de(self.nombre)
            if bot:
                self.muestras.append((round(t, 1), *(round(v, 2) for v in bot), salud))
                if en_zona(math.floor(bot[0]), math.floor(bot[2])):
                    self.en_zona += 1
                    self.zona_pos.append([round(t, 1), *(round(v, 1) for v in bot)])
            if self.cal and bot:
                am = self.amenaza
                dentro = math.hypot(bot[0] - CENTRO[0], bot[2] - CENTRO[1]) <= CORREA
                if am is None and t >= self.proxima and dentro:
                    self._aparecer(t, bot)
                elif am is not None and not dentro:
                    self._quitar(t, "fuera del arbolado")
                elif am is not None:
                    d = math.hypot(bot[0] - am["pos"][0], bot[2] - am["pos"][2])
                    if d > 1.5:  # se acerca a 1 bloque/s, a la altura del personaje; no entra en las zonas
                        paso = min(dt, d - 1.5)
                        x = am["pos"][0] + (bot[0] - am["pos"][0]) / d * paso
                        z = am["pos"][2] + (bot[2] - am["pos"][2]) / d * paso
                        if not en_zona(math.floor(x), math.floor(z)):
                            am["pos"] = [x, bot[1], z]
                            rcon(f"{OW} run tp @e[tag={ETIQUETA_AMENAZA},limit=1] {x:.2f} {bot[1]:.2f} {z:.2f}")
                        d = math.hypot(bot[0] - am["pos"][0], bot[2] - am["pos"][2])
                    perdida = min(self.sim, max(dt - max(d - 2, 0), 0))  # la fórmula del simulador
                    self.sim -= perdida
                    self.vida_sim += perdida
                    self.expuesto += dt if d <= 6 else 0
                    if self.sim <= 0:
                        self.muertes_sim += 1
                        self.sim = 20.0
                    if d < 8:
                        am["cerca"] = True
                    if d > 32:
                        self._quitar(t, "lejos")
                    elif t - am["t0"] > 120:
                        self._quitar(t, "120 s")
                    elif am["cerca"] and d >= 16:  # se le escapó: pierde el rastro con prob. 0,5
                        moneda = am["slot"]["monedas"][am["huidas"] % 12]
                        am["huidas"] += 1
                        am["cerca"] = False
                        if moneda:
                            self._quitar(t, "perdió el rastro")
                if self.amenaza is None:
                    self.sim = min(20.0, self.sim + dt / 4)
            self.parar.wait(max(0.0, 0.5 - (time.time() - ahora)))

    def resumen(self):
        m = self.muestras
        dist = sum(math.hypot(b[1] - a[1], b[3] - a[3]) for a, b in zip(m, m[1:]) if math.hypot(b[1] - a[1], b[3] - a[3]) < 15)
        saludes = [s[4] for s in m if s[4] is not None]
        perdida = sum(max(0.0, a - b) for a, b in zip(saludes, saludes[1:]))
        muertes = sum(a > 0 >= b for a, b in zip(saludes, saludes[1:]))
        return {"distancia": round(dist, 1), "muestras": len(m), "vida_perdida": round(perdida, 1), "muertes": muertes,
                "vida_sim": round(self.vida_sim, 1), "muertes_sim": self.muertes_sim, "expuesto_s": round(self.expuesto, 1),
                "amenazas_aparecidas": self.aparecidas, "fin_amenazas": dict(self.fin_amenazas), "posiciones_en_zona": self.en_zona,
                "zona_pos": self.zona_pos[:20]}


# ---------- ejecuciones ----------

def filtro_de(condicion, ruido, rng):
    """La observación que ve la red: noche fijada por la condición y, con ruido, distancias ± 10 % y entradas borradas (5 %)."""
    def f(o):
        o = np.array(o, dtype=np.float64)
        o[I["noche"]] = 1.0 if condicion == "amenazas" else 0.0
        if ruido:
            for i in DISTANCIAS:
                if o[i] < 1:
                    o[i] = min(1.0, o[i] * rng.uniform(0.9, 1.1))
            o[rng.random(len(o)) < 0.05] = 0.0
        return o
    return f


def celdas(a):
    base = [{"perfil": p, "condicion": c, "variante": "base", "replica": 0} for c in a.condiciones.split(",") for p in a.perfiles.split(",")]
    otras = []
    for v in filter(None, a.variantes.split(",")):
        tipo, _, arg = v.partition(":")
        perfil = arg.split(">")[0]
        otras.append({"perfil": perfil, "condicion": CONDICION_VARIANTES, "variante": v if tipo == "meta" else "ruido", "replica": 0})
    for r in filter(None, a.repetir.split(",")):
        cel, _, n = r.partition(":")
        p, c = cel.split("/")
        otras += [{"perfil": p, "condicion": c, "variante": "base", "replica": i} for i in range(1, int(n or 2) + 1)]
    return base, otras


def clave(c, k):
    return f"{c['perfil']}/{c['condicion']}/{c['variante']}/r{c['replica']}/p{k}"


def mitades(jsonl, etiqueta, cambio, vigia_muestras, final):
    """Métricas antes y después del cambio de meta (decisiones con t < cambio / ≥ cambio)."""
    ds = [json.loads(l) for l in open(jsonl)]
    ds = [d for d in ds if d["etiqueta"] == etiqueta]
    out = []
    for lo, hi in ((0, cambio), (cambio, 1e9)):
        sel = [d for d in ds if lo <= d["t"] < hi]
        g0 = sel[0]["datos"].get("ganados", 0) if sel else 0
        sig = [d for d in ds if d["t"] >= hi]
        g1 = sig[0]["datos"].get("ganados", 0) if sig else final
        m = [s for s in vigia_muestras if lo <= s[0] < hi]
        dist = sum(math.hypot(b[1] - a[1], b[3] - a[3]) for a, b in zip(m, m[1:]) if math.hypot(b[1] - a[1], b[3] - a[3]) < 15)
        dj = [d["jugador"] for d in sel if d.get("jugador") is not None]
        out.append({"troncos": (g1 or 0) - (g0 or 0), "decisiones": len(sel), "junto": round(sum(x <= 6 for x in dj) / len(sel), 2) if sel else None,
                    "distancia": round(dist, 1), "uso": dict(Counter(d["habilidad"] for d in sel))})
    return out


def huir_vista(jsonl, etiqueta):
    """[decisiones con la amenaza a la vista (< 16 bloques), cuántas de ellas fueron huir] (métrica añadida tras la primera serie)."""
    ds = [d for d in map(json.loads, open(jsonl)) if d["etiqueta"] == etiqueta and d["datos"].get("amenaza")]
    return [len(ds), sum(d["habilidad"] == "huir" for d in ds)]


def jugadores():
    r = rcon("list")
    # la salida de RCON se comparte entre conexiones simultáneas (otro lector puede colar la suya): solo nombres válidos
    return [n.strip() for n in r.split("online:", 1)[1].split(",") if re.fullmatch(r"\w{3,16}", n.strip())] if "online:" in r else []


def medir(a):
    previas = sorted((AQUI / "ejecuciones").glob("experimentos-[0-9]*[0-9].json"))
    salida = Path(a.salida or (previas[-1] if a.seguir and previas else AQUI / "ejecuciones" / f"experimentos-{time.strftime('%Y%m%d')}.json"))
    hechas = json.loads(salida.read_text())["ejecuciones"] if a.seguir and salida.exists() else []
    hecho = {e["clave"] for e in hechas}
    puerto = a.puerto
    p = {"nombre": nombre_de(puerto), "puerto": puerto}
    if not orden("obs", 10, puerto).startswith("{"):
        sys.exit(f"el bot no responde a obs en 127.0.0.1:{puerto}")
    perfil0 = json.loads(orden("perfil", 10, puerto))["perfil"]
    cofre0 = json.loads(orden("cofre", 10, puerto))
    tp(p, CENTRO[0] - 5, CENTRO[1])  # el arbolado cargado alrededor del personaje: si no, la comprobación de agua de punto() no ve nada
    time.sleep(4)
    me.ZONA = [int(v) for v in a.excluir.split(",")] if a.excluir else None
    random.seed(a.semilla)
    puntos = [me.punto() for _ in range(a.N)]
    base, otras = celdas(a)
    jsonl = AQUI / "ejecuciones" / f"experimentos-{time.strftime('%Y%m%d-%H%M')}.jsonl"
    red = politica("red")
    total = len(base + otras) * a.N
    print(f"puntos {puntos} · {len(base)} celdas base + {len(otras)} variantes/réplicas × {a.N} puntos = {total} ejecuciones "
          f"({len(hecho)} ya hechas) de {a.segundos:.0f} s · {p['nombre']}:{puerto}", flush=True)
    (print if a.prueba else anotar)(f"## Experimentos F5 · inicio {time.strftime('%Y-%m-%d %H:%M')} ({p['nombre']} solo, red, {a.segundos:.0f} s por ejecución; "
           f"puntos de medir_ejecutor con semilla {a.semilla}: {', '.join(f'({x},{z})' for x, z in puntos)}; aldeano de prueba en {a.jugador})\n"
           f"Criterio (fijado antes de medir): un perfil se distingue del recolector en una métrica si |media de la diferencia por punto| > "
           f"2 σ_rep (σ_rep: desviación típica entre réplicas del mismo punto de la celda {a.repetir.split(':')[0]}, agrupada) y la diferencia "
           f"tiene el mismo signo en los {a.N} puntos. Detalle en ejecuciones/{salida.name}.")
    vistos = set()
    orden("cofre no", 10, puerto)  # sin cofre: lo ganado se quita del inventario tras cada ejecución
    apartado = {p["nombre"]: {n: c for n, c in inventario(puerto).items() if n.endswith("_log") or n == "egg"}}
    (AQUI / "ejecuciones" / "experimentos-apartado.json").write_text(json.dumps(apartado))
    for n, c in apartado[p["nombre"]].items():
        rcon(f"clear {p['nombre']} minecraft:{n} {c}")
    jx, jz = map(int, a.jugador.split(","))
    rcon(f"kill @e[type=minecraft:villager,tag={me.ETIQUETA}]")
    rcon(f"{OW} positioned {jx} 64 {jz} positioned over motion_blocking_no_leaves run summon minecraft:villager ~ ~ ~ "
         f"{{NoAI:1b,Silent:1b,Invulnerable:1b,PersistenceRequired:1b,Tags:[\"{me.ETIQUETA}\"]}}")
    orden("jugador_prueba villager", 10, puerto)
    pendiente = ({}, {})
    try:
        for fase in (base, otras):
            for k, (x, z) in enumerate(puntos, 1):
                if a.solo and k != a.solo:
                    continue
                for c in (fase if k % 2 else fase[::-1]):
                    if clave(c, k) in hecho:
                        continue
                    hechas.append(ejecutar(c, k, x, z, p, a, red, jsonl, pendiente, vistos))
                    pendiente = hechas[-1].pop("_pendiente")
                    hecho.add(hechas[-1]["clave"])
                    salida.write_text(json.dumps({"fecha": time.strftime("%Y-%m-%d %H:%M"), "semilla": a.semilla, "N": a.N,
                                                  "segundos": a.segundos, "cambio": a.cambio, "jugador": a.jugador, "puntos": puntos,
                                                  "repetir": a.repetir,
                                                  "ejecuciones": hechas}, ensure_ascii=False))
        tp(p, *puntos[0])
        limpiar(*pendiente)
    finally:
        quitar_amenazas()
        orden("amenaza_prueba -", 10, puerto)
        rcon(f"kill @e[type=minecraft:villager,tag={me.ETIQUETA}]")
        orden("jugador_prueba -", 10, puerto)
        poner_perfil(perfil0, puerto)
        orden(f"cofre {'si' if cofre0['activo'] else 'no'}", 10, puerto)
        orden(f"cofre umbral {cofre0['umbral']}", 10, puerto)
        me.devolver(apartado)
    print(f"hecho: {len(hechas)} ejecuciones en {salida}", flush=True)


def ejecutar(c, k, x, z, p, a, red, jsonl, pendiente, vistos):
    puerto, nombre = p["puerto"], p["nombre"]
    gente = [j for j in jugadores() if j != nombre]
    for j in set(gente) - vistos:
        rcon('tellraw @a {"text":"[laboratorio] Hola, ' + j + ': estoy midiendo experimentos con ' + nombre + ' (perfiles, 4 min cada uno). '
             'No cerraré el servidor mientras estés dentro. Por favor, no te acerques al arbolado de pruebas ni al aldeano.","color":"gray"}')
        vistos.add(j)
    poner_perfil(c["perfil"], puerto)
    quitar_amenazas()
    orden(f"amenaza_prueba {TIPO_AMENAZA}" if c["condicion"] == "amenazas" else "amenaza_prueba -", 10, puerto)
    tp(p, x, z)
    limpiar(*pendiente)  # lo de la ejecución anterior, ya con el personaje en el punto de salida
    time.sleep(3)
    inv0 = inventario(puerto)
    etiqueta = f"{c['perfil']}/{c['condicion']}/{c['variante']}/r{c['replica']} p{k} ({x},{z})"
    arbol0 = foto_arbolado(p)
    rng = np.random.default_rng([a.semilla, k, 11, c["replica"]])
    filtro = filtro_de(c["condicion"], c["variante"] == "ruido", rng)
    vistas, cambiadas = [], [0]

    def elegir(o):
        o2 = filtro(o)
        cambiadas[0] += int(np.sum(np.abs(o2 - np.asarray(o, dtype=np.float64)) > 1e-9))
        vistas.append([round(float(v), 3) for v in o2])
        return red(o2)
    vigia = Vigia(nombre, calendario(a.semilla, k) if c["condicion"] == "amenazas" else None)
    meta = None
    if c["variante"].startswith("meta:"):
        nuevo = c["variante"].split(">")[1]
        meta = threading.Timer(a.cambio, lambda: orden(f"orden perfil {nuevo}", 10, puerto))
    t0 = time.strftime("%H:%M:%S")
    vigia.start()
    if meta:
        meta.start()
    try:
        r = episodio("red", a.segundos, diario="no", jsonl=jsonl, etiqueta=etiqueta, puerto=puerto, elegir=elegir)
    finally:
        if meta:
            meta.cancel()
        vigia.parar.set()
        vigia.join(5)
        quitar_amenazas()
        orden("amenaza_prueba -", 10, puerto)
    orden("para", 10, puerto)
    ganado = inventario(puerto) - inv0
    picados = picados_de(jsonl, {etiqueta})
    arbol1 = foto_arbolado(p)
    rotos, en_zonas, naturales = comparar_arbolado(arbol0, arbol1, picados)
    if rotos:
        print(f"{etiqueta} aviso: {len(rotos)} troncos rotos sin picar_tronco (se reponen fuera de las zonas)", flush=True)
    if en_zonas:
        print(f"{etiqueta} ¡AVISO: cambios dentro de zonas protegidas (no se tocan; con jugadores dentro: {gente}): {en_zonas}!", flush=True)
    v = vigia.resumen()
    with open(jsonl.with_suffix(".red.jsonl"), "a") as f:  # lo que vio la red (con la noche fijada y, en su caso, el ruido)
        f.write(json.dumps({"etiqueta": etiqueta, "obs_red": vistas}) + "\n")
    res = {"clave": clave(c, k), **c, "k": k, "punto": [x, z], "inicio": t0, "jugadores": gente, "troncos": r.get("troncos") or 0,
           "decisiones": r.get("decisiones"), "junto": r.get("junto"), "jugador_medio": r.get("jugador_medio"), "huidas": r.get("huidas", 0),
           "interrupciones": r.get("amenazas", 0), "uso": r.get("uso"), "causas": r.get("causas"), "exitos": r.get("exitos"),
           "secuencia": r.get("secuencia"), "segundos": r.get("segundos"), **v, "entradas_cambiadas": cambiadas[0],
           "arbolado": {"foto": arbol0 is not None and arbol1 is not None, "rotos_sin_picar": len(rotos), "zonas": en_zonas,
                        "naturales": naturales}}
    res["huir_vista"] = huir_vista(jsonl, etiqueta)
    if meta:
        res["mitades"] = mitades(jsonl, etiqueta, a.cambio, vigia.muestras, res["troncos"])
    res["_pendiente"] = ({**picados, **rotos}, {nombre: ganado})
    print(f"{t0} {etiqueta}: +{res['troncos']} troncos · junto {res['junto']} · {v['distancia']} bloques · huidas {res['huidas']} · "
          f"interrumpido {res['interrupciones']} · amenazas {v['amenazas_aparecidas']} · vida sim −{v['vida_sim']} ({v['muertes_sim']} muertes) · "
          f"real −{v['vida_perdida']} · {res['decisiones']} decisiones {fmt_uso(res['uso'])}" + (f" · mitades {res['mitades']}" if meta else "")
          + (f" · jugadores {gente}" if gente else ""), flush=True)
    return res


# ---------- resumen ----------

def fmt_uso(uso):
    n = sum((uso or {}).values()) or 1
    return "/".join(f"{100 * (uso or {}).get(h, 0) / n:.0f}" for h in HABILIDADES)


def valor(e, m):
    if m == "huir_vista":  # % de las decisiones con la amenaza a la vista que fueron huir (nan sin amenaza a la vista)
        v, h = e.get("huir_vista") or (0, 0)
        return 100 * h / v if v else float("nan")
    return 100 * (e.get("junto") or 0) if m == "junto" else (e.get(m) or 0)


def resumen(ruta, diario=False, criterio="recolector/amenazas"):
    d = json.loads(Path(ruta).read_text())
    eps = d["ejecuciones"]
    por = {}
    for e in eps:
        por.setdefault((e["perfil"], e["condicion"], e["variante"], e["replica"]), {})[e["k"]] = e
    ks = sorted({e["k"] for e in eps})
    lineas = [f"Experimentos F5 · {len(eps)} ejecuciones de {d['segundos']:.0f} s · puntos {d['puntos']} · aldeano en {d['jugador']}",
              "", "| perfil · condición · variante | troncos (± sd) | junto al jugador % | bloques recorridos | huidas | interrupciones | "
              "vida perdida sim. (real) | muertes sim. | uso A/P/R/J/H/O % |", "|---|---|---|---|---|---|---|---|---|"]
    for (perfil, cond, var, rep), es in sorted(por.items(), key=lambda kv: (kv[0][2] != "base", kv[0][1], kv[0][3], kv[0][0])):
        v = list(es.values())
        f = lambda m: np.mean([valor(e, m) for e in v])
        sd = np.std([e["troncos"] for e in v], ddof=1) if len(v) > 1 else float("nan")
        uso = Counter()
        for e in v:
            uso.update(e.get("uso") or {})
        lineas.append(f"| {perfil} · {'pac.' if cond == 'pacifico' else 'amen.'} · {var}{' r' + str(rep) if rep else ''} | {f('troncos'):.1f} ± {sd:.1f} | "
                      f"{f('junto'):.0f} | {f('distancia'):.0f} | {f('huidas'):.1f} | {f('interrupciones'):.1f} | {f('vida_sim'):.1f} ({f('vida_perdida'):.1f}) | "
                      f"{f('muertes_sim'):.2f} | {fmt_uso(uso)} |" + ("" if len(v) == len(ks) else f" (solo {len(v)} puntos)"))
    # dispersión entre réplicas: cada celda repetida da la σ_rep de su condición
    reps = {}
    for (perfil, cond, var, rep), es in por.items():
        if var == "base":
            reps.setdefault((perfil, cond), {})[rep] = es
    sigmas = {}  # condición → {métrica: σ_rep}
    for (pr, cr), r in sorted(reps.items()):
        if len(r) < 2:
            continue
        sigma, txt = {}, []
        for m in METRICAS:
            var_k = [np.var([valor(r[i][k], m) for i in r if k in r[i]], ddof=1) for k in ks if sum(k in r[i] for i in r) > 1]
            var_k = [v for v in var_k if not math.isnan(v)]
            sigma[m] = math.sqrt(np.mean(var_k)) if var_k else float("nan")
            por_k = [[valor(r[i][k], m) for i in sorted(r) if k in r[i]] for k in ks]
            txt.append(f"{m} σ_rep {sigma[m]:.1f} (por punto: {' · '.join('/'.join(f'{x:.0f}' for x in vk) for vk in por_k)})")
        sigmas[cr] = sigma
        lineas += ["", f"Réplicas de {pr} · {cr} ({len(r)} pasadas, en horas distintas): " + "; ".join(txt) + "."]
    # comparaciones con el recolector (base, réplica 0): con el criterio fijado (σ de la celda del criterio) y con la σ de su condición
    pre = sigmas.get(criterio.split("/")[1], {})
    lineas += ["", f"Frente al recolector (diferencia media por punto y, entre paréntesis, punto a punto). ✓ = |media| > 2 σ_rep y mismo signo en "
               f"todos los puntos; «fijado»: σ de {criterio} (el criterio escrito antes de medir); «propia»: σ de la réplica de su condición.",
               "", "| perfil · condición | troncos | junto % | bloques | huidas | huir con la amenaza a la vista % | criterio fijado | con σ propia |",
               "|---|---|---|---|---|---|---|---|"]
    distinguen = {}
    for cond in sorted({e["condicion"] for e in eps}):
        ref = por.get(("recolector", cond, "base", 0))
        if not ref:
            continue
        for perfil in sorted({e["perfil"] for e in eps if e["condicion"] == cond and e["variante"] == "base"} - {"recolector"}):
            otro = por.get((perfil, cond, "base", 0))
            if not otro:
                continue
            comun = [k for k in ks if k in ref and k in otro]
            celdas_, si = [], {"fijado": [], "propia": []}
            for m in METRICAS:
                dif = [valor(otro[k], m) - valor(ref[k], m) for k in comun]
                dif = [x for x in dif if not math.isnan(x)]
                mismo = bool(dif) and (all(x > 0 for x in dif) or all(x < 0 for x in dif))
                for nombre, sg in (("fijado", pre), ("propia", sigmas.get(cond, {}))):
                    s = sg.get(m, float("nan"))
                    if mismo and not math.isnan(s) and abs(np.mean(dif)) > 2 * s:
                        si[nombre].append(m)
                if m in ("troncos", "junto", "distancia", "huidas", "huir_vista"):
                    celdas_.append(f"{np.mean(dif):+.0f} ({'/'.join(f'{x:+.0f}' for x in dif)})" if dif else "–")
            distinguen[(perfil, cond)] = si
            ver = lambda n: ", ".join(si[n]) if si[n] else ("no" if (pre if n == "fijado" else sigmas.get(cond)) else "sin réplica")
            lineas.append(f"| {perfil} · {cond} | " + " | ".join(celdas_) + f" | {ver('fijado')} | {ver('propia')} |")
    lineas.append("")
    # variantes
    for (perfil, cond, var, rep), es in por.items():
        if var == "base":
            continue
        ref = por.get((perfil, cond, "base", 0), {})
        comun = [k for k in ks if k in es and k in ref]
        if var == "ruido":
            txt = [f"{m} {np.mean([valor(es[k], m) - valor(ref[k], m) for k in comun]):+.1f}" for m in ("troncos", "junto", "distancia")]
            lineas.append(f"- Ruido, {perfil} ({cond}), frente a sin ruido: " + " · ".join(txt) +
                          f" (entradas cambiadas por decisión: {np.mean([es[k]['entradas_cambiadas'] / max(es[k]['decisiones'] or 1, 1) for k in es]):.1f})")
        elif var.startswith("meta:"):
            a_, b_ = var.split(":")[1].split(">")
            mi = [es[k].get("mitades") for k in es if es[k].get("mitades")]
            if mi:
                h = lambda i, m: np.mean([x[i][m] if m != "junto" else 100 * (x[i][m] or 0) for x in mi])
                lineas.append(f"- Meta {a_} → {b_} (orden a los {d.get('cambio', 120)} s; {len(mi)} puntos): antes troncos {h(0, 'troncos'):.1f}, "
                              f"junto {h(0, 'junto'):.0f} %, {h(0, 'distancia'):.0f} bloques · después troncos {h(1, 'troncos'):.1f}, "
                              f"junto {h(1, 'junto'):.0f} %, {h(1, 'distancia'):.0f} bloques")
    zonas = sorted({n for e in eps for n in (e.get("arbolado") or {}).get("zonas", {})})
    lineas.append(f"- Zonas: posiciones del personaje dentro de una zona {sum(e.get('posiciones_en_zona', 0) for e in eps)}; troncos rotos sin picar "
                  f"{sum((e.get('arbolado') or {}).get('rotos_sin_picar', 0) for e in eps)}; cambios en zonas según la foto: {', '.join(zonas) or 'ninguno'}"
                  + (f" (con jugadores conectados: {sorted({j for e in eps for j in e.get('jugadores', []) if re.fullmatch(r'[A-Za-z]\w{2,15}', j)})})"
                     if any(e.get("jugadores") for e in eps) else ""))
    texto = "\n".join(lineas)
    print(texto)
    if diario:
        anotar(f"## Experimentos F5 · tabla ({time.strftime('%Y-%m-%d %H:%M')})\n" + texto)
    return distinguen


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = ap.add_subparsers(dest="que", required=True)
    m = sub.add_parser("medir")
    m.add_argument("--perfiles", default=PERFILES)
    m.add_argument("--condiciones", default="pacifico,amenazas")
    m.add_argument("--variantes", default=VARIANTES)
    m.add_argument("--repetir", default="recolector/amenazas:2", help="PERFIL/CONDICION:VECES (réplicas extra de esa celda)")
    m.add_argument("--N", type=int, default=4)
    m.add_argument("--semilla", type=int, default=42)
    m.add_argument("--segundos", type=float, default=240)
    m.add_argument("--cambio", type=float, default=120, help="s hasta la orden «perfil B» en la variante meta")
    m.add_argument("--jugador", default="284,43")
    m.add_argument("--excluir", default="305,10,317,21", help="rectángulo X1,Z1,X2,Z2 sin puntos de partida (la zona alterada, como la línea base)")
    m.add_argument("--puerto", type=int, default=3001)
    m.add_argument("--salida", help="por defecto ejecuciones/experimentos-AAAAMMDD.json (con --seguir, el último que haya)")
    m.add_argument("--seguir", action="store_true", help="continúa la salida: salta las ejecuciones ya hechas")
    m.add_argument("--solo", type=int, help="solo el punto K (para probar)")
    m.add_argument("--prueba", action="store_true", help="no escribe en el diario")
    r = sub.add_parser("resumen")
    r.add_argument("ruta", nargs="?", help="por defecto, el último ejecuciones/experimentos-AAAAMMDD.json")
    r.add_argument("--diario", action="store_true")
    r.add_argument("--criterio", default="recolector/amenazas", help="celda repetida cuya σ fija el criterio (la escrita antes de medir)")
    a = ap.parse_args()
    if a.que == "medir":
        medir(a)
    else:
        resumen(a.ruta or sorted((AQUI / "ejecuciones").glob("experimentos-[0-9]*[0-9].json"))[-1], a.diario, a.criterio)


if __name__ == "__main__":
    main()
