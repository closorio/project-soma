#!/usr/bin/env python3
"""F8.1 · banco K (y de cualquier rol v2): N personajes con el capataz de un rol (bot/capataz.js) a la vez, desde cero, en el mundo
de IO_SERVIDOR (por defecto local, 26.1.2), con el servidor ya en marcha (servidor-local/arrancar.sh).
Cada rotación: 4 puntos en llanos sin estrenar (--zona); con Casual, solo puntos con ≥ 3 ovejas a ≤ 48 bloques (--ovejas) y
≥ 3 árboles cerca (terreno()), sobre motion_blocking_no_leaves; inventario vacío, memoria persistente borrada, `time set 0`,
monstruos encendidos, reflejos encendidos, modo libre; dura --dias días de Minecraft (por defecto 2 = 40 min). Cada 15 s lee
`progreso` de cada personaje (etapas hechas con su día y su hora, y el inventario) y las muertes (su memoria persistente; al acabar,
la causa, del registro del servidor).
Criterio de Casual fijado antes de medir (PLAN_F8_perfiles.md, banco K): pico de hierro y cama en ≤ 2 días en ≥ 6 de 8; muertes ≤ 1
cada 3 días (se informa por ejecución). Escribe logs/rol-ROL-AAAAMMDD-HHMM.json (y lo va escribiendo durante la medida).
Terreno fijo (F8.1): --preparar-puntos RUTA --zona Z elige 8 puntos y fotografía sus regiones (servidor-local/banco_k/); luego
--puntos RUTA restaura la foto antes de medir y pone a los 8 a la vez en sus puntos (una rotación), y --comparar JSON compara punto a
punto con otra medida del mismo banco.
Banco M (2026-11-03, --rol minero): empieza con el kit de PREPARACION y `time set 1000`; criterio fijado antes de medir: hierro crudo +
lingotes en el inventario al acabar los 2 días ≥ 24 en ≥ 6/8 y 0 muertes por lava (decisión 2026-11-03-recolector-aceptado-y-criterio-m).
Uso: experimentos_roles.py [--rol casual] [--dias 2] [--rotaciones 2] [--puertos 3201] [--prefijo K]
     experimentos_roles.py --preparar-puntos entrenamiento/puntos_k.json --zona 60
     experimentos_roles.py --puntos entrenamiento/puntos_k.json [--comparar logs/rol-casual-….json]"""
import argparse, json, math, os, re, signal, subprocess, sys, time, urllib.parse, urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
sys.path.insert(0, str(RAIZ / "servidor"))
from rcon import rcon, hora  # noqa: E402

MUNDO = os.environ.get("IO_SERVIDOR") or "local"
OW = "execute in minecraft:overworld"
LOGS = RAIZ / "servidor-supervivencia" / "logs"
# a 200 bloques entre sí: cada personaje con su terreno (a 60 se repartían las pocas ovejas del llano: 9 en 128 bloques a la redonda)
ROTACIONES = [[(0, 100), (100, 0), (0, -100), (-100, 0)], [(100, 100), (-100, 100), (100, -100), (-100, -100)],
              [(0, 200), (200, 0), (0, -200), (-200, 0)]]
HITOS = {"pico_hierro": lambda inv: inv.get("pico", 0) >= 1, "cama": lambda inv: inv.get("cama", 0) >= 1,
         "antorchas": lambda inv: inv.get("antorchas", 0) >= 8, "horno": lambda inv: inv.get("horno", 0) >= 1,
         "hierro": lambda inv: inv.get("hierro", 0) + inv.get("hierro_mena", 0) >= 3}
HITOS_MEMORIA = ("casa",)  # los de progresion.estado().memoria (la casa construida queda en la memoria persistente)
# el kit y la hora de salida de cada rol (por defecto, sin nada y `time set 0`); kit del minero: las etapas previas a m_carbon ya cumplidas
PREPARACION = {"minero": {"kit": ["stone_pickaxe", "stone_sword", "oak_log 6", "cobblestone 8", "bread 16", "coal 8", "torch 8"], "hora": 1000}}
HIERRO_M = 24  # banco M: hierro al acabar para contar como bien
MIN_MB = 800
TRONCOS = 3  # árboles mínimos en la rejilla de terreno() para un punto de salida


def r(cmd):
    return rcon(cmd, servidor=MUNDO)


def orden(puerto, c, t=30):
    try:
        return urllib.request.urlopen(f"http://127.0.0.1:{puerto}/?c=" + urllib.parse.quote(c), timeout=t).read().decode().strip()
    except Exception as e:
        return f"sin respuesta: {e}"


def memoria_mb():
    for l in open("/proc/meminfo"):
        if l.startswith("MemAvailable:"):
            return int(l.split()[1]) // 1024


def llano(zona=0):
    """El llano más cercano a (1500·zona, 1500·zona): cada medida en terreno sin tocar (la caza de medidas anteriores acaba con las
    ovejas, y las talas con los árboles cercanos)."""
    o = 1500 * zona
    m = re.search(r"\[(-?\d+), [^,]+, (-?\d+)\]", r(f"{OW} positioned {o} 64 {o} run locate biome minecraft:plains"))
    return (int(m[1]), int(m[2])) if m else (o, o)


def poner_en(nombre, x, z):
    r(f"forceload add {x} {z}")
    time.sleep(2.5)
    r(f"{OW} positioned {x} 0 {z} positioned over motion_blocking_no_leaves run tp {nombre} ~ ~ ~")
    time.sleep(1.5)
    r(f"forceload remove {x} {z}")


def muertes(nombre):
    f = RAIZ / "mundos" / MUNDO / f"memoria_{nombre}.json"
    try:
        return len(json.loads(f.read_text()).get("muertes", []))
    except (OSError, ValueError):
        return 0


def terreno(x, z, radio=48):
    """(ovejas a ≤ radio, troncos) alrededor de (x, z), con los trozos cargados un momento (sin ellos el servidor no sabe de sus
    entidades ni de sus bloques). Troncos: en una rejilla de 21×21 columnas a paso 3 (a ≤ 30), las que tienen un tronco bajo el techo
    sin hojas (un árbol); medido en esta semilla: bosque 10, llano 4, desierto 2. F8.1: pedir solo ovejas elegía llanos pelados
    (banco K 8: un día entero buscando árboles)."""
    r(f"forceload add {x - 32} {z - 32} {x + 32} {z + 32}")
    time.sleep(5)
    m = re.search(r"Count: (\d+)", r(f"{OW} positioned {x} 64 {z} if entity @e[type=minecraft:sheep,distance=..{radio}]"))
    troncos = sum("passed" in r(f"{OW} positioned {x + dx} 0 {z + dz} positioned over motion_blocking_no_leaves if block ~ ~-1 ~ #minecraft:logs")
                  for dx in range(-30, 31, 3) for dz in range(-30, 31, 3))
    r(f"forceload remove {x - 32} {z - 32} {x + 32} {z + 32}")
    return (int(m[1]) if m else 0), troncos


MUERTE = r"\[(\d\d:\d\d:\d\d)\] \[Server thread/INFO\]: ({}) (was .+|drowned.*|tried to swim in lava.*|fell .+|blew up.*|burned .+|went up in flames.*|hit the ground.+|died.*|starved.*|suffocated.*|froze.*|withered.*|discovered .+)$"


def causas_de_muerte(nombres, desde, hasta):
    """{nombre: [causa, …]} del registro del servidor local entre dos horas «HH:MM:SS» (el registro solo trae la hora; si la rotación
    cruza la medianoche, vale lo de después de `desde` o antes de `hasta`)."""
    f = RAIZ / "servidor-local" / "logs" / "latest.log"
    out = {n: [] for n in nombres}
    if MUNDO != "local" or not f.exists():
        return out
    patron = re.compile(MUERTE.format("|".join(map(re.escape, nombres))))
    for l in f.read_text(errors="replace").splitlines():
        m = patron.search(l)
        if m and ((desde <= m[1] <= hasta) if desde <= hasta else (m[1] >= desde or m[1] <= hasta)):
            out[m[2]].append(m[3])
    return out


def al_llano(x, z):
    m = re.search(r"\[(-?\d+), [^,]+, (-?\d+)\]", r(f"{OW} positioned {x} 64 {z} run locate biome minecraft:plains"))
    return (int(m[1]), int(m[2])) if m else (x, z)


def usados(cerca=300):
    """Los puntos de salida de todas las medidas anteriores (logs/rol-*.json): su terreno está talado y cazado."""
    pts = []
    for f in LOGS.glob("rol-*.json"):
        try:
            pts += [tuple(x["punto"]) for rot in json.loads(f.read_text())["resultados"].values() for x in rot.values()]
        except (OSError, ValueError, KeyError):
            pass
    return lambda x, z: any(math.hypot(x - ux, z - uz) < cerca for ux, uz in pts)


def elegir_puntos(n, k, zona, ovejas, separacion=150, evitar=lambda x, z: False):
    """n puntos de salida en llano para la rotación k. Con ovejas > 0 (Casual: la cama pide 3 de lana; decisión del usuario,
    2026-10-24, porque esta semilla tiene muy pocas), solo los que tienen al menos esas ovejas a ≤ 48 bloques, a ≥ separacion
    entre sí y fuera de `evitar`; si en la zona no hay bastantes, en las siguientes (hasta 2·n zonas: con 8 puntos, 6 no
    bastaban). Devuelve [(x, z, ovejas)]."""
    if not ovejas:
        centro = llano(zona)
        return [(*al_llano(centro[0] + dx, centro[1] + dz), None) for dx, dz in ROTACIONES[k % len(ROTACIONES)][:n]]
    elegidos = []
    for zz in range(zona, zona + max(6, 2 * n)):
        centro = llano(zz)
        print(f"   buscando puntos con ≥ {ovejas} ovejas y ≥ {TRONCOS} árboles alrededor del llano {centro}…", flush=True)
        for radio in (0, 100, 200, 300, 400):
            for g in (range(0, 360, 45) if radio else [0]):
                x, z = al_llano(round(centro[0] + radio * math.cos(math.radians(g))), round(centro[1] + radio * math.sin(math.radians(g))))
                if any(math.hypot(x - ex, z - ez) < separacion for ex, ez, _ in elegidos) or evitar(x, z):
                    continue
                c, t = terreno(x, z)
                if c >= ovejas and t >= TRONCOS:
                    elegidos.append((x, z, c))
                    print(f"   punto {len(elegidos)}: {x}, {z} con {c} ovejas y {t} árboles", flush=True)
                    if len(elegidos) == n:
                        return elegidos
    raise SystemExit(f"no encuentro {n} puntos con ≥ {ovejas} ovejas y ≥ {TRONCOS} árboles (llevo {len(elegidos)})")


# F8.1 · terreno fijo: las medidas 7-9 cambiaban a la vez el código y el terreno (una --zona nueva cada vez), y no se sabía de
# dónde venía una mejora. Con --preparar-puntos se eligen 8 puntos una vez y se fotografían sus regiones (bloques, entidades y
# puntos de interés: árboles y ovejas incluidos); con --puntos, cada medida restaura la foto antes de empezar y arranca en los
# mismos puntos, así dos versiones del código se comparan por pares (punto a punto).
LOCAL = RAIZ / "servidor-local"
OVERWORLD = LOCAL / "world" / "dimensions" / "minecraft" / "overworld"
FOTO = LOCAL / "banco_k"  # fuera de git (servidor-local/*): las regiones pesan decenas de MB y no viajan
CAPAS = ("region", "entities", "poi")
MARGEN = 128  # bloques alrededor de cada punto que se restauran (lo que un bot recorre en las primeras etapas)


def regiones(puntos):
    """Los ficheros r.X.Z.mca (512×512 bloques) que cubren ±MARGEN alrededor de cada punto."""
    rr = set()
    for x, z, *_ in puntos:
        for gx in range((x - MARGEN) // 512, (x + MARGEN) // 512 + 1):
            for gz in range((z - MARGEN) // 512, (z + MARGEN) // 512 + 1):
                rr.add(f"r.{gx}.{gz}.mca")
    return sorted(rr)


def servidor(accion):
    """parar.sh o arrancar.sh del servidor local (por PID, nunca pkill)."""
    p = subprocess.run([str(LOCAL / f"{accion}.sh")], capture_output=True, text=True, timeout=300)
    print("   " + " · ".join(l for l in p.stdout.splitlines() if l.strip()), flush=True)
    if p.returncode:
        raise SystemExit(f"{accion}.sh falló: {p.stdout} {p.stderr}")


def copiar_regiones(nombres, desde, hasta):
    import shutil
    n = 0
    for capa in CAPAS:
        (hasta / capa).mkdir(parents=True, exist_ok=True)
        for f in nombres:
            if (desde / capa / f).exists():
                shutil.copy2(desde / capa / f, hasta / capa / f)
                n += 1
    return n


def preparar_puntos(zona, ovejas, ruta, n=8):
    if MUNDO != "local":
        raise SystemExit("el terreno fijo solo es para el mundo local (servidor-local/)")
    print(f"preparando {n} puntos con ≥ {ovejas} ovejas y ≥ {TRONCOS} árboles desde la zona {zona}…", flush=True)
    # F8.1: la zona 60 empezaba en el mismo llano que la rotación 2 de la medida 9: lo ya pisado no vale para la foto
    puntos = [(x, z) for x, z, _ in elegir_puntos(n, 0, zona, ovejas, evitar=usados())]
    r("save-all flush")
    servidor("parar")
    rr = regiones(puntos)
    copiadas = copiar_regiones(rr, OVERWORLD, FOTO)
    servidor("arrancar")
    # lo que hay tras volver a cargar es la referencia (las ovejas se mueven algo al cargar)
    ref = [[x, z, *terreno(x, z)] for x, z in puntos]
    ruta.write_text(json.dumps({"zona": zona, "zonas": [zona, zona + 2 * n - 1], "semilla": 20261024, "margen": MARGEN,
                                "fecha": time.strftime("%Y-%m-%d %H:%M"), "puntos": ref, "regiones": rr},
                               ensure_ascii=False, indent=1) + "\n")
    print(f"   {len(rr)} regiones ({copiadas} ficheros) en {FOTO.relative_to(RAIZ)}; puntos en {ruta}", flush=True)
    for x, z, ov, tr in ref:
        print(f"   {x}, {z}: {ov} ovejas, {tr} árboles", flush=True)


def uuid_offline(nombre):
    """El UUID de un jugador sin conexión (servidor offline): versión 3 del md5 de «OfflinePlayer:nombre»."""
    import hashlib, uuid
    h = bytearray(hashlib.md5(("OfflinePlayer:" + nombre).encode()).digest())
    h[6], h[8] = h[6] & 0x0F | 0x30, h[8] & 0x3F | 0x80
    return str(uuid.UUID(bytes=bytes(h)))


def restaurar(banco, nombres=()):
    """Vuelve a poner la foto de las regiones de los puntos (con el servidor parado) y comprueba ovejas y árboles. Borra además
    dónde se quedaron los personajes: la medida 10 empezó con 4 muertes por asfixia en los 10 primeros segundos, porque se
    desconectaron en sus túneles y la foto los había vuelto a llenar de piedra."""
    rr = banco["regiones"]
    faltan = [f for f in rr if not (FOTO / "region" / f).exists()]
    if faltan:
        raise SystemExit(f"no está la foto de {len(faltan)} regiones en {FOTO} (otro PC): lanza --preparar-puntos")
    r("save-all flush")
    servidor("parar")
    n = copiar_regiones(rr, FOTO, OVERWORLD)
    for nombre in nombres:
        for f in (LOCAL / "world" / "players" / "data").glob(uuid_offline(nombre) + ".dat*"):
            f.unlink()
    servidor("arrancar")
    print(f"   restauradas {len(rr)} regiones ({n} ficheros)", flush=True)
    mal = []
    for x, z, ov, tr in banco["puntos"]:
        ov2, tr2 = terreno(x, z)
        if abs(ov2 - ov) > 1 or tr2 != tr:
            mal.append(f"{x}, {z}: {ov2} ovejas y {tr2} árboles (la foto: {ov} y {tr})")
    if mal:
        raise SystemExit("el terreno no coincide con la foto:\n   " + "\n   ".join(mal))
    print("   terreno comprobado: ovejas y árboles como en la foto", flush=True)


def comparar(anterior, res):
    """Punto a punto: hitos (día) y muertes de la medida anterior y de esta (las dos con --puntos del mismo banco)."""
    previas = {tuple(f["punto"]): f for rot in json.loads(Path(anterior).read_text())["resultados"].values() for f in rot.values()}
    print(f"comparación con {Path(anterior).name} (día de pico / cama / casa · muertes):", flush=True)
    d = lambda f, h: f"{f['hitos'][h]:.2f}" if h in f["hitos"] else "  —  "
    for rot in res.values():
        for n, f in rot.items():
            p = previas.get(tuple(f["punto"]))
            antes = f"{d(p, 'pico_hierro')} / {d(p, 'cama')} / {d(p, 'casa')} · {p['muertes']}" if p else "(punto nuevo)"
            print(f"   {n} {f['punto']}: antes {antes}  →  ahora {d(f, 'pico_hierro')} / {d(f, 'cama')} / {d(f, 'casa')} · {f['muertes']}", flush=True)


def rotacion(a, k, puntos, nombres, puertos, salida, res):
    for n in nombres:
        (RAIZ / "mundos" / MUNDO / f"memoria_{n}.json").unlink(missing_ok=True)
    args = [f"{n}:{p}:recolector:ordenes:capataz@{a.rol}" for n, p in zip(nombres, puertos)]
    prep = PREPARACION.get(a.rol, {})
    hora0 = prep.get("hora", 0)
    log = open(LOGS / f"bots-rol-{a.rol}-{k}.log", "w")
    bot = subprocess.Popen(["node", "io.js", *args], cwd=RAIZ / "bot", stdout=log, stderr=subprocess.STDOUT,
                           env={**os.environ, "IO_SERVIDOR": MUNDO, "IO_BOTS": ",".join(nombres)}, start_new_session=True)
    filas = {}
    try:
        for _ in range(90):
            if all(orden(p, "estado", 5).startswith("pos ") for p in puertos):
                break
            time.sleep(1)
        else:
            raise SystemExit("los bots no se conectaron en 90 s")
        r("gamerule spawn_monsters true")
        r("weather clear")
        for i, (n, p) in enumerate(zip(nombres, puertos)):
            px, pz, nov = puntos[i]
            r(f"clear {n}")
            for g in prep.get("kit", []):
                r(f"give {n} minecraft:{g}")
            r(f"effect clear {n}")
            r(f"effect give {n} minecraft:instant_health 1 10 true")
            r(f"effect give {n} minecraft:saturation 1 20 true")
            poner_en(n, px, pz)
            # 2026-11-03: reaparecía en el spawn del mundo, a decenas de miles de bloques: sin vuelta a sus cosas (humo del banco M)
            r(f"execute at {n} run spawnpoint {n} ~ ~ ~")
            orden(p, "campamento aqui")
            orden(p, "reflejos si")
            filas[n] = {"rotacion": k, "punto": [px, pz], "ovejas": nov, "hitos": {}, "etapas": {}, "muertes": 0, "ultima": None}
        r(f"time set {hora0}")
        dia0, _ = hora(MUNDO)
        inicio = time.strftime("%H:%M:%S")
        for p in puertos:
            orden(p, "modo libre")
        t0 = time.time()
        while True:
            time.sleep(15)
            # F8.1: si el proceso de los bots se cae, la rotación acaba (antes seguía preguntando a puertos muertos y el servidor,
            # sin jugadores, se pausaba)
            if bot.poll() is not None:
                log.flush()
                error = [l for l in (LOGS / f"bots-rol-{a.rol}-{k}.log").read_text(errors="replace").splitlines() if "Error" in l]
                for f in filas.values():
                    f["caido"] = error[-1][:300] if error else f"salió con {bot.returncode}"
                res[f"rot{k}"] = filas
                salida.write_text(json.dumps({"rol": a.rol, "mundo": MUNDO, "dias": a.dias, "resultados": res}, ensure_ascii=False, indent=1) + "\n")
                print(f"  ¡el proceso de los bots se cayó! {next(iter(filas.values()))['caido']}", flush=True)
                break
            if memoria_mb() < MIN_MB:
                raise SystemExit(f"solo quedan {memoria_mb()} MB de memoria disponible: paro")
            dia, ticks = hora(MUNDO)
            dias = (dia - dia0) + (ticks - hora0) / 24000 if dia is not None else (time.time() - t0) / 1200
            for n, p in zip(nombres, puertos):
                try:
                    pr = json.loads(orden(p, "progreso", 10))
                except ValueError:
                    continue
                f = filas[n]
                f["ultima"] = {"etapa": pr.get("etapa"), "falta": pr.get("falta")}
                for id_, h in (pr.get("hechas") or {}).items():
                    f["etapas"].setdefault(id_, {"dias": round(dias, 2), **h})
                inv = (pr.get("estado") or {}).get("inv", {})
                f["hierro_final"] = inv.get("hierro", 0) + inv.get("hierro_mena", 0)
                f["hierro_max"] = max(f.get("hierro_max", 0), f["hierro_final"])  # solo informa: lo que perdió al morir
                for h, ok in HITOS.items():
                    if ok(inv) and h not in f["hitos"]:
                        f["hitos"][h] = round(dias, 2)
                mem = (pr.get("estado") or {}).get("memoria", {})
                for h in HITOS_MEMORIA:
                    if mem.get(h) and h not in f["hitos"]:
                        f["hitos"][h] = round(dias, 2)
                f["muertes"] = muertes(n)
            res[f"rot{k}"] = filas
            salida.write_text(json.dumps({"rol": a.rol, "mundo": MUNDO, "dias": a.dias, "resultados": res}, ensure_ascii=False, indent=1) + "\n")
            print(f"  día {dias:4.2f} · " + " · ".join(f"{n}: {f['ultima']['etapa'] if f['ultima'] else '?'} {sorted(f['hitos'])}"
                                                    for n, f in filas.items()), flush=True)
            if dias >= a.dias or time.time() - t0 > a.dias * 1200 * 1.5:
                break
        causas = causas_de_muerte(nombres, inicio, time.strftime("%H:%M:%S"))
        for n in nombres:
            filas[n]["causas"] = causas[n]
        res[f"rot{k}"] = filas
        salida.write_text(json.dumps({"rol": a.rol, "mundo": MUNDO, "dias": a.dias, "resultados": res}, ensure_ascii=False, indent=1) + "\n")
    finally:
        try:
            os.killpg(bot.pid, signal.SIGTERM)
            bot.wait(20)
        except Exception:
            try:
                os.killpg(bot.pid, signal.SIGKILL)
            except Exception:
                pass
    return filas


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rol", default="casual")
    ap.add_argument("--dias", type=float, default=2)
    ap.add_argument("--rotaciones", type=int, default=2)
    ap.add_argument("--puertos", type=int, default=3201)
    ap.add_argument("--prefijo", default="K")
    ap.add_argument("--n", type=int, default=4)
    ap.add_argument("--zona", type=int, default=None, help="terreno de la medida (por defecto, uno nuevo cada vez)")
    ap.add_argument("--ovejas", type=int, default=None, help="ovejas mínimas a ≤ 48 de cada punto (por defecto 3 con casual, 0 con los demás)")
    ap.add_argument("--preparar-puntos", metavar="RUTA", help="elige 8 puntos (desde --zona), fotografía su terreno y los guarda en RUTA")
    ap.add_argument("--puntos", metavar="RUTA", help="terreno fijo: restaura la foto y usa sus puntos (8 personajes, 1 rotación)")
    ap.add_argument("--sin-restaurar", action="store_true", help="con --puntos, no restaurar la foto (p. ej. un humo seguido de la medida)")
    ap.add_argument("--comparar", metavar="JSON", help="al acabar, tabla punto a punto con otra medida del mismo banco")
    a = ap.parse_args()
    try:
        r("list")
    except OSError:
        sys.exit(f"el servidor de {MUNDO} no responde por RCON: arráncalo")
    ovejas = a.ovejas if a.ovejas is not None else (3 if a.rol == "casual" else 0)
    if a.preparar_puntos:
        if a.zona is None:
            sys.exit("--preparar-puntos pide --zona (una sin usar: las de las medidas anteriores están taladas y cazadas)")
        return preparar_puntos(a.zona, ovejas, Path(a.preparar_puntos))
    banco = json.loads(Path(a.puntos).read_text()) if a.puntos else None
    if banco:
        a.n, a.rotaciones = len(banco["puntos"]), 1  # B5: todos a la vez, cada uno en su punto de siempre
    LOGS.mkdir(exist_ok=True)
    salida = LOGS / f"rol-{a.rol}-{time.strftime('%Y%m%d-%H%M')}.json"
    nombres = [f"{a.prefijo}{i + 1}" for i in range(a.n)]
    puertos = [a.puertos + i for i in range(a.n)]
    zona = a.zona if a.zona is not None else int(time.time() // 3600) % 40 + 1
    donde = f"puntos fijos de {a.puntos}" if banco else f"zonas desde {zona}"
    print(f"rol {a.rol} · {a.n} personajes × {a.rotaciones} rotaciones · {a.dias} días · {donde}", flush=True)
    res = {}
    for k in range(a.rotaciones):
        print(f"== rotación {k + 1}", flush=True)
        if banco:
            if not a.sin_restaurar:
                restaurar(banco, nombres)
            puntos = [(x, z, ov) for x, z, ov, _ in banco["puntos"]]
        else:
            puntos = elegir_puntos(a.n, k, zona + 7 * k, ovejas)  # cada rotación en zonas sin estrenar (las de la anterior quedan atrás)
        rotacion(a, k, puntos, nombres, puertos, salida, res)
    filas = [f for rot in res.values() for f in rot.values()]
    bien = [f for f in filas if f["hitos"].get("pico_hierro", 99) <= 2 and f["hitos"].get("cama", 99) <= 2]
    muertes_3d = [round(f["muertes"] * 3 / a.dias, 2) for f in filas]
    # F8.1: cada hito por separado (cuántos y el día mediano) y las causas de muerte, para no tener que leer los registros
    def hito(h):
        dias = sorted(f["hitos"][h] for f in filas if h in f["hitos"])
        return {"n": len(dias), "de": len(filas), "mediana": dias[len(dias) // 2] if dias else None}
    causas = {}
    for f in filas:
        for c in f.get("causas", []):
            causas[c] = causas.get(c, 0) + 1
    resumen = {"pico_hierro_y_cama_en_2_dias": len(bien), "de": len(filas), "pasa": len(bien) >= 6 * len(filas) / 8,
               "muertes_por_3_dias": muertes_3d, "muertes_ok": all(m <= 1 for m in muertes_3d),
               "hitos": {h: hito(h) for h in ("pico_hierro", "cama", "casa")}, "causas_de_muerte": causas}
    if a.rol == "minero":  # banco M
        hierro = sorted(f.get("hierro_final", 0) for f in filas)
        bien_m = sum(h >= HIERRO_M for h in hierro)
        lava = sum(n for c, n in causas.items() if "lava" in c)
        resumen = {"hierro_24": bien_m, "de": len(filas), "pasa": bien_m >= 6 * len(filas) / 8 and lava == 0, "muertes_lava": lava,
                   "hierro_mediana": hierro[len(hierro) // 2], "hierro_final": hierro, "hierro_max": sorted(f.get("hierro_max", 0) for f in filas),
                   "muertes_por_3_dias": muertes_3d, "causas_de_muerte": causas}
        print(f"hierro ≥ {HIERRO_M} al acabar: {bien_m}/{len(filas)} (mediana {resumen['hierro_mediana']}) · muertes por lava {lava} "
              f"(criterio ≥ 6/8 y 0: {'PASA' if resumen['pasa'] else 'NO PASA'})", flush=True)
    else:
        print(f"pico de hierro y cama en ≤ 2 días: {len(bien)}/{len(filas)} (criterio ≥ 6/8: {'PASA' if resumen['pasa'] else 'NO PASA'}) · "
              f"muertes por 3 días {muertes_3d} ({'bien' if resumen['muertes_ok'] else 'demasiadas'})", flush=True)
        print("hitos: " + " · ".join(f"{h} {v['n']}/{v['de']} (mediana día {v['mediana']})" for h, v in resumen["hitos"].items()), flush=True)
    print("causas de muerte: " + (", ".join(f"{c} ×{n}" for c, n in sorted(causas.items(), key=lambda x: -x[1])) or "ninguna"), flush=True)
    salida.write_text(json.dumps({"rol": a.rol, "mundo": MUNDO, "dias": a.dias, "puntos": a.puntos, "resumen": resumen, "resultados": res},
                                 ensure_ascii=False, indent=1) + "\n")
    if a.comparar:
        comparar(a.comparar, res)
    print("FIN", salida, flush=True)


if __name__ == "__main__":
    main()
