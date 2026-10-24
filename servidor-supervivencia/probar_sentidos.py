#!/usr/bin/env python3
"""F7.1 · calibración de los sentidos de supervivencia (orden `obs_sv` del bot) en el mundo de supervivencia, con el servidor ya
en marcha (./arrancar.sh). Conecta un bot temporal (bot/io.js con IO_SERVIDOR=supervivencia; Prueba1, puerto de control 3101),
lo sube a una plataforma de piedra de 9×9×3 en el aire (encima de la aparición, en un hueco que se comprueba vacío antes) y prepara
cada situación por RCON. La luz solo le llega con cada trozo del mapa (el servidor no manda los cambios de luz de los trozos que
ya tiene; ver luz() en bot/observacion.js): la plataforma se pone antes de que entre el bot, y la antorcha de la comprobación 4,
en otra plataforma a 200 bloques (fuera de su vista), con el servidor en marcha (vacío está en pausa y no recalcula la luz).
10 comprobaciones (todas deben pasar):
   1 vector     47 entradas con los nombres de entorno_supervivencia.py (OBS), todas en [0, 1]
   2 luz_dia    de día a cielo abierto llega la luz del cielo del servidor (skyLight 15, no estimada) y luz = 1
   3 noche      time set 18000: noche = 1, hora_sen ≈ 0, hora_cos ≈ 0,5, luz ≈ 4/15 y evento `noche`; al final, `dia` al amanecer
   4 luz_bloque junto a la antorcha lejana, de noche: llega la luz de bloque (≥ 13) y luz ≥ 0,8; se anota
                también, sin contar, la de una antorcha puesta después (no llega: sale 0)
   5 zombi      zombi quieto (NoAI) a 10 bloques: hostil_dist ≈ 10/24, hostil_tipo_zombi = 1, hostiles_n = 1/4
   6 golpe      un golpe (/damage … by el zombi) da un solo evento `golpe` (n = 1, de zombie); dos seguidos, uno con n = 2
   7 hambre     efecto hunger: hambre ≤ 0,3 y un solo evento `hambre`
   8 inventario espada de madera 0,5 (de piedra 1), peto de hierro 6/20, 8 panes, 4 de tierra y una cama
   9 refugio    encerrado en una celda de piedra 1×2 (puesta con el bot dentro): en_refugio = 1, evento `refugiado` y luz 0
  10 peligros   lava a 2, pozo de agua de 2 de hondo a 2 y un agujero en la plataforma a 2: caida, lava_cerca y agua_profunda
                pasan de 0 a 1
Extra (no cuenta): muere (/kill) y reaparece → eventos `muerto` y `reaparecido`; luego se le lleva al suelo de la aparición.
Al terminar: mata al zombi, borra la plataforma (el hueco estaba vacío: solo quedan bloques de la prueba), pone el día, guarda
y cierra el bot por su PID. Comprueba la memoria disponible antes de cada paso y para si baja de 800 MB. El servidor sigue en
marcha: ./guardar.sh y ./parar.sh. Resultado en logs/sentidos-AAAAMMDD-HHMM.json.
Uso: python3 probar_sentidos.py [--nombre Prueba1] [--puerto 3101]
"""
import argparse, json, math, os, re, signal, socket, subprocess, sys, time, urllib.parse, urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "servidor"))
from rcon import rcon

MUNDO_SV = os.environ.get("IO_SERVIDOR") or "supervivencia"  # F8: el mismo banco en otro mundo (p. ej. local, 26.1.2)
(Path(__file__).resolve().parent / "logs").mkdir(exist_ok=True)  # registros del banco (ignorados por git)

MIN_MB = 800
X, Y, Z = 96, 150, -64            # el bot, de pie sobre la plataforma (encima de la aparición, 96 66 -64)
CAJA = (X - 5, Y - 4, Z - 5, X + 5, Y + 3, Z + 5)  # todo lo que la prueba pone: plataforma (Y-3..Y-1), refugio, antorcha…
LEJOS = 200  # la plataforma pequeña con la antorcha, a 200 bloques en z (12 trozos: fuera de la vista del bot, que es de 8)
CAJA2 = (X - 2, Y - 2, Z + LEJOS - 2, X + 2, Y + 2, Z + LEJOS + 2)
FORZAR = [f"forceload {{}} {c[0]} {c[2]} {c[3]} {c[5]}" for c in (CAJA, CAJA2)]  # sus trozos, cargados mientras dura la prueba
OBS = json.loads(subprocess.run([sys.executable, str(AQUI.parent / "entrenamiento" / "entorno_supervivencia.py"), "--obs"],
                                capture_output=True, text=True, check=True).stdout)["obs"]


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


def orden(puerto, c, t=15):
    try:
        return urllib.request.urlopen(f"http://127.0.0.1:{puerto}/?c=" + urllib.parse.quote(c), timeout=t).read().decode().strip()
    except Exception as e:
        return f"sin respuesta: {e}"


def fill(*c, bloque, modo=""):
    return r(f"fill {' '.join(map(str, c))} {bloque} {modo}".strip())


def llenados(texto):
    m = re.search(r"(\d+)", texto)
    return int(m[1]) if m and "illed" in texto else 0


class Prueba:
    def __init__(self, nombre, puerto):
        self.nombre, self.puerto, self.res = nombre, puerto, []

    def obs(self):
        vigilar_memoria()
        o = json.loads(orden(self.puerto, "obs_sv"))
        o["v"] = dict(zip(OBS, o["obs"]))
        return o

    def esperar(self, cond, t=8.0):
        """La observación en cuanto cumple cond (o la última, al cabo de t s)."""
        t0 = time.time()
        while True:
            o = self.obs()
            if cond(o) or time.time() - t0 > t:
                return o
            time.sleep(0.5)

    def eventos(self, tipo=None):
        """Los eventos nuevos desde la última lectura (la orden resumen marca lo leído)."""
        e = json.loads(orden(self.puerto, "resumen"))["eventos"]
        return [x for x in e if tipo is None or x["tipo"] == tipo]

    def anotar(self, n, clave, ok, datos):
        self.res.append({"n": n, "clave": clave, "ok": bool(ok), **datos})
        print(f"{n:2} {clave:10} {'BIEN ' if ok else 'FALLO'} {json.dumps(datos, ensure_ascii=False)}", flush=True)

    def tp(self, dz=0):
        r(f"tp {self.nombre} {X + 0.5} {Y} {Z + dz + 0.5}")
        time.sleep(1.5)


def cerca(a, b, tol):
    return abs(a - b) <= tol


def preparar(p):
    """Antes de que entre el bot: día, huecos vacíos (structure_void solo sustituye aire y se quita enseguida), plataformas y antorcha."""
    vigilar_memoria()
    for f in FORZAR:  # sin jugadores, esos trozos no están cargados (y fill dice «That position is not loaded»)
        r(f.format("add"))
    for _ in range(40):
        if all("not loaded" not in r(f"setblock {X} {Y + 3} {Z + dz} minecraft:air") for dz in (0, LEJOS)):
            break
        time.sleep(0.5)
    r("time set 1000")
    for caja in (CAJA, CAJA2):
        vol = (caja[3] - caja[0] + 1) * (caja[4] - caja[1] + 1) * (caja[5] - caja[2] + 1)
        vacios = llenados(fill(*caja, bloque="minecraft:structure_void", modo="replace minecraft:air"))
        fill(*caja, bloque="minecraft:air", modo="replace minecraft:structure_void")
        if vacios != vol:
            raise Parada(f"el hueco de la prueba {caja} no está vacío ({vacios} de {vol} casillas de aire): no pongo nada")
    p.vacio = True
    fill(X - 4, Y - 3, Z - 4, X + 4, Y - 1, Z + 4, bloque="minecraft:stone")


def correr(p, a):
    n = p.nombre
    luz = lambda o: o["datos"]["luz"]
    suelo = p.obs()
    print("en la aparición:", json.dumps({"pos": suelo["datos"]["pos"], "luz": luz(suelo)}), flush=True)
    p.tp()
    p.eventos()  # se descarta lo de la conexión

    # 1 · vector
    o = p.esperar(lambda o: o["datos"]["pos"] == [X, Y, Z])
    fuera = [k for k, v in o["v"].items() if not 0 <= v <= 1]
    p.anotar(1, "vector", len(o["obs"]) == len(OBS) == 47 and not fuera, {"entradas": len(o["obs"]), "obs": len(OBS), "fuera": fuera})

    # 2 · luz de día a cielo abierto
    o = p.esperar(lambda o: luz(o)["cielo"] == 15)
    l = luz(o)
    p.anotar(2, "luz_dia", l["cielo"] == 15 and not l["estimada"] and o["v"]["luz"] == 1 and o["v"]["noche"] == 0,
             {"luz": o["v"]["luz"], **l})

    # 3 · noche (y, al final, el día)
    r("time set 18000")
    o = p.esperar(lambda o: o["v"]["noche"] == 1 and luz(o)["osc"] == 11)
    ev = p.eventos("noche")
    v, l = o["v"], luz(o)
    noche = {"noche": v["noche"], "hora_sen": v["hora_sen"], "hora_cos": v["hora_cos"], "luz": v["luz"], "cielo": l["cielo"],
             "osc": l["osc"], "eventos_noche": len(ev)}
    noche_ok = (v["noche"] == 1 and cerca(v["hora_sen"], 0, 0.02) and cerca(v["hora_cos"], 0.5, 0.05)
                and cerca(v["luz"], 4 / 15, 0.01) and len(ev) == 1)

    # 4 · luz de bloque: junto a la antorcha de la plataforma lejana (puesta ahora, con el servidor en marcha); y, sin contar,
    #     una antorcha puesta al lado del bot en un trozo que ya tiene
    fill(X - 1, Y - 1, Z + LEJOS - 1, X + 1, Y - 1, Z + LEJOS + 1, bloque="minecraft:stone")
    r(f"setblock {X + 1} {Y} {Z + LEJOS} minecraft:torch")
    time.sleep(2)
    p.tp(LEJOS)
    o = p.esperar(lambda o: o["datos"]["pos"] == [X, Y, Z + LEJOS] and luz(o)["bloque"] >= 13, t=20)
    l = luz(o)
    p.tp()
    p.esperar(lambda o: o["datos"]["pos"] == [X, Y, Z], t=15)
    time.sleep(3)  # que llegue el trozo del centro (lo había soltado al irse) antes de poner la antorcha
    r(f"setblock {X + 1} {Y} {Z} minecraft:torch")
    time.sleep(3)
    nueva = luz(p.obs())["bloque"]
    r(f"setblock {X + 1} {Y} {Z} minecraft:air")
    p.anotar(4, "luz_bloque", o["datos"]["pos"] == [X, Y, Z + LEJOS] and l["bloque"] >= 13 and o["v"]["luz"] >= 0.8,
             {"luz": o["v"]["luz"], **l, "antorcha_nueva_bloque": nueva})

    # 5 · zombi quieto a 10 bloques
    r(f"summon minecraft:zombie {X + 10.5} {Y} {Z + 0.5} {{NoAI:1b,NoGravity:1b,PersistenceRequired:1b,Silent:1b,"
      "Tags:[\"prueba_sentidos\"]}")
    o = p.esperar(lambda o: o["v"]["hostil_tipo_zombi"] == 1)
    v = o["v"]
    p.anotar(5, "zombi", cerca(v["hostil_dist"], 10 / 24, 0.03) and v["hostil_tipo_zombi"] == 1 and v["hostiles_n"] == 0.25
             and sum(v["hostil_tipo_" + t] for t in ("zombi", "esqueleto", "aranya", "creeper", "otro")) == 1,
             {"hostil_dist": v["hostil_dist"], "zombi": v["hostil_tipo_zombi"], "hostiles_n": v["hostiles_n"],
              "hostil": o["datos"]["hostil"]})

    # 6 · golpes: uno solo → un evento con n = 1; dos seguidos (sin leer entre medias) → un evento con n = 2
    dano = f"damage {n} 2 minecraft:mob_attack by @e[type=minecraft:zombie,tag=prueba_sentidos,limit=1]"
    salud0 = p.obs()["datos"]["salud"]
    p.eventos()
    r(dano)
    time.sleep(2)
    uno = p.eventos("golpe")
    time.sleep(1.5)  # más de GOLPES (3 s) desde el primero
    r(dano)
    time.sleep(1)  # más que la invulnerabilidad tras un golpe (0,5 s)
    r(dano)
    time.sleep(2)
    dos = p.eventos("golpe")
    salud1 = p.obs()["datos"]["salud"]
    d = lambda ev: [{k: e["datos"].get(k) for k in ("de", "n", "salud", "dist")} for e in ev]
    p.anotar(6, "golpe", len(uno) == 1 and uno[0]["datos"]["n"] == 1 and uno[0]["datos"]["de"] == "zombie"
             and len(dos) == 1 and dos[0]["datos"]["n"] == 2 and salud1 < salud0,  # se regenera entre golpes
             {"un_golpe": d(uno), "dos_golpes": d(dos), "salud": [salud0, salud1]})
    r(f"effect give {n} minecraft:instant_health 1 4 true")
    p.tp()  # los golpes lo empujan

    # 7 · hambre
    p.eventos()
    r(f"effect give {n} minecraft:hunger 30 99 true")
    o = p.esperar(lambda o: o["v"]["hambre"] <= 0.3, t=25)
    r(f"effect clear {n} minecraft:hunger")
    time.sleep(1)
    ev = p.eventos("hambre")
    p.anotar(7, "hambre", o["v"]["hambre"] <= 0.3 and len(ev) == 1,
             {"hambre": o["v"]["hambre"], "comida": o["datos"]["hambre"], "eventos": [e.get("datos") for e in ev]})
    r(f"effect give {n} minecraft:saturation 1 20 true")

    # 8 · inventario
    for c in ("give {n} minecraft:wooden_sword", "give {n} minecraft:bread 8", "give {n} minecraft:dirt 4",
              "give {n} minecraft:red_bed", "item replace entity {n} armor.chest with minecraft:iron_chestplate"):
        r(c.format(n=n))
    o = p.esperar(lambda o: o["v"]["cama_inv"] == 1 and o["v"]["armadura"] > 0 and o["v"]["tierra_inv"] == 1)
    v = o["v"]
    madera = {k: v[k] for k in ("arma", "armadura", "comida_inv", "tierra_inv", "cama_inv")}
    r(f"give {n} minecraft:stone_sword")
    o2 = p.esperar(lambda o: o["v"]["arma"] == 1)
    p.anotar(8, "inventario", madera == {"arma": 0.5, "armadura": 0.3, "comida_inv": 1, "tierra_inv": 1, "cama_inv": 1}
             and o2["v"]["arma"] == 1, {**madera, "arma_piedra": o2["v"]["arma"]})

    # 9 · refugio: celda 1×2 de piedra (la base es la plataforma)
    p.tp()
    p.eventos()
    fill(X - 1, Y - 1, Z - 1, X + 1, Y + 2, Z + 1, bloque="minecraft:stone", modo="hollow")
    o = p.esperar(lambda o: o["v"]["en_refugio"] == 1 and luz(o)["cielo"] == 0)
    time.sleep(2.5)  # el vigía de refugiado mira cada 2 s
    o = p.obs()
    ev = p.eventos("refugiado")
    l = luz(o)
    p.anotar(9, "refugio", o["v"]["en_refugio"] == 1 and len(ev) == 1 and o["v"]["luz"] == 0 and not l["estimada"],
             {"en_refugio": o["v"]["en_refugio"], "eventos": len(ev), "luz": o["v"]["luz"], **l})
    fill(X - 1, Y, Z - 1, X + 1, Y + 2, Z + 1, bloque="minecraft:air")

    # 10 · peligros: antes, nada; después, lava a 2 (en la plataforma), pozo de agua de 2 a 2 y agujero hasta el vacío a 2
    o = p.esperar(lambda o: o["v"]["en_refugio"] == 0)
    antes = {k: o["v"][k] for k in ("caida", "lava_cerca", "agua_profunda")}
    r(f"setblock {X + 2} {Y - 1} {Z} minecraft:lava")
    fill(X - 2, Y - 2, Z, X - 2, Y - 1, Z, bloque="minecraft:water")
    fill(X, Y - 3, Z + 2, X, Y - 1, Z + 2, bloque="minecraft:air")
    o = p.esperar(lambda o: all(o["v"][k] == 1 for k in antes))
    despues = {k: o["v"][k] for k in antes}
    p.anotar(10, "peligros", all(v == 0 for v in antes.values()) and all(v == 1 for v in despues.values()),
             {"antes": antes, "despues": despues, "pos": o["datos"]["pos"]})

    # 3 (fin) · amanece: evento dia
    r("kill @e[tag=prueba_sentidos]")
    p.eventos()
    r("time set 1000")
    o = p.esperar(lambda o: o["v"]["noche"] == 0)
    time.sleep(1)
    dia = p.eventos("dia")
    noche["eventos_dia"] = len(dia)
    noche["noche_al_amanecer"] = o["v"]["noche"]
    p.anotar(3, "noche", noche_ok and len(dia) == 1 and o["v"]["noche"] == 0, noche)

    # extra · muere y reaparece (sin inventario que tirar)
    r(f"clear {n}")
    r(f"kill {n}")
    t0 = time.time()
    ev = []
    while time.time() - t0 < 15 and not any(e["tipo"] == "reaparecido" for e in ev):
        time.sleep(1)
        ev += p.eventos()
    # puede reaparecer encima de la plataforma (está sobre el punto de aparición): al suelo, para que no quede guardado en el aire
    ap = json.loads((AQUI / "mundo.json").read_text())["aparicion"]
    r(f"tp {n} {ap[0] + 0.5} {ap[1]} {ap[2] + 0.5}")
    time.sleep(2)
    tipos = [e["tipo"] for e in ev]
    pos = next((e.get("datos") for e in ev if e["tipo"] == "reaparecido"), None)
    print(f"extra reaparecer {'BIEN ' if 'muerto' in tipos and 'reaparecido' in tipos else 'FALLO'} "
          f"{json.dumps({'eventos': tipos, 'pos': pos})}", flush=True)
    p.extra = {"eventos": tipos, "reaparecido_en": pos}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--nombre", default="Prueba1")
    ap.add_argument("--puerto", type=int, default=3101)
    a = ap.parse_args()
    try:
        r("list")
    except OSError:
        sys.exit("el servidor de supervivencia no responde por RCON (25576): arráncalo con ./arrancar.sh")
    with socket.socket() as s:
        if s.connect_ex(("127.0.0.1", a.puerto)) == 0:
            sys.exit(f"el puerto de control {a.puerto} ya está ocupado")
    vigilar_memoria()

    p = Prueba(a.nombre, a.puerto)
    p.vacio, p.extra, info = False, None, {"inicio": time.strftime("%Y-%m-%d %H:%M:%S"), "memoria_mb": memoria_mb()}
    bot = None
    try:
        preparar(p)
        log = open(AQUI / "logs" / f"bot-{a.nombre}.log", "w")
        bot = subprocess.Popen(["node", "io.js", f"{a.nombre}:{a.puerto}"], cwd=AQUI.parent / "bot", stdout=log, stderr=subprocess.STDOUT,
                               env={**os.environ, "IO_SERVIDOR": MUNDO_SV}, start_new_session=True)
        info["pid_bot"] = bot.pid
        for _ in range(60):  # hasta 60 s para entrar
            time.sleep(1)
            e = orden(a.puerto, "estado")
            if e.startswith("pos "):
                break
        if not e.startswith("pos "):
            raise Parada("el bot no responde: " + e)
        correr(p, a)
    except Parada as e:
        info["parada"] = str(e)
        print("PARADA:", e, flush=True)
    except Exception as e:  # un fallo del guion no debe dejar la plataforma ni el bot
        info["error"] = f"{type(e).__name__}: {e}"
        print("ERROR:", info["error"], flush=True)
    finally:
        if bot:
            os.kill(bot.pid, signal.SIGTERM)  # solo el bot que lanzó este guion, por su PID
            try:
                bot.wait(15)
            except subprocess.TimeoutExpired:
                os.kill(bot.pid, signal.SIGKILL)
        r("kill @e[tag=prueba_sentidos]")
        if p.vacio:  # el hueco estaba vacío: lo que haya ahora es de la prueba
            fill(*CAJA, bloque="minecraft:air")
            fill(*CAJA2, bloque="minecraft:air")
            r(f"kill @e[type=minecraft:item,x={X},y={Y},z={Z},distance=..12]")
        for f in FORZAR:
            r(f.format("remove"))
        r("time set 1000")
        r("save-all flush")
        info["fin"] = time.strftime("%Y-%m-%d %H:%M:%S")
        info["memoria_mb_fin"] = memoria_mb()
        ok = sum(x["ok"] for x in p.res)
        info.update(bien=ok, de=10, comprobaciones=sorted(p.res, key=lambda x: x["n"]), extra=p.extra)
        (AQUI / "logs" / f"sentidos-{time.strftime('%Y%m%d-%H%M')}.json").write_text(json.dumps(info, ensure_ascii=False, indent=1) + "\n")
        print(f"RESUMEN: {ok}/10 · fallos: {[x['clave'] for x in p.res if not x['ok']] or 'ninguno'}"
              f"{' · ' + info.get('parada', info.get('error', '')) if 'parada' in info or 'error' in info else ''}", flush=True)
    return info


if __name__ == "__main__":
    main()
