#!/usr/bin/env python3
"""F7.2 · pruebas de las habilidades de supervivencia del bot en el mundo de supervivencia (hermana de
entrenamiento/probar_habilidades.py), con el servidor ya en marcha (./arrancar.sh). Conecta un bot temporal (bot/io.js con
IO_SERVIDOR=supervivencia; Prueba1, puerto de control 3101) y lo prueba en una arena de tierra cercada con cristal, en el aire encima
de la aparición (25×25, suelo en y = 150; el hueco se comprueba vacío antes con structure_void, como probar_sentidos.py). Cada prueba
empieza con la arena repuesta, el inventario fijado (clear + give), salud y hambre llenas, y el estado preparado por RCON (time set,
summon, effect, setblock). Monstruos: solo los invocados (gamerule spawn_monsters false mientras dura; se repone al acabar).
Semilla 42 para los sitios. Las habilidades se prueban con los reflejos apagados (`reflejos no`) y al final, aparte, los reflejos.
Criterios fijados en el plan (PLAN_F7_supervivencia.md, F7.2), antes de medir:
   comer 10/10 · fabricar 10/10 por objeto · refugiarse ≥ 9/10 en llano y ≥ 7/10 en ladera, nunca cava junto a agua o lava
   (0 fallos de seguridad) · atacar a un zombi con espada de madera ≥ 8/10 sin bajar de 10 de salud, a un esqueleto ≥ 6/10 ·
   esperar_al_dia 5/5 sin daño dentro del refugio · apartarse 10/10 con la lava a 2 bloques.
Además (sin criterio): tapiarse a propósito, salir_del_refugio tras cada refugio, dormir con cama, recoger_comida (vaca) y los
reflejos (defensa ante un zombi, huida ante 3, creeper, lava y hambre).
Escribe entrenamiento/habilidades_medidas_sv.json (mismo formato que habilidades_medidas.json: muestras [éxito, causa, s, extra])
para calibrar entorno_supervivencia.py, y el detalle en logs/supervivencia-AAAAMMDD-HHMM.json.
Comprueba la memoria disponible antes de cada prueba y para si baja de 800 MB. Al terminar: borra la arena (el hueco estaba vacío),
mata lo invocado, pone el día, repone spawn_monsters, guarda (save-all) y cierra el bot por su PID. El servidor sigue en marcha:
./guardar.sh y ./parar.sh.
Uso: python3 probar_supervivencia.py [--solo comer,fabricar,…] [--n 10] [--nombre Prueba1] [--puerto 3101] [--sin-medidas]
Secciones: comer fabricar llano tapiar ladera seguridad zombi esqueleto esperar dormir apartarse caza reflejos
"""
import argparse, json, os, random, re, signal, socket, statistics, subprocess, sys, time, urllib.parse, urllib.request
from collections import Counter, defaultdict
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "servidor"))
from rcon import rcon

MUNDO_SV = os.environ.get("IO_SERVIDOR") or "supervivencia"  # F8: el mismo banco en otro mundo (p. ej. local, 26.1.2)
(Path(__file__).resolve().parent / "logs").mkdir(exist_ok=True)  # registros del banco (ignorados por git)

MIN_MB = 800
X, Z, S = 96, -64, 150                   # centro de la arena; S: la altura de los pies sobre el suelo (bloque de arriba en S-1)
R = 12                                   # la arena va de X-R a X+R (paredes de cristal en el borde)
CAJA = (X - R, S - 12, Z - R, X + R, S + 15, Z + R)
ETIQ = "prueba_sv"
MEDIDAS = AQUI.parent / "entrenamiento" / ("habilidades_medidas_sv.json" if MUNDO_SV == "supervivencia" else f"habilidades_medidas_{MUNDO_SV}.json")
SECCIONES = ["comer", "fabricar", "llano", "tapiar", "ladera", "seguridad", "zombi", "esqueleto", "esperar", "dormir", "apartarse",
             "caza", "reflejos"]
# F8.0b (H-hab, PLAN_F8_perfiles.md): las habilidades de la fundación; van aparte (--solo f8 o --solo fundir,poner,…)
SECCIONES_F8 = ["fundir", "sacar", "poner", "iluminar", "escalera", "agua", "verter", "cazar", "fab_gen"]
COFRES = AQUI.parent / "mundos" / MUNDO_SV / "cofres.json"  # sacar: el cofre de la prueba se apunta aquí y se quita al acabar


class Parada(Exception):
    pass


def r(cmd):
    return rcon(cmd, servidor=MUNDO_SV)


def memoria_mb():
    for l in open("/proc/meminfo"):
        if l.startswith("MemAvailable:"):
            return int(l.split()[1]) // 1024


def vigilar_memoria():
    mb = memoria_mb()
    if mb < MIN_MB:
        raise Parada(f"solo quedan {mb} MB de memoria disponible (mínimo {MIN_MB}): paro")


def fill(*c, bloque, modo=""):
    return r(f"fill {' '.join(map(str, c))} {bloque} {modo}".strip())


def llenados(texto):
    m = re.search(r"(\d+)", texto)
    return int(m[1]) if m and "illed" in texto else 0


class Banco:
    def __init__(self, nombre, puerto, n):
        self.nombre, self.puerto, self.n = nombre, puerto, n
        self.res = defaultdict(list)       # sección → pruebas
        self.muestras = defaultdict(list)  # habilidad → [éxito, causa, s, extra]
        self.vacio = False
        self.rng = random.Random(42)

    # ---- puerto del bot ----
    def orden(self, c, t=30):
        try:
            return urllib.request.urlopen(f"http://127.0.0.1:{self.puerto}/?c=" + urllib.parse.quote(c), timeout=t).read().decode().strip()
        except Exception as e:
            return f"sin respuesta: {e}"

    def hab(self, c, t=120):
        vigilar_memoria()
        txt = self.orden("hab " + c, t)
        try:
            return json.loads(txt)
        except ValueError:
            return {"habilidad": c.split()[0], "exito": False, "causa": "sin respuesta: " + txt[:60], "ms": 0}

    def obs(self):
        try:
            return json.loads(self.orden("obs_sv"))["datos"]
        except (ValueError, KeyError):
            return {}

    def eventos(self):
        try:
            return json.loads(self.orden("resumen"))
        except ValueError:
            return {}

    # ---- preparar ----
    def arena(self, ladera=False):
        """Repone la arena: tierra de S-9 a S-2, hierba en S-1, aire encima (dentro de las paredes) y, con ladera, escalones."""
        vigilar_memoria()
        r(f"kill @e[tag={ETIQ}]")
        fill(X - R + 1, S, Z - R + 1, X + R - 1, S + 12, Z + R - 1, bloque="minecraft:air")
        fill(X - R + 1, S - 9, Z - R + 1, X + R - 1, S - 2, Z + R - 1, bloque="minecraft:dirt")
        fill(X - R + 1, S - 1, Z - R + 1, X + R - 1, S - 1, Z + R - 1, bloque="minecraft:grass_block")
        if ladera:  # escalones de 1 subiendo hacia +x: la columna X-4+i tiene i bloques encima del suelo (i = 1..8)
            for i in range(1, 9):
                fill(X - 4 + i, S, Z - 8, X - 4 + i, S + i - 1, Z + 8, bloque="minecraft:dirt")
                fill(X - 4 + i, S + i - 1, Z - 8, X - 4 + i, S + i - 1, Z + 8, bloque="minecraft:grass_block")
        r(f"kill @e[type=minecraft:item,x={X},y={S},z={Z},distance=..30]")

    def cuerpo(self, x, y, z, inv=(), hora=6000):
        """El bot en (x, y, z) (pies), con salud y hambre llenas y este inventario; la hora fijada."""
        n = self.nombre
        r(f"time set {hora}")
        r(f"clear {n}")
        r(f"effect clear {n}")
        r(f"effect give {n} minecraft:instant_health 1 10 true")
        r(f"effect give {n} minecraft:saturation 1 20 true")
        for c in inv:
            r(f"give {n} {c}")
        r(f"tp {n} {x + 0.5} {y} {z + 0.5}")
        time.sleep(1.2)
        self.orden("para")
        for _ in range(10):
            d = self.obs()
            if d.get("pos") == [x, y, z]:
                break
            time.sleep(0.4)
        return self.obs()

    def hambre(self, hasta=10):
        """Baja el hambre a ≤ hasta con el efecto hunger (y quita la saturación antes)."""
        n = self.nombre
        r(f"effect clear {n} minecraft:saturation")
        r(f"effect give {n} minecraft:hunger 20 250 true")
        t0 = time.time()
        while time.time() - t0 < 25:
            if self.obs().get("hambre", 20) <= hasta:
                break
            time.sleep(0.3)
        r(f"effect clear {n} minecraft:hunger")
        time.sleep(0.5)
        return self.obs().get("hambre")

    def invocar(self, tipo, x, y, z, ia=True, quitar_armadura=True):
        nbt = f'{{Tags:["{ETIQ}"],PersistenceRequired:1b,CanPickUpLoot:0b{",IsBaby:0b" if tipo in ("zombie", "husk") else ""}' \
              f'{",NoAI:1b" if not ia else ""}}}'
        r(f"summon minecraft:{tipo} {x + 0.5} {y} {z + 0.5} {nbt}")
        if quitar_armadura:  # las armas y armaduras al azar del juego cambian la pelea: fuera (el arco del esqueleto se queda)
            for ranura in ("armor.head", "armor.chest", "armor.legs", "armor.feet"):
                r(f"item replace entity @e[tag={ETIQ},type=minecraft:{tipo}] {ranura} with minecraft:air")
            if tipo != "skeleton":
                r(f"item replace entity @e[tag={ETIQ},type=minecraft:{tipo}] weapon.mainhand with minecraft:air")

    def sitio(self, margen=7):
        return X + self.rng.randint(-margen, margen), Z + self.rng.randint(-margen, margen)

    def anotar(self, seccion, h, d, ok, extra=None):
        """Una prueba: a la sección (con su criterio) y a las muestras de la habilidad h (para calibrar)."""
        s = round(d.get("ms", 0) / 1000, 1)
        causa = re.sub(r":.*", "", str(d.get("causa", "")))
        self.res[seccion].append({"ok": bool(ok), "exito": bool(d.get("exito")), "causa": d.get("causa"), "s": s, **(extra or {})})
        if h:
            self.muestras[h].append([int(bool(d.get("exito"))), causa, s, extra])
        print(f"  {seccion:10} {'BIEN ' if ok else 'FALLO'} {h or ''} {d.get('causa')} ({s} s) {json.dumps(extra, ensure_ascii=False) if extra else ''}",
              flush=True)


# ---- secciones ----
def comer(b):
    for k in range(b.n):
        b.arena()
        x, z = b.sitio()
        b.cuerpo(x, S, z, ["minecraft:bread 4", "minecraft:rotten_flesh 4"])
        h0 = b.hambre(10 if k % 2 else 6)
        d = b.hab("comer")
        h1 = b.obs().get("hambre")
        b.anotar("comer", "comer", d, d.get("exito") and h1 > h0 and h1 >= 14, {"hambre": [h0, h1], "bocados": d.get("bocados")})


FABRICAR = [  # objeto, inventario
    ("tablones", ["minecraft:oak_log 2"]),
    ("palos", ["minecraft:oak_planks 2"]),
    ("mesa", ["minecraft:oak_log 1"]),
    ("espada_madera", ["minecraft:oak_log 3"]),
    ("pico_madera", ["minecraft:oak_log 4"]),
    ("espada_piedra", ["minecraft:oak_log 2", "minecraft:cobblestone 2"]),
    ("antorcha", ["minecraft:oak_planks 2", "minecraft:coal 1"]),
    ("-", ["minecraft:oak_log 3", "minecraft:dirt 4"]),  # la cadena: sin arma → espada de madera
]
ITEM = {"tablones": "_planks", "palos": "stick", "mesa": "crafting_table", "espada_madera": "wooden_sword", "pico_madera": "wooden_pickaxe",
        "espada_piedra": "stone_sword", "antorcha": "torch", "-": "wooden_sword"}


def fabricar(b):
    for obj, inv in FABRICAR:
        for k in range(b.n if obj not in ("antorcha", "-") else max(3, b.n // 2)):
            b.arena()
            x, z = b.sitio()
            b.cuerpo(x, S, z, inv)
            d = b.hab(f"fabricar {obj}")
            hecho = any(ITEM[obj] in k2 for k2 in (d.get("fabricados") or {}))
            b.anotar(f"fab:{obj}", "fabricar", d, d.get("exito") and hecho, {"objeto": d.get("objeto"), "fabricados": d.get("fabricados"), "mesa": d.get("mesa")})


def refugio_y_salida(b, seccion, modo="auto", inv=(), ladera=False, x=None, z=None, y=S):
    b.arena(ladera)
    if x is None:
        x, z = b.sitio()
    o = b.cuerpo(x, y, z, inv)
    d = b.hab(f"refugiarse {modo}")
    dentro = b.obs().get("en_refugio")
    ok = bool(d.get("exito") and dentro)
    b.anotar(seccion, "refugiarse", d, ok, {"modo": d.get("modo"), "bloques": d.get("bloques"), "rotos": len(d.get("rotos") or []),
                                            "movido": d.get("movido"), "dentro": dentro, "tapiar": d.get("tapiar"), "cavar": d.get("cavar")})
    if ok:
        s = b.hab("salir_del_refugio")
        fuera = not b.obs().get("en_refugio")
        b.anotar("salir", "salir_del_refugio", s, s.get("exito") and fuera, {"desde": d.get("modo"), "rotos": len(s.get("rotos") or []),
                                                                             "puestos": len(s.get("puestos") or [])})
    return d


def llano(b):
    for k in range(b.n):
        refugio_y_salida(b, "llano", inv=["minecraft:dirt 16"] if k % 2 else [])


def tapiar(b):
    for k in range(max(3, b.n // 2)):
        refugio_y_salida(b, "tapiar", modo="tapiar", inv=["minecraft:dirt 16"])


def ladera(b):
    for k in range(b.n):
        i = b.rng.randint(1, 7)
        z = Z + b.rng.randint(-6, 6)
        refugio_y_salida(b, "ladera", inv=["minecraft:dirt 8"] if k % 2 else [], ladera=True, x=X - 4 + i, z=z, y=S + i)


def seguridad(b):
    """Agua o lava junto a la columna que cavaría, o una cueva al lado: nunca cava a ≤ 1 bloque de un líquido."""
    peligros = [("agua al lado", lambda x, z: [(x + 1, S - 3, z, "water")]),
                ("lava debajo", lambda x, z: [(x, S - 5, z, "lava")]),
                ("lava al lado", lambda x, z: [(x, S - 2, z - 1, "lava")]),
                ("cueva al lado", lambda x, z: [(x - 1, S - 4, z, "air"), (x - 1, S - 3, z, "air")]),
                ("agua en la boca", lambda x, z: [(x, S - 1, z + 1, "water")])]
    for k in range(b.n):
        nombre, poner = peligros[k % len(peligros)]
        b.arena()
        x, z = b.sitio(5)
        sitios = poner(x, z)
        for (px, py, pz, bl) in sitios:
            r(f"setblock {px} {py} {pz} minecraft:{bl}")
        b.cuerpo(x, S, z, [])
        d = b.hab("refugiarse")
        liquidos = [(px, py, pz) for (px, py, pz, bl) in sitios if bl in ("water", "lava")]
        # fallo de seguridad: picó un bloque a ≤ 1 (en x, z) y de 2 por debajo a 1 por encima de un líquido puesto
        malo = [c for c in (d.get("rotos") or []) for (lx, ly, lz) in liquidos
                if abs(c[0] - lx) <= 1 and abs(c[2] - lz) <= 1 and -1 <= c[1] - ly <= 2 + (lx == c[0] and lz == c[2])]
        en_sitio = any(c[0] == x and c[2] == z for c in (d.get("rotos") or []))
        b.anotar("seguridad", None, d, not malo, {"peligro": nombre, "cavo_ahi": en_sitio, "movido": d.get("movido"), "malo": malo,
                                                   "modo": d.get("modo"), "exito_refugio": d.get("exito")})
        if d.get("exito"):
            b.hab("salir_del_refugio")


def pelea(b, tipo, seccion, d0=5):
    for k in range(b.n):
        b.arena()
        x, z = X - 3, Z + b.rng.randint(-3, 3)
        b.cuerpo(x, S, z, ["minecraft:wooden_sword"], hora=18000)
        r(f"kill @e[type=!minecraft:player,x={X},y={S},z={Z},distance=..40]")
        b.invocar(tipo, x + d0, S, z)
        time.sleep(0.8)
        d = b.hab(f"atacar {tipo} 30", t=60)
        o = b.obs()
        salud = o.get("salud", 0)
        criterio = d.get("exito") and (salud >= 10 if tipo == "zombie" else True)
        b.anotar(seccion, "atacar", d, criterio, {"objetivo": tipo, "golpes": d.get("golpes"), "salud": salud})
        r(f"kill @e[tag={ETIQ}]")


def zombi(b):
    pelea(b, "zombie", "zombi", 5)


def esqueleto(b):
    pelea(b, "skeleton", "esqueleto", 10)


def esperar(b):
    for k in range(max(3, b.n // 2)):
        d = refugio_y_salida_sin_salir(b)
        if not d.get("exito"):
            b.anotar("esperar", "esperar_al_dia", {"exito": False, "causa": "sin refugio: " + str(d.get("causa")), "ms": 0}, False)
            continue
        pies = d["pos"]
        b.invocar("zombie", pies[0] + 2, S, pies[2])
        r("time set 23700")
        salud0 = b.obs().get("salud")
        e = b.hab("esperar_al_dia", t=200)
        salud1 = b.obs().get("salud")
        b.anotar("esperar", "esperar_al_dia", e, e.get("exito") and salud1 >= salud0, {"salud": [salud0, salud1], "hora": e.get("hora")})
        r(f"kill @e[tag={ETIQ}]")
        b.hab("salir_del_refugio")


def refugio_y_salida_sin_salir(b):
    b.arena()
    x, z = b.sitio(5)
    b.cuerpo(x, S, z, [], hora=13000)
    return b.hab("refugiarse")


def dormir(b):
    for k in range(max(3, b.n // 2)):
        b.arena()
        x, z = b.sitio(5)
        b.cuerpo(x, S, z, ["minecraft:red_bed"], hora=18000)
        r(f"kill @e[type=!minecraft:player,x={X},y={S},z={Z},distance=..40]")
        d = b.hab("dormir", t=120)
        o = b.obs()
        b.anotar("dormir", "dormir", d, d.get("exito") and d.get("cama"), {"hora": d.get("hora"), "cama": d.get("cama"), "modo": d.get("modo")})


def apartarse(b):
    lados = [(2, 0), (-2, 0), (0, 2), (0, -2), (2, 1), (-1, 2), (1, -2), (-2, -1), (2, 2), (-2, 2)]
    for k in range(b.n):
        b.arena()
        x, z = b.sitio(4)
        dx, dz = lados[k % len(lados)]
        b.cuerpo(x, S, z, [])
        r(f"setblock {x + dx} {S - 1} {z + dz} minecraft:lava")
        time.sleep(0.6)
        d = b.hab("apartarse")
        o = b.obs()
        p = o.get("pos", [x, S, z])
        lejos = ((p[0] - x - dx) ** 2 + (p[2] - z - dz) ** 2) ** 0.5
        b.anotar("apartarse", "apartarse", d, d.get("exito") and lejos >= 3.5 and o.get("salud", 0) >= 20,
                 {"lava": [dx, dz], "lejos": round(lejos, 1), "salud": o.get("salud")})
        r(f"setblock {x + dx} {S - 1} {z + dz} minecraft:grass_block")


def caza(b):
    for k in range(b.n):
        b.arena()
        x, z = b.sitio(4)
        b.cuerpo(x, S, z, ["minecraft:wooden_sword"])
        b.hambre(10)
        animal = ["cow", "pig", "chicken", "sheep"][k % 4]
        b.invocar(animal, x + 3, S, z, quitar_armadura=False)
        time.sleep(0.5)
        d = b.hab("recoger_comida", t=60)
        b.anotar("caza", "recoger_comida", d, d.get("exito"), {"animal": animal, "comida": d.get("comida"), "golpes": d.get("golpes")})
        r(f"kill @e[tag={ETIQ}]")


# ---- F8.0b · H-hab ----
def bloque_es(x, y, z, nombre):
    return "passed" in r(f"execute if block {x} {y} {z} minecraft:{nombre}")


def fundir(b):
    for k in range(b.n):
        b.arena()
        x, z = b.sitio(5)
        # la mitad lleva el horno; la otra mitad, piedra y troncos para fabricarlo (y la mesa)
        inv = ["minecraft:raw_iron 3", "minecraft:coal 1"] + (["minecraft:furnace"] if k % 2 == 0 else ["minecraft:cobblestone 8", "minecraft:oak_log 2"])
        b.cuerpo(x, S, z, inv)
        d = b.hab("fundir hierro 3", t=120)
        b.anotar("fundir", "fundir", d, d.get("exito") and d.get("obtenido") == 3,
                 {"horno": "llevado" if k % 2 == 0 else "fabricado", "obtenido": d.get("obtenido"), "puesto": d.get("puesto")})


def sacar(b):
    antes = COFRES.read_text() if COFRES.exists() else None
    try:
        for k in range(b.n):
            b.arena()
            x, z = b.sitio(4)
            cx, cz = x + 3, z
            r(f"setblock {cx} {S} {cz} minecraft:chest")
            r(f"item replace block {cx} {S} {cz} container.0 with minecraft:oak_log 10")
            r(f"item replace block {cx} {S} {cz} container.1 with minecraft:cobblestone 5")
            COFRES.write_text(json.dumps({"cofres": [{"nombre": "prueba", "bloques": [[cx, S, cz]]}]}) + "\n")
            b.cuerpo(x, S, z, [])
            d = b.hab("sacar_del_cofre troncos 6", t=60)
            sacado = (d.get("sacado") or {}).get("oak_log", 0)
            b.anotar("sacar", "sacar_del_cofre", d, d.get("exito") and sacado == 6, {"sacado": d.get("sacado")})
            r(f"setblock {cx} {S} {cz} minecraft:air")
    finally:
        if antes is None:
            COFRES.unlink(missing_ok=True)
        else:
            COFRES.write_text(antes)


def poner(b):
    objetos = [("cofre", "chest"), ("horno", "furnace"), ("mesa", "crafting_table"), ("antorcha", "torch"), ("tierra", "dirt")]
    antes = COFRES.read_text() if COFRES.exists() else None  # poner un cofre lo apunta en cofres.json
    try:
        for k in range(b.n):
            b.arena()
            x, z = b.sitio(5)
            alias, item = objetos[k % len(objetos)]
            b.cuerpo(x, S, z, [f"minecraft:{item} 2"])
            dx, dz = [(2, 0), (0, 2), (-2, 0), (0, -2)][k % 4]
            d = b.hab(f"poner {alias} {x + dx} {S} {z + dz}", t=30)
            b.anotar("poner", "poner", d, d.get("exito") and bloque_es(x + dx, S, z + dz, item), {"objeto": item, "facing": d.get("facing")})
    finally:
        if antes is None:
            COFRES.unlink(missing_ok=True)
        else:
            COFRES.write_text(antes)


def iluminar(b):
    for k in range(b.n):
        b.arena()
        x, z = b.sitio(3)
        b.cuerpo(x, S, z, ["minecraft:torch 16"], hora=18000)
        d = b.hab("iluminar 6", t=120)
        puestas = d.get("puestas") or []
        bien = all(bloque_es(px, py, pz, "torch") or bloque_es(px, py, pz, "wall_torch") for px, py, pz in puestas)
        b.anotar("iluminar", "iluminar", d, d.get("exito") and bien and len(puestas) > 0,
                 {"antorchas": len(puestas), "luz_min": d.get("luz_min"), "en_su_sitio": bien})


def escalera(b):
    """Escalera de 8 hacia el este en roca (piedra de S-11 a S-2). En las impares, lava junto al 4º escalón: tiene que parar antes
    («lava delante») sin tocarla. Contacto con la lava = perder vida."""
    x0, z0 = X - 9, Z
    for k in range(b.n):
        b.arena()
        fill(x0 - 1, S - 11, z0 - 3, x0 + 12, S - 2, z0 + 3, bloque="minecraft:stone")
        fill(x0 - 1, S - 1, z0 - 3, x0 + 12, S - 1, z0 + 3, bloque="minecraft:stone")
        lava = k % 2 == 1
        if lava:
            r(f"setblock {x0 + 4} {S - 4} {z0 + 1} minecraft:lava")
        b.cuerpo(x0, S, z0, ["minecraft:stone_pickaxe", "minecraft:cobblestone 8", "minecraft:torch 4"])
        d = b.hab(f"cavar_escalera {S - 8} este", t=200)
        o = b.obs()
        salud = o.get("salud", 0)
        ok = (d.get("causa") == "lava delante" if lava else d.get("exito") and d.get("y") == S - 8) and salud >= 20
        b.anotar("escalera", "cavar_escalera", d, ok, {"lava": lava, "y": d.get("y"), "pasos": d.get("pasos"), "salud": salud,
                                                       "antorchas": d.get("antorchas")})
        r(f"tp {b.nombre} {X + 0.5} {S} {Z + 0.5}")
        fill(x0 - 1, S - 12, z0 - 3, x0 + 12, S - 10, z0 + 3, bloque="minecraft:air")


def agua(b):
    for k in range(b.n):
        b.arena()
        x, z = b.sitio(4)
        r(f"setblock {x + 2} {S - 1} {z} minecraft:water")
        b.cuerpo(x, S, z, ["minecraft:bucket"])
        d = b.hab("recoger_agua", t=40)
        b.anotar("agua", "recoger_agua", d, d.get("exito"), {"pos": d.get("pos")})


def verter(b):
    for k in range(b.n):
        b.arena()
        x, z = b.sitio(4)
        b.cuerpo(x, S, z, ["minecraft:water_bucket"])
        dx, dz = [(2, 0), (0, 2), (-2, 0), (0, -2)][k % 4]
        d = b.hab(f"verter agua {x + dx} {S} {z + dz}", t=40)
        b.anotar("verter", "verter", d, d.get("exito") and bloque_es(x + dx, S, z + dz, "water"), {"pos": d.get("pos")})


def cazar(b):
    for k in range(b.n):
        b.arena()
        x, z = b.sitio(4)
        b.cuerpo(x, S, z, ["minecraft:wooden_sword"])
        animal = ["sheep", "cow", "pig", "chicken"][k % 4] if k % 2 else "sheep"
        for i in range(2):
            b.invocar(animal, x + 3, S, z + i * 2 - 1, quitar_armadura=False)
        time.sleep(0.5)
        d = b.hab(f"cazar {animal} 2", t=90)
        lana = any(n.endswith("_wool") for n in (d.get("obtenido") or {}))
        b.anotar("cazar", "cazar", d, d.get("exito") and (lana or animal != "sheep"), {"animal": animal, "obtenido": d.get("obtenido")})
        r(f"kill @e[tag={ETIQ}]")


def fab_gen(b):
    casos = [("cama", ["minecraft:white_wool 3", "minecraft:oak_log 2"], "white_bed"),
             ("cubo", ["minecraft:iron_ingot 3", "minecraft:oak_log 2"], "bucket"),
             ("cofre", ["minecraft:oak_log 3"], "chest"),
             ("horno", ["minecraft:cobblestone 8", "minecraft:oak_log 2"], "furnace"),
             ("pico_hierro", ["minecraft:iron_ingot 3", "minecraft:oak_log 2"], "iron_pickaxe")]
    for k in range(b.n):
        b.arena()
        x, z = b.sitio(5)
        alias, inv, item = casos[k % len(casos)]
        b.cuerpo(x, S, z, inv)
        d = b.hab(f"fabricar {alias}", t=60)
        b.anotar("fab_gen", "fabricar", d, d.get("exito") and (d.get("fabricados") or {}).get(item, 0) >= 1,
                 {"objeto": alias, "fabricados": d.get("fabricados"), "mesa": d.get("mesa")})


def reflejos(b):
    """Los reflejos (reflejos si), en reposo: no hay criterio en el plan; se mira qué hace en cada caso."""
    b.orden("reflejos si")
    casos = []

    def mirar(nombre, preparar, segundos=12, inv=("minecraft:wooden_sword",), hora=18000):
        b.orden("reflejos no")  # apagados mientras se prepara el caso (al encenderlos, olvida los golpes de antes)
        b.arena()
        x, z = X - 2, Z
        b.cuerpo(x, S, z, list(inv), hora=hora)
        r(f"kill @e[type=!minecraft:player,x={X},y={S},z={Z},distance=..40]")
        time.sleep(0.5)
        b.orden("reflejos si")
        antes = json.loads(b.orden("reflejos") or "{}").get("hechos") or {}
        preparar(x, z)
        time.sleep(segundos)
        ahora = json.loads(b.orden("reflejos") or "{}").get("hechos") or {}
        hechos = {k: v - antes.get(k, 0) for k, v in ahora.items() if v > antes.get(k, 0)}
        salud = b.obs().get("salud")
        casos.append({"caso": nombre, "reflejos": hechos, "salud": salud})
        print(f"  reflejos   {nombre}: {json.dumps(hechos, ensure_ascii=False)} · salud {salud}", flush=True)
        b.orden("reflejos no")  # que no siga reaccionando mientras se repone la arena
        r(f"kill @e[tag={ETIQ}]")

    def golpe_de(tipo):
        return lambda: r(f"damage {b.nombre} 2 minecraft:mob_attack by @e[type=minecraft:{tipo},tag={ETIQ},limit=1,sort=nearest]")

    def un_zombi(x, z):
        b.invocar("zombie", x + 3, S, z)
        time.sleep(0.3)
        golpe_de("zombie")()

    def tres_zombis(x, z):
        for dz in (-2, 0, 2):
            b.invocar("zombie", x + 4, S, z + dz)
        time.sleep(0.3)
        golpe_de("zombie")()

    mirar("un zombi le golpea → defenderse", un_zombi)
    mirar("tres zombis, uno le golpea → huir (y de noche, refugiarse)", tres_zombis, segundos=20)
    mirar("creeper quieto a 4 → apartarse", lambda x, z: b.invocar("creeper", x + 4, S, z, ia=False))
    mirar("lava a 2 → apartarse", lambda x, z: r(f"setblock {x + 2} {S - 1} {z} minecraft:lava"), hora=6000, segundos=8)
    mirar("hambre 5 con pan → comer", lambda x, z: b.hambre(5), inv=("minecraft:bread 3",), hora=6000, segundos=6)
    b.res["reflejos"] = [{"ok": True, **c} for c in casos]
    b.orden("reflejos no")


CRITERIOS = {  # sección → (mínimo de aciertos, de cuántas) con n = 10; se escala con --n
    "comer": 1.0, "llano": 0.9, "ladera": 0.7, "seguridad": 1.0, "zombi": 0.8, "esqueleto": 0.6, "esperar": 1.0, "apartarse": 1.0,
    # F8.0b (PLAN_F8_perfiles.md, banco H-hab), fijados antes de medir
    "fundir": 1.0, "sacar": 1.0, "poner": 1.0, "iluminar": 0.9, "escalera": 0.8, "agua": 0.9, "verter": 0.9, "cazar": 0.8, "fab_gen": 0.9,
}


def resumen(b):
    out = {}
    for sec, rs in b.res.items():
        if sec == "reflejos":
            continue
        n, ok = len(rs), sum(x["ok"] for x in rs)
        p = CRITERIOS.get(sec, 1.0 if sec.startswith("fab:") else None)
        out[sec] = {"bien": ok, "de": n, "criterio": None if p is None else f"≥ {p:.0%}", "pasa": None if p is None else ok >= p * n - 1e-9,
                    "s_mediana": round(statistics.median([x["s"] for x in rs]), 1) if rs else None}
        print(f"{sec:14} {ok}/{n}" + ("" if p is None else f" (criterio ≥ {p:.0%}: {'PASA' if out[sec]['pasa'] else 'NO PASA'})"), flush=True)
    return out


def medidas(b):
    hab = {}
    for h, ms in b.muestras.items():
        oks = [m[2] for m in ms if m[0]]
        hab[h] = {"n": len(ms), "exitos": sum(m[0] for m in ms), "causas": dict(Counter(m[1] for m in ms)),
                  "s_mediana": round(statistics.median(oks), 1) if oks else None, "s_max": max(m[2] for m in ms) if ms else None,
                  "muestras": ms}
    return {"fecha": time.strftime("%Y-%m-%d %H:%M"), "N": b.n, "semilla": 42, "mundo": MUNDO_SV, "arena": [X, S, Z],
            "nota": "F7.2, servidor-supervivencia/probar_supervivencia.py: arena de tierra cercada en el aire; refugiarse mezcla cavar "
                    "y tapiar (modo en extra)", "habilidades": hab}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--solo", default=",".join(SECCIONES))
    ap.add_argument("--n", type=int, default=10)
    ap.add_argument("--nombre", default="Prueba1")
    ap.add_argument("--puerto", type=int, default=3101)
    ap.add_argument("--sin-medidas", action="store_true", help="no escribir habilidades_medidas_sv.json")
    a = ap.parse_args()
    solo = SECCIONES_F8 if a.solo == "f8" else [s for s in a.solo.split(",") if s]  # F8.0b: --solo f8, las de la fundación
    if any(s not in SECCIONES + SECCIONES_F8 for s in solo):
        sys.exit(f"secciones: {', '.join(SECCIONES + SECCIONES_F8)} (o f8)")
    try:
        r("list")
    except OSError:
        sys.exit("el servidor de supervivencia no responde por RCON (25576): arráncalo con ./arrancar.sh")
    with socket.socket() as s:
        if s.connect_ex(("127.0.0.1", a.puerto)) == 0:
            sys.exit(f"el puerto de control {a.puerto} ya está ocupado")
    vigilar_memoria()
    b = Banco(a.nombre, a.puerto, a.n)
    info = {"inicio": time.strftime("%Y-%m-%d %H:%M:%S"), "memoria_mb": memoria_mb(), "secciones": solo}
    monstruos = re.search(r"(true|false)", r("gamerule spawn_monsters") or "")
    info["spawn_monsters"] = monstruos[1] if monstruos else None
    bot = None
    try:
        r(f"forceload add {CAJA[0]} {CAJA[2]} {CAJA[3]} {CAJA[5]}")
        for _ in range(40):
            if "not loaded" not in r(f"setblock {X} {CAJA[4]} {Z} minecraft:air"):
                break
            time.sleep(0.5)
        vol = (CAJA[3] - CAJA[0] + 1) * (CAJA[4] - CAJA[1] + 1) * (CAJA[5] - CAJA[2] + 1)
        vacios = llenados(fill(*CAJA, bloque="minecraft:structure_void", modo="replace minecraft:air"))
        fill(*CAJA, bloque="minecraft:air", modo="replace minecraft:structure_void")
        if vacios != vol:
            raise Parada(f"el hueco de la arena {CAJA} no está vacío ({vacios} de {vol} casillas de aire): no pongo nada")
        b.vacio = True
        r("gamerule spawn_monsters false")
        for (x0, z0, x1, z1) in [(X - R, Z - R, X + R, Z - R), (X - R, Z + R, X + R, Z + R), (X - R, Z - R, X - R, Z + R), (X + R, Z - R, X + R, Z + R)]:
            fill(x0, S - 9, z0, x1, S + 4, z1, bloque="minecraft:glass")
        b.arena()
        log = open(AQUI / "logs" / f"bot-{a.nombre}.log", "w")
        bot = subprocess.Popen(["node", "io.js", f"{a.nombre}:{a.puerto}"], cwd=AQUI.parent / "bot", stdout=log, stderr=subprocess.STDOUT,
                               env={**os.environ, "IO_SERVIDOR": MUNDO_SV}, start_new_session=True)
        info["pid_bot"] = bot.pid
        e = ""
        for _ in range(60):
            time.sleep(1)
            e = b.orden("estado", 5)
            if e.startswith("pos "):
                break
        if not e.startswith("pos "):
            raise Parada("el bot no responde: " + e)
        r(f"tp {a.nombre} {X + 0.5} {S} {Z + 0.5}")  # pudo quedar guardado dentro de la tierra de la arena
        b.orden("reflejos no")
        for s in solo:
            print(f"== {s}", flush=True)
            globals()[s](b)
    except Parada as e:
        info["parada"] = str(e)
        print("PARADA:", e, flush=True)
    except Exception as e:
        info["error"] = f"{type(e).__name__}: {e}"
        print("ERROR:", info["error"], flush=True)
    finally:
        # antes de cerrar el bot, al suelo de la aparición (si no, queda guardado en el aire, donde estaba la arena, y la próxima
        # vez que entre cae y muere)
        apar = json.loads((AQUI / "mundo.json").read_text())["aparicion"]
        r(f"tp {a.nombre} {apar[0] + 0.5} {apar[1]} {apar[2] + 0.5}")
        time.sleep(1.5)
        if bot:
            os.kill(bot.pid, signal.SIGTERM)  # solo el bot que lanzó este guion, por su PID
            try:
                bot.wait(15)
            except subprocess.TimeoutExpired:
                os.kill(bot.pid, signal.SIGKILL)
        r(f"kill @e[tag={ETIQ}]")
        if b.vacio:  # el hueco estaba vacío: lo que haya ahora es de la prueba
            r(f"kill @e[type=!minecraft:player,x={X},y={S},z={Z},distance=..40]")
            fill(*CAJA, bloque="minecraft:air")
            r(f"kill @e[type=minecraft:item,x={X},y={S},z={Z},distance=..40]")
        r(f"forceload remove {CAJA[0]} {CAJA[2]} {CAJA[3]} {CAJA[5]}")
        if info.get("spawn_monsters"):
            r(f"gamerule spawn_monsters {info['spawn_monsters']}")
        r("time set 1000")
        r("save-all flush")
        info["fin"] = time.strftime("%Y-%m-%d %H:%M:%S")
        info["memoria_mb_fin"] = memoria_mb()
        info["resumen"] = resumen(b)
        info["pruebas"] = b.res
        (AQUI / "logs" / f"supervivencia-{time.strftime('%Y%m%d-%H%M')}.json").write_text(json.dumps(info, ensure_ascii=False, indent=1) + "\n")
        if b.muestras and not a.sin_medidas:
            previo = {}
            if MEDIDAS.exists():  # lo medido antes de otras habilidades se conserva; las de esta pasada se sustituyen
                try:
                    previo = json.loads(MEDIDAS.read_text()).get("habilidades", {})
                except ValueError:
                    previo = {}
            m = medidas(b)
            m["habilidades"] = {**previo, **m["habilidades"]}
            MEDIDAS.write_text(json.dumps(m, ensure_ascii=False) + "\n")
            print(f"medidas: {MEDIDAS.name} ({', '.join(sorted(b.muestras))})", flush=True)
        print("FIN" + (" · " + info.get("parada", info.get("error", "")) if "parada" in info or "error" in info else ""), flush=True)


if __name__ == "__main__":
    main()
