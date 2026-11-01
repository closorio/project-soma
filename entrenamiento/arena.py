"""Banco común del asistente (P3, PLAN_asistente.md): las piezas de las puertas A0-A5, sacadas de lo que funcionó en
humo_26_3.py. Lo que aprendió A0 está aquí para no repetirlo (ver planes/asistente/TRAMPAS.md):
  - el terreno de verdad engaña: las pruebas que ponen o pican van en una plataforma en el aire (`plataforma`), cada una en
    su trozo, y se borra entera al acabar;
  - `depositar` se lleva al cofre todo lo que no es herramienta, arma, armadura ni comida: dar el material justo antes de
    cada prueba (`dar`);
  - de noche, o con monstruos, las habilidades se cortan por «amenaza»: dificultad pacífica mientras dura (`Sesion`);
  - todo lo que se toca se devuelve en `finally` (ficheros de datos del mundo, dificultad y reglas), pase lo que pase.
Uso:
    from arena import Mundo, Sesion, guardar
    m = Mundo("usuario")                       # o "local" (servidor-local/, 26.1.2)
    with Sesion(m, ficheros=[...]) as s:       # pacífico, restaura al salir
        s.plataforma(x, z)                     # suelo de hierba de 21×21 a y=200
        s.en(0, -8); m.dar("dirt 16"); r = m.hab("poner dirt")
        s.anota("poner", r.get("exito"), r.get("causa"))
    guardar(s.datos("A2", "minar en un punto"))   # JSON en entrenamiento/ejecuciones/ y nota en el vault
"""
import json, re, subprocess, sys, time, urllib.parse, urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "servidor"))
from rcon import rcon  # noqa: E402

POS = re.compile(r"\[(-?[\d.]+)d, (-?[\d.]+)d, (-?[\d.]+)d\]")


class Mundo:
    """Un mundo con su RCON y un personaje con su puerto de control."""

    def __init__(self, nombre="usuario", personaje="Soma", puerto=3001):
        self.nombre, self.personaje, self.puerto = nombre, personaje, puerto

    def r(self, orden):
        return rcon(orden, servidor=self.nombre)

    def orden(self, c, t=200):
        try:
            u = f"http://127.0.0.1:{self.puerto}/?c=" + urllib.parse.quote(c)
            return urllib.request.urlopen(u, timeout=t).read().decode().strip()
        except Exception as e:
            return f"sin respuesta: {e}"

    def hab(self, c, t=200):
        """Una habilidad por el puerto («hab NOMBRE args»): su JSON {exito, causa, …}, o un fallo con el texto."""
        s = self.orden("hab " + c, t)
        try:
            return json.loads(s)
        except ValueError:
            return {"exito": False, "causa": s[:200]}

    def pos(self):
        m = POS.search(self.r(f"data get entity {self.personaje} Pos"))
        return tuple(float(v) for v in m.groups()) if m else None

    def cuantos(self, item):
        """Cuántos lleva, sin quitarle nada («clear X item 0» solo cuenta)."""
        m = re.search(r"Found (\d+)", self.r(f"clear {self.personaje} {item} 0"))
        return int(m.group(1)) if m else 0

    def dar(self, *cosas):
        for c in cosas:
            self.r(f"give {self.personaje} {c}")

    def tp(self, x, y, z):
        self.r(f"tp {self.personaje} {x + 0.5} {y} {z + 0.5}")
        time.sleep(2)

    def conectado(self):
        return self.personaje in self.r("list")

    def esperar_conectado(self, s=60):
        for _ in range(int(s / 2)):
            if self.conectado():
                return True
            time.sleep(2)
        return False

    def llanura(self):
        """(x, z) de la llanura más cercana, o de otro bioma con suelo firme; (0, 0) si no hay ninguno."""
        for bioma in ("plains", "meadow", "forest", "savanna"):
            m = re.search(r"\[(-?\d+), [~\d-]+, (-?\d+)\]", self.r(f"locate biome minecraft:{bioma}"))
            if m:
                return int(m.group(1)), int(m.group(2))
        return 0, 0


class Sesion:
    """Lo que dura una puerta: pacífico, de día y con resistencia; al salir, devuelve ficheros, dificultad y la regla del sueño,
    y borra lo construido (plataformas, canteras, huertos). Las pruebas se apuntan con `anota`."""

    def __init__(self, mundo, ficheros=(), pacifico=True):
        self.m, self.ficheros, self.pacifico = mundo, [Path(f).resolve() for f in ficheros], pacifico
        self.pruebas, self.borrar, self.t0 = [], [], time.time()
        self.base = None  # (x, y, z) del centro de la plataforma

    def __enter__(self):
        m = self.m
        self.copia = {f: f.read_text(encoding="utf-8") for f in self.ficheros if f.exists()}
        self.dificultad = (re.search(r"difficulty is (\w+)", m.r("difficulty")) or [None, "normal"])[1].lower()
        self.sueno = (re.search(r"set to (\d+)", m.r("gamerule players_sleeping_percentage")) or [None, "100"])[1]
        if self.pacifico:
            m.r("difficulty peaceful")
        for c in ("time set day", "weather clear", f"effect give {m.personaje} resistance 3600 4 true"):
            m.r(c)
        return self

    def __exit__(self, *_):
        m = self.m
        for f, t in self.copia.items():
            f.write_text(t, encoding="utf-8")
        if self.base:
            m.tp(self.base[0], self.base[1], self.base[2])  # al suelo antes de borrar lo de arriba
        for caja in self.borrar:
            m.r("fill %d %d %d %d %d %d air" % caja)
        m.r(f"difficulty {self.dificultad}")
        m.r(f"gamerule players_sleeping_percentage {self.sueno}")
        m.r(f"effect clear {m.personaje}")
        print(f"restaurado: {len(self.copia)} ficheros, dificultad {self.dificultad}, sueño {self.sueno} %, "
              f"{len(self.borrar)} construcciones borradas", flush=True)
        return False

    def anota(self, nombre, pasa, detalle=""):
        self.pruebas.append({"nombre": nombre, "pasa": bool(pasa), "detalle": str(detalle)})
        print(("SÍ " if pasa else "NO ") + nombre + ": " + str(detalle), flush=True)

    def suelo_firme(self, x=None, z=None):
        """Lleva al personaje a tierra seca cerca de (x, z) (por defecto, la llanura más cercana) y la guarda como base."""
        if x is None:
            x, z = self.m.llanura()
        self.m.r(f"spreadplayers {x} {z} 1 30 false {self.m.personaje}")  # spreadplayers no deja en el agua; con 0 de
        time.sleep(3)                                                     # separación falla: siempre 1 o más
        p = self.m.pos()
        self.base = (int(p[0]), int(p[1]), int(p[2]))
        return self.base

    def plataforma(self, lado=21, y=200, suelo="grass_block"):
        """Suelo de `lado`×`lado` (3 capas, la de arriba en y-1) sobre la base; se borra al salir."""
        bx, _, bz = self.base or self.suelo_firme()
        h = lado // 2
        self.y = y
        # Suelo de 3 capas (hierba sobre 2 de tierra): con las reglas libres, minar solo pica lo que suelta a ≤ 3 de caída, y en una
        # capa sola sobre el vacío no picaba nada («nada que minar aquí», 2026-10-31). «fill» admite 32768 bloques: por franjas.
        for x0 in range(bx - h, bx + h + 1, 32):
            x1 = min(x0 + 31, bx + h)
            self.m.r(f"fill {x0} {y - 3} {bz - h} {x1} {y - 2} {bz + h} dirt")
            self.m.r(f"fill {x0} {y - 1} {bz - h} {x1} {y - 1} {bz + h} {suelo}")
            if lado <= 41:  # a y=200 el cielo ya es aire; en las pequeñas se limpia por si acaso
                self.m.r(f"fill {x0} {y} {bz - h} {x1} {y + 4} {bz + h} air")
            self.borrar.append((x0, y - 3, bz - h, x1, y + 4, bz + h))

    def en(self, dx, dz):
        """A su trozo de plataforma, desplazado (dx, dz) del centro."""
        bx, _, bz = self.base
        self.m.tp(bx + dx, self.y, bz + dz)

    def cantera(self, dx=0, dz=0, lado=12, alto=8, menas=(("iron_ore", 12), ("coal_ore", 12))):
        """Un cubo de piedra de lado×alto×lado bajo el trozo (dx, dz) de la plataforma, con menas en sitios fijos (minar es
        determinista). Devuelve la caja (x1, y1, z1, x2, y2, z2). La plataforma tiene que existir antes."""
        bx, _, bz = self.base
        x1, z1, y2 = bx + dx - lado // 2, bz + dz - lado // 2, self.y - 4  # bajo las 3 capas del suelo
        caja = (x1, y2 - alto + 1, z1, x1 + lado - 1, y2, z1 + lado - 1)
        self.m.r("fill %d %d %d %d %d %d stone" % caja)
        k = 0
        for mena, n in menas:
            for i in range(n):  # en una rejilla fija, dentro del cubo
                x, y, z = x1 + 1 + (k * 5) % (lado - 2), caja[1] + 1 + (k * 3) % (alto - 2), z1 + 1 + (k * 7) % (lado - 2)
                self.m.r(f"setblock {x} {y} {z} {mena}")
                k += 1
        self.borrar.append(caja)
        return caja

    def huerto(self, dx=0, dz=0, lado=3, cultivo=None):
        """Tierra arada de lado×lado en el suelo de la plataforma, con una fila de agua al oeste (a ≤ 4: la hidrata). Con
        `cultivo` («wheat[age=7]»: maduro), lo planta en todas. Devuelve las casillas aradas [(x, y, z)]."""
        bx, _, bz = self.base
        y, x1, z1 = self.y - 1, bx + dx, bz + dz
        self.m.r(f"fill {x1} {y} {z1} {x1 + lado - 1} {y} {z1 + lado - 1} farmland[moisture=7]")
        self.m.r(f"fill {x1 - 1} {y} {z1} {x1 - 1} {y} {z1 + lado - 1} water")
        casillas = [(x1 + i, y, z1 + j) for i in range(lado) for j in range(lado)]
        if cultivo:
            self.m.r(f"fill {x1} {y + 1} {z1} {x1 + lado - 1} {y + 1} {z1 + lado - 1} {cultivo}")
        return casillas

    def corral(self, especie, n=2, dx=0, dz=0, lado=7):
        """Valla de lado×lado con n animales adultos dentro, en la plataforma."""
        bx, _, bz = self.base
        y, h = self.y, lado // 2
        cx, cz = bx + dx, bz + dz
        self.m.r(f"fill {cx - h} {y} {cz - h} {cx + h} {y} {cz + h} oak_fence hollow")
        for i in range(n):
            self.m.r(f"summon {especie} {cx + (i % 3) - 1} {y} {cz + (i // 3) - 1}")
        return (cx - h, y, cz - h, cx + h, y, cz + h)

    def datos(self, puerta, titulo, entorno="minecraft", politica="habilidades por el puerto"):
        return {"tipo": "puerta", "puerta": puerta, "titulo": titulo, "fecha": time.strftime("%Y-%m-%d %H:%M"),
                "entorno": entorno, "politica": politica, "N": len(self.pruebas), "pruebas": self.pruebas,
                "pasa": bool(self.pruebas) and all(p["pasa"] for p in self.pruebas),
                "minutos": round((time.time() - self.t0) / 60, 1)}


def contar_cofre(m, x, y, z):
    """{objeto: cantidad} de un cofre, por RCON (sin abrirlo)."""
    t = m.r(f"data get block {x} {y} {z} Items")
    n = {}
    for item, c in re.findall(r'id: ?"minecraft:([a-z_]+)"[^}]*?count: ?(\d+)', t):
        n[item] = n.get(item, 0) + int(c)
    return n


def muertes_desde(log, desde):
    """Cuántas veces murió el personaje en el registro de bots desde el byte `desde`."""
    if not Path(log).exists():
        return 0
    return Path(log).read_text(encoding="utf-8", errors="replace")[desde:].count("ha muerto")


def reiniciar_bots(mundo):
    """Para los bots de ese mundo y arranca solo a Soma en modo órdenes (como make assistant)."""
    subprocess.run(["make", "--no-print-directory", "bots-stop", f"WORLD={mundo}"], cwd=RAIZ, capture_output=True)
    subprocess.run(["make", "--no-print-directory", "bots", f"WORLD={mundo}", "BOTS=Soma", "PORT=3001", "MODE=ordenes",
                    "BOT_DECIDER=guion"], cwd=RAIZ, capture_output=True)


def guardar(datos, nota=True):
    """JSON en entrenamiento/ejecuciones/ y, si se pide, la nota del vault con experimento.py. Devuelve la ruta del JSON."""
    sal = RAIZ / "entrenamiento" / "ejecuciones" / f"puerta-{datos['puerta'].lower()}-{time.strftime('%Y%m%d-%H%M')}.json"
    sal.parent.mkdir(parents=True, exist_ok=True)
    sal.write_text(json.dumps(datos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    hechas = sum(p["pasa"] for p in datos["pruebas"])
    print(f"{'PASA' if datos['pasa'] else 'NO PASA'} la puerta {datos['puerta']} ({hechas}/{len(datos['pruebas'])}): {sal}")
    if nota:
        h = RAIZ / "conocimiento" / "herramientas" / "experimento.py"
        v = "mejora" if datos["pasa"] else "pendiente"
        p = subprocess.run([sys.executable, str(h), str(sal), "--veredicto", v], capture_output=True, text=True)
        print(p.stdout.strip() or p.stderr.strip())
    return sal
