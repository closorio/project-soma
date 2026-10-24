#!/usr/bin/env python3
"""F7.5-F7.6 · una noche de verdad en el mundo de supervivencia con el modo libre del bot y la red de supervivencia (una sesión
corta, no la matriz de F7.6), con el servidor ya en marcha (./arrancar.sh). Pasos:
1. Campamento y puntos de partida (F7.5, si mundo.json aún no los tiene): el campamento, un punto llano y seco a ≤ 40 bloques de
   la aparición (que está en el bosque); 4 puntos a 15-30 bloques de él sin agua ni lava en 8 bloques (alturas y bloques con
   `positioned over motion_blocking_no_leaves`, que ve el agua bajo las hojas). Los escribe en mundos/supervivencia/mundo.json
   (campamento, puntos) y el rectángulo de obras (radio 64) en mundos/supervivencia/obras.json (permitido).
2. Conecta un bot temporal (bot/io.js con IO_SERVIDOR=supervivencia e IO_POLITICA; Prueba1, puerto 3101, en modo órdenes), lo
   lleva al punto, fija el equipo de F7.6 (clear + give: 1 hacha de madera, 4 pan, 4 tierra; --desnudo: nada), salud y hambre
   llenas, mata los monstruos a ≤ 64 y pone el atardecer (time set 12000, la noche entera dentro de la ejecución), con la muerte
   real (keep_inventory false) y el ciclo del día en marcha. Reflejos encendidos (la regla del usuario: huir solo con más de 2
   hostiles o salud < 8; acorralado se defiende; del creeper se aparta).
3. Modo libre hasta las 6:29 del día siguiente (como ESPERA_HASTA del simulador), hasta la muerte o --max segundos. Vigía por RCON
   cada segundo (salud, posición, hora) y medir_carga.py en paralelo (--anotar: el consumo queda en mundo.json, «carga»).
4. Al acabar: modo órdenes, el informe del bot (resumen todo), cierra el bot por su PID, repone los bloques que cambiaron
   refugiarse y salir_del_refugio (las líneas [terreno] del registro del bot), mata monstruos y objetos sueltos a ≤ 64 del punto y
   de donde acabó, pone el día y guarda (save-all). El servidor sigue en marcha: ./guardar.sh --copia ETIQUETA y ./parar.sh.
Comprueba la memoria disponible cada segundo y para si baja de 800 MB. Resultado en logs/noche-AAAAMMDD-HHMM.json y una línea
«RESULTADO noche: …».
Uso: python3 probar_noche.py [--perfil supervivencia] [--politica RUTA] [--punto 0] [--hora 12000] [--desnudo] [--max 800] [--nombre Prueba1]
     [--puerto 3101] [--solo-puntos]
"""
import argparse, json, math, os, re, signal, subprocess, sys, time, urllib.parse, urllib.request
from collections import Counter
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
sys.path.insert(0, str(RAIZ / "servidor"))
from rcon import rcon, hora

MUNDO_SV = os.environ.get("IO_SERVIDOR") or "supervivencia"  # F8: el mismo banco en otro mundo (p. ej. local, 26.1.2)
(Path(__file__).resolve().parent / "logs").mkdir(exist_ok=True)  # registros del banco (ignorados por git)

OW = "execute in minecraft:overworld"
MUNDO = RAIZ / "mundos" / MUNDO_SV / "mundo.json"
OBRAS = RAIZ / "mundos" / MUNDO_SV / "obras.json"
POLITICA = RAIZ / "entrenamiento" / "politica_supervivencia_dagger3.json"  # la oficial (semilla 0 de DAgger 3; decisión del usuario 2026-10-16)
MIN_MB = 800
ETIQ = "noche_sv"
HOSTILES = ("zombie", "skeleton", "creeper", "spider", "cave_spider", "enderman", "witch", "drowned", "husk", "stray", "slime",
            "zombie_villager", "phantom", "bogged", "pillager")
KIT = (("wooden_axe", 1), ("bread", 4), ("dirt", 4))  # el equipo «hacha + pan + tierra» de F7.6
FIN_HORA = 483  # 6:29 (ticks tras el amanecer): la espera al día del simulador (ESPERA_HASTA)


class Parada(Exception):
    pass


def r(cmd):
    return rcon(cmd, servidor=MUNDO_SV)


def memoria_mb():
    for l in open("/proc/meminfo"):
        if l.startswith("MemAvailable:"):
            return int(l.split()[1]) // 1024


# ---- 1 · campamento y puntos ----
def altura(x, z):
    """y de los pies sobre el suelo en (x, z) (motion_blocking_no_leaves: los troncos cuentan, las hojas no)."""
    r(f'{OW} positioned {x} 0 {z} positioned over motion_blocking_no_leaves run summon minecraft:marker ~ ~ ~ {{Tags:["{ETIQ}_h"]}}')
    t = r(f"data get entity @e[type=minecraft:marker,tag={ETIQ}_h,limit=1] Pos[1]")
    r(f"kill @e[type=minecraft:marker,tag={ETIQ}_h]")
    m = re.search(r"(-?[\d.]+)d", t)
    return int(float(m[1])) if m else None


def liquido(x, z):
    """«water», «lava», None o «sin cargar» (un trozo sin cargar no cuenta como seco: sin jugador cerca no se puede mirar)."""
    for b in ("water", "lava"):
        t = r(f"{OW} positioned {x} 0 {z} positioned over motion_blocking_no_leaves if block ~ ~-1 ~ minecraft:{b}")
        if "passed" in t:
            return b
        if "failed" not in t:
            return "sin cargar"
    return None


def seco(x, z, R=8, paso=2):
    return all(not liquido(x + dx, z + dz) for dx in range(-R, R + 1, paso) for dz in range(-R, R + 1, paso))


def llano(x, z):
    """(llano, y): ≥ 70 % de 5×5 columnas (cada 2 bloques) a ±1 de la del centro (los troncos sueltos no lo estropean)."""
    y0 = altura(x, z)
    if y0 is None:
        return False, None
    hs = [altura(x + dx, z + dz) for dx in range(-4, 5, 2) for dz in range(-4, 5, 2)]
    return sum(1 for h in hs if h is not None and abs(h - y0) <= 1) >= 0.7 * len(hs), y0


def elegir_puntos(log):
    d = json.loads(MUNDO.read_text())
    ax, _, az = d["aparicion"]
    camp = None
    for rad in (0, 8, 16, 24, 32, 40):
        for k in range(8 if rad else 1):
            a = k * math.pi / 4
            x, z = round(ax + rad * math.cos(a)), round(az + rad * math.sin(a))
            ok_llano, y = llano(x, z)
            if ok_llano and seco(x, z):
                camp = [x, y, z]
                break
        if camp:
            break
    if not camp:
        raise Parada("no encontré un sitio llano y seco a ≤ 40 bloques de la aparición para el campamento")
    log(f"campamento: {camp}")
    puntos = []
    for rad in (20, 25, 15, 30):
        for k in range(8):
            a = k * math.pi / 4 + (rad % 10) * math.pi / 40
            x, z = round(camp[0] + rad * math.cos(a)), round(camp[2] + rad * math.sin(a))
            if any(math.hypot(x - p[0], z - p[2]) < 16 for p in puntos):
                continue
            if seco(x, z):
                puntos.append([x, altura(x, z), z])
                log(f"punto {len(puntos) - 1}: {puntos[-1]} (a {rad} del campamento)")
            if len(puntos) == 4:
                break
        if len(puntos) == 4:
            break
    if len(puntos) < 4:
        raise Parada(f"solo encontré {len(puntos)} puntos secos a 15-30 bloques del campamento")
    d["campamento"], d["puntos"] = camp, puntos
    d["nota_puntos"] = (f"F7.5 ({time.strftime('%Y-%m-%d %H:%M')}, probar_noche.py): campamento llano (≥ 70 % de 5×5 a ±1) y sin agua "
                        "ni lava en 8 bloques, a ≤ 40 de la aparición; puntos a 15-30 del campamento, sin agua ni lava en 8 bloques")
    MUNDO.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n")
    o = json.loads(OBRAS.read_text())
    o["permitido"] = {"x1": camp[0] - 64, "z1": camp[2] - 64, "x2": camp[0] + 64, "z2": camp[2] + 64,
                      "nota": "F7.5: radio 64 alrededor del campamento (mundos/supervivencia/mundo.json), mundo de pruebas"}
    OBRAS.write_text(json.dumps(o, ensure_ascii=False, indent=1) + "\n")
    return d


# ---- 2-4 · la noche ----
class Bot:
    def __init__(self, nombre, puerto):
        self.nombre, self.puerto = nombre, puerto

    def orden(self, c, t=30):
        try:
            return urllib.request.urlopen(f"http://127.0.0.1:{self.puerto}/?c=" + urllib.parse.quote(c), timeout=t).read().decode().strip()
        except Exception as e:
            return f"sin respuesta: {e}"

    def json(self, c, t=30):
        try:
            return json.loads(self.orden(c, t))
        except ValueError:
            return {}


def vigia(nombre):
    """(salud, [x, y, z], hora del día) por RCON."""
    s = re.search(r"(-?[\d.]+)f", r(f"data get entity {nombre} Health"))
    p = re.findall(r"(-?[\d.]+)d", r(f"data get entity {nombre} Pos"))
    _, h = hora(r=r)  # F8: 1.21.11 y 26.1 (servidor/rcon.py)
    return (float(s[1]) if s else None, [round(float(v), 1) for v in p[:3]] if len(p) >= 3 else None, h)


def muertes(nombre):
    m = re.search(r"has (\d+) \[", r(f"scoreboard players get {nombre} {ETIQ}"))
    return int(m[1]) if m else 0


def gamerule(nombre, valor=None):
    t = r(f"gamerule {nombre}" + (f" {valor}" if valor is not None else ""))
    m = re.search(r"(true|false)", t)
    return m[1] if m else t.strip()


def matar_cerca(p, R=64, objetos=True):
    x, y, z = (round(v) for v in p)
    for h in HOSTILES:
        r(f"kill @e[type=minecraft:{h},x={x},y={y},z={z},distance=..{R}]")
    if objetos:
        r(f"kill @e[type=minecraft:item,x={x},y={y},z={z},distance=..{R}]")


def reponer_terreno(registro_bot):
    """Lo que había antes en cada casilla que tocaron refugiarse y salir_del_refugio (la primera vez que se tocó): rotos → el
    bloque que había; puestos → aire. Devuelve [x, y, z, bloque] repuestos."""
    original = {}
    for linea in Path(registro_bot).read_text(errors="replace").splitlines():
        if "[terreno] " not in linea:
            continue
        try:
            t = json.loads(linea.split("[terreno] ", 1)[1])
        except ValueError:
            continue
        for x, y, z, n in t.get("rotos", []):
            original.setdefault((x, y, z), n)
        for x, y, z, _ in t.get("puestos", []):
            original.setdefault((x, y, z), "air")
    hechos, trozos = [], sorted({(x >> 4, z >> 4) for x, _, z in original})
    for cx, cz in trozos:  # sin jugador cerca los trozos se descargan (1.21.11 no guarda los de la aparición)
        r(f"{OW} run forceload add {cx * 16} {cz * 16}")
    try:
        for (x, y, z), n in original.items():
            b = n if ":" in n else "minecraft:" + n
            t = r(f"{OW} run setblock {x} {y} {z} {b}")
            ok = "Changed" in t or "Could not set" in t  # «Could not set»: ya estaba así
            hechos.append([x, y, z, n] if ok else [x, y, z, n, "FALLO: " + t.strip()[:60]])
    finally:
        for cx, cz in trozos:
            r(f"{OW} run forceload remove {cx * 16} {cz * 16}")
    return hechos


def analizar(desde, nombre):
    """Las decisiones del modo libre de esta ejecución (entrenamiento/ejecuciones/modos-supervivencia-AAAAMMDD.jsonl)."""
    f = RAIZ / "entrenamiento" / "ejecuciones" / f"modos-{MUNDO_SV}-{time.strftime('%Y%m%d')}.jsonl"
    decs = []
    if f.exists():
        for l in f.read_text().splitlines():
            try:
                d = json.loads(l)
            except ValueError:
                continue
            if d.get("tipo") == "decision" and d.get("personaje") == nombre and d.get("t", "") >= desde:
                decs.append(d)
    usos = Counter(d["habilidad"] for d in decs)
    exitos = Counter(d["habilidad"] for d in decs if d.get("exito"))
    con_hostil = Counter(d["habilidad"] for d in decs if (d.get("datos") or {}).get("hostil"))
    causas = Counter(f"{d['habilidad']}: {str(d.get('causa', '')).split(':')[0]}" for d in decs)
    reflejos = Counter(x.rstrip("✗") for d in decs for x in d.get("reflejos", []))
    salidas = sum(1 for d in decs if d.get("salida"))
    return {"decisiones": len(decs), "usos": dict(usos), "exitos": dict(exitos), "ante_hostil": dict(con_hostil),
            "causas": dict(causas.most_common(15)), "reflejos_tras_decision": dict(reflejos), "salidas_del_refugio": salidas}


def registro_bot(ruta):
    """Del registro del bot: reflejos (todos, también en reposo), habilidades y lo que pasó."""
    txt = Path(ruta).read_text(errors="replace").splitlines()
    refl = Counter(), Counter()
    for l in txt:
        m = re.search(r"\[reflejo\] (\w+) .*\((.*)\) → (éxito|fallo)", l)
        if m:
            refl[0][m[1]] += 1
            refl[1][f"{m[1]}: {m[2].split(':')[0][:40]}"] += 1
    return {"reflejos": dict(refl[0]), "motivos": dict(refl[1].most_common(12)),
            "muertes_en_registro": sum(1 for l in txt if re.search(r"muert|died|was slain|asesinad", l, re.I)),
            "errores": [l[:160] for l in txt if "error" in l.lower()][:8]}


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--perfil", default="supervivencia")
    ap.add_argument("--politica", default=str(POLITICA))
    ap.add_argument("--punto", type=int, default=0)
    ap.add_argument("--hora", type=int, default=12000, help="hora de salida (12000 atardecer; 18000 medianoche, con monstruos ya fuera)")
    ap.add_argument("--desnudo", action="store_true")
    ap.add_argument("--max", type=float, default=800)
    ap.add_argument("--nombre", default="Prueba1")
    ap.add_argument("--puerto", type=int, default=3101)
    ap.add_argument("--solo-puntos", action="store_true")
    a = ap.parse_args()
    hora_ini = time.strftime("%Y%m%d-%H%M")
    (AQUI / "logs").mkdir(exist_ok=True)
    salida = AQUI / "logs" / f"noche-{hora_ini}.json"
    rbot = AQUI / "logs" / f"bot-{a.nombre}-noche-{hora_ini}.log"

    def log(t):
        print(f"[{time.strftime('%H:%M:%S')}] {t}", flush=True)

    if "Done" not in r("list") and "players" not in r("list"):
        sys.exit("el servidor de supervivencia no responde por RCON (./arrancar.sh)")
    mb = memoria_mb()
    if mb < MIN_MB * 2:
        sys.exit(f"solo hay {mb} MB disponibles: no empiezo")
    res = {"inicio": time.strftime("%Y-%m-%d %H:%M:%S"), "hora_salida": a.hora, "perfil": a.perfil, "politica": os.path.basename(a.politica),
           "kit": "desnudo" if a.desnudo else "hacha + 4 pan + 4 tierra", "nombre": a.nombre, "memoria_mb_inicio": mb}
    bot = carga = None
    b = Bot(a.nombre, a.puerto)
    t_inicio = None
    try:
        # el bot primero: con él cerca están cargados los trozos que se miran para elegir puntos
        env = {**os.environ, "IO_SERVIDOR": MUNDO_SV, "IO_POLITICA": a.politica}
        env.pop("IO_MODO", None)
        bot = subprocess.Popen(["node", "io.js", f"{a.nombre}:{a.puerto}:{a.perfil}:ordenes"], cwd=RAIZ / "bot",
                               stdout=open(rbot, "w"), stderr=subprocess.STDOUT, env=env, start_new_session=True)
        res["pid_bot"] = bot.pid
        for _ in range(60):
            time.sleep(1)
            if bot.poll() is not None:
                raise Parada("el bot se cerró al arrancar (mira " + rbot.name + ")")
            if "ha aparecido" in rbot.read_text(errors="replace"):
                break
        else:
            raise Parada("el bot no apareció en 60 s")
        d = json.loads(MUNDO.read_text())
        ax, ay, az = d["aparicion"]
        r(f"{OW} positioned {ax} 0 {az} positioned over motion_blocking_no_leaves run tp {a.nombre} ~ ~ ~")
        r(f"effect give {a.nombre} minecraft:resistance 30 4 true")
        time.sleep(3)
        if not d.get("puntos"):
            d = elegir_puntos(log)
        res["campamento"], res["puntos"] = d["campamento"], d["puntos"]
        if a.solo_puntos:
            return
        px, py, pz = d["puntos"][a.punto % len(d["puntos"])]
        res["punto"] = [px, py, pz]
        # reglas: muerte real, ciclo del día y monstruos
        res["reglas"] = {g: gamerule(g) for g in ("keep_inventory", "advance_time", "spawn_monsters")}
        for g in ("keep_inventory", "advance_time", "spawn_monsters"):
            if res["reglas"][g] not in ("true", "false"):
                raise Parada(f"no conozco la regla {g} en este servidor: {res['reglas'][g][:80]}")
        gamerule("keep_inventory", "false"), gamerule("advance_time", "true"), gamerule("spawn_monsters", "true")
        # el bot en el punto, con el equipo, sano y sin monstruos alrededor; el atardecer
        log(f"punto {a.punto}: {res['punto']} · perfil {a.perfil} · {res['kit']}")
        b.orden("modo ordenes"), b.orden("reflejos si")
        r(f"{OW} positioned {px} 0 {pz} positioned over motion_blocking_no_leaves run tp {a.nombre} ~ ~ ~")
        time.sleep(2)
        matar_cerca([px, py, pz])
        r(f"clear {a.nombre}")
        if not a.desnudo:
            for it, n in KIT:
                r(f"give {a.nombre} minecraft:{it} {n}")
        r(f"effect clear {a.nombre}")
        r(f"effect give {a.nombre} minecraft:instant_health 1 10 true")
        r(f"effect give {a.nombre} minecraft:saturation 1 20 true")
        r(f"scoreboard objectives remove {ETIQ}")  # las muertes, sin perder ninguna entre dos lecturas de la salud
        r(f"scoreboard objectives add {ETIQ} deathCount")
        r(f"time set {a.hora}")
        time.sleep(2)
        s0, p0, h0 = vigia(a.nombre)
        res["salida"] = {"salud": s0, "pos": p0, "hora": h0, "obs": (b.json("obs_sv").get("datos") or {})}
        carga = subprocess.Popen([sys.executable, str(RAIZ / "entrenamiento" / "medir_carga.py"), "--servidor", MUNDO_SV,
                                  "--segundos", str(int(a.max)), "--intervalo", "5", "--etiqueta", f"noche {a.perfil}", "--anotar"],
                                 stdout=open(AQUI / "logs" / f"carga-noche-{hora_ini}.log", "w"), stderr=subprocess.STDOUT,
                                 start_new_session=True)
        desde = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime())
        res["libre"] = b.orden("modo libre")
        t_inicio = time.time()
        log(f"modo libre: {res['libre']}")
        # 3 · vigía
        serie, salud_min, muerte, paso_medianoche, perdida, s_prev = [], s0 or 20, None, False, 0.0, s0 or 20
        while time.time() - t_inicio < a.max:
            time.sleep(1)
            mb = memoria_mb()
            if mb < MIN_MB:
                raise Parada(f"solo quedan {mb} MB de memoria disponible (mínimo {MIN_MB}): paro")
            if bot.poll() is not None:
                raise Parada("el bot se cerró durante la noche")
            s, p, h = vigia(a.nombre)
            t = round(time.time() - t_inicio)
            if s is not None:
                perdida += max(0.0, s_prev - s)
                s_prev = s
                salud_min = min(salud_min, s)
            serie.append([t, s, p, h])
            if t % 30 == 0:
                log(f"t {t} s · salud {s} · hora {h} · {p} · {mb} MB")
            if (s is not None and s <= 0) or muertes(a.nombre):
                muerte = {"t": t, "hora": h, "pos": p, "salud": s}
                log(f"MUERTO a los {t} s (hora {h})")
                time.sleep(3)
                break
            if h is not None and h < min(12000, a.hora):
                paso_medianoche = True
            if paso_medianoche and h is not None and h >= FIN_HORA:
                log(f"amaneció (hora {h}) a los {t} s")
                break
        res["segundos"] = round(time.time() - t_inicio)
        res["sobrevive"] = muerte is None and paso_medianoche
        res["muerte"], res["salud_min"], res["vida_perdida"] = muerte, salud_min, round(perdida, 1)
        res["serie"] = serie[::5]
        b.orden("modo ordenes")
        time.sleep(1)
        fin = b.json("obs_sv").get("datos") or {}
        res["final"] = {k: fin.get(k) for k in ("pos", "salud", "hambre", "comida", "troncos", "arma", "tierra", "en_refugio", "refugio", "hostiles")}
        inf = b.json("resumen todo")
        ev = Counter(e.get("tipo") for e in inf.get("eventos", []))
        res["eventos"] = dict(ev)
        hecho = inf.get("hecho") or {}
        res["habilidades_informe"] = hecho.get("habilidades")  # éxitos y fallos por habilidad (sin los reflejos)
        res["fallos_informe"] = inf.get("fallos")
        res["golpes"] = [e for e in inf.get("eventos", []) if e.get("tipo") == "golpe"][:20]
        res["tramos"] = hecho.get("tramos", [])[-2:]
        res["decisiones"] = analizar(desde, a.nombre)
    except Parada as e:
        res["parada"] = str(e)
        log("PARADA: " + str(e))
    finally:
        # 4 · dejarlo todo como estaba
        if carga and carga.poll() is None:
            os.kill(carga.pid, signal.SIGTERM)
            try:
                carga.wait(15)
            except subprocess.TimeoutExpired:
                pass
        if bot and bot.poll() is None:
            b.orden("modo ordenes", 5)
            _, pfin, _ = vigia(a.nombre)
            res["pos_fin"] = pfin
            # que no se desconecte dentro de un refugio que se va a rellenar: aparecería emparedado la próxima vez
            c = json.loads(MUNDO.read_text()).get("campamento")
            if c:
                r(f"{OW} positioned {c[0]} 0 {c[2]} positioned over motion_blocking_no_leaves run tp {a.nombre} ~ ~ ~")
                time.sleep(1.5)
            os.kill(bot.pid, signal.SIGTERM)  # solo el bot que lanzó este guion, por su PID
            try:
                bot.wait(10)
            except subprocess.TimeoutExpired:
                os.kill(bot.pid, signal.SIGKILL)
        if rbot.exists():
            res["registro_bot"] = registro_bot(rbot)
            res["terreno_repuesto"] = reponer_terreno(rbot)
        for p in (res.get("punto"), res.get("pos_fin")):
            if p:
                matar_cerca(p)
        if t_inicio:
            r("time set 1000")
            r(f"scoreboard objectives remove {ETIQ}")
        r("save-all")
        res["fin"] = time.strftime("%Y-%m-%d %H:%M:%S")
        cl = AQUI / "logs" / f"carga-noche-{hora_ini}.log"
        if cl.exists():
            m = re.search(r"RESULTADO carga: (.*)", cl.read_text())
            res["carga"] = json.loads(m[1]) if m else None
        salida.write_text(json.dumps(res, ensure_ascii=False, indent=1) + "\n")
        corto = {k: res.get(k) for k in ("perfil", "kit", "punto", "sobrevive", "muerte", "salud_min", "vida_perdida", "segundos", "eventos", "parada")}
        corto["usos"] = (res.get("decisiones") or {}).get("usos")
        corto["reflejos"] = (res.get("registro_bot") or {}).get("reflejos")
        print("RESULTADO noche: " + json.dumps(corto, ensure_ascii=False), flush=True)
        print(f"detalle: {salida.relative_to(RAIZ)} · registro del bot: {rbot.relative_to(RAIZ)}", flush=True)


if __name__ == "__main__":
    main()
