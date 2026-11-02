#!/usr/bin/env python3
"""F7.7 · ¿Aporta la mente en supervivencia? Hermano de experimento_mente.py para el mundo de supervivencia (25566, con el servidor
ya en marcha: servidor-supervivencia/arrancar.sh): 3 días de Minecraft (1 h real) desde el amanecer, con el inventario vacío y la
muerte real (sin inventario al reaparecer). Fijado antes de medir (PLAN_F7_supervivencia.md, F7.7):
Condiciones (mismo cuerpo: bot/io.js con la red oficial, politica_supervivencia_dagger3.json, y los reflejos del cuerpo):
  cuerpo  el personaje solo, en modo libre con un perfil fijo (--perfil, recolector) los 3 días
  mente   Alma, gobernada por una sesión de Claude Code con mente/alma/mente.py --mundo supervivencia (GUIA_supervivencia.md);
          el banco la deja en modo órdenes, dice LISTO y solo mide (a Alma no le pide `resumen`, que es de la mente)
Personajes (decisión del usuario: los mismos nombres, puertos 31xx): Soma 3101, Eco 3102 e Iris 3103 hacen de cuerpo solo y Alma 3104
de mente (con --alma cuerpo, también de cuerpo solo). Van a la vez, el j-ésimo de ORDEN en el punto (j + rotación) % 4 de
mundos/supervivencia/mundo.json: misma hora, tiempo, luna y monstruos para las dos condiciones, y tres réplicas del cuerpo solo que
no gastan cupo. El plan dice «mismo punto»: con --rotacion 0-3 en ejecuciones sucesivas Alma pasa por los puntos de los cuerpos; la
versión literal (una condición tras otra en el mismo punto) es --cuerpos "" con --alma cuerpo y luego --alma mente.
Por tramos de días (--dias, 1 por defecto: un día son 20 min y cabe con la mente en un contrato de 45 min): `nuevo` prepara y mide
los primeros, `seguir RUTA` vuelve a lanzar los bots (aparecen donde se quedaron, con lo que llevaban) y mide los siguientes. Al
acabar un tramo el banco cierra los bots (al amanecer, por su PID): entre tramos se puede guardar y parar el servidor
(guardar.sh --copia, parar.sh). Al seguir pone la hora del último amanecer medido (un tramo cortado repite su día desde el amanecer).
Preparación (nuevo): reglas keep_inventory false, advance_time true, spawn_monsters true y spawn_phantoms false (sin cama que
fabricar, como en F7.6); árboles junto a los puntos (reponer_arboles.py); cada bot en su punto con el inventario vacío, salud y
hambre llenas, `jugador_prueba ninguno` (los otros bots no son «el jugador»), el campamento de mundo.json y el perfil; monstruos y
objetos sueltos fuera a ≤ 64; marcador de muertes; `time set 0` (amanecer del día 0: la misma luna en todas las ejecuciones).
Métricas por personaje y día (una línea «dia» en servidor-supervivencia/logs/mente-sv-AAAAMMDD-HHMM.jsonl): muertes (marcador
deathCount) y su causa (consola), sobrevive el día, salud mínima y vida perdida (RCON cada PASO s), hambre mínima, segundos
refugiado (obs_sv), inventario y posición al acabar, y la cadena: el primer día y hora en que tuvo cada cosa de CADENA (el
inventario con la orden `estado`, que solo lee; comida y cama de `obs_sv`; el refugio fijo, una cabaña techada terminada en obras.json).
Criterio (fijado antes de medir): días sobrevividos = días de los 3 sin ninguna muerte (0-3). La mente aporta si Alma consigue la
espada de piedra en ≤ 3 días y no muere más que el cuerpo solo (sus muertes ≤ la media de los cuerpos solos de la misma ejecución, y
en el total de ejecuciones).
Al acabar el último día: los vivos al campamento, repone los pozos (las líneas [terreno] de los registros, del último tramo al
primero), lo que construyeron y minaron en la ejecución (obras.json), monstruos y objetos fuera, día y save-all. Los árboles talados
lejos de los puntos no se reponen: entre rotaciones, mejor restaurar la copia de antes (guardar.sh lo explica).
Seguridad: solo el servidor de supervivencia; para si la memoria disponible baja de 800 MB o un bot se cierra; los bots, por su PID.
Uso: experimento_mente_sv.py nuevo [--rotacion 0] [--dias 1] [--total 3] [--cuerpos Soma,Eco,Iris] [--alma mente|cuerpo]
                                   [--perfil recolector] [--politica RUTA]
     experimento_mente_sv.py seguir RUTA [--dias 1]
     experimento_mente_sv.py resumen RUTA [RUTA …]
     experimento_mente_sv.py --comprobar   prueba en seco: RCON y cuerpos de mentira, mente.py en una carpeta temporal
"""
import argparse, json, os, re, shutil, signal, subprocess, sys, tempfile, threading, time, urllib.parse
from collections import Counter
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
SV = RAIZ / "servidor-supervivencia"
sys.path.insert(0, str(SV))
import probar_noche as pn  # noqa: E402  (r, Bot, matar_cerca, reponer_terreno, gamerule, memoria_mb, Parada, OW, MUNDO, OBRAS)

MIN_MB = 800
ETIQ = "mente_sv"
DIA = 24000  # ticks de un día de Minecraft (20 min reales)
ORDEN = ["Soma", "Eco", "Iris", "Alma"]
PUERTOS = {"Soma": 3101, "Eco": 3102, "Iris": 3103, "Alma": 3104}
RED_SV = AQUI / "politica_supervivencia_dagger3.json"  # la oficial (semilla 0 de DAgger 3; decisión del usuario 2026-10-16)
PASO, CADA_ESTADO, CADA_OBS = 2.0, 8, 15  # s entre vueltas; vueltas entre lecturas de `estado` (16 s) y de `obs_sv` (30 s)
PIEDRA = ("cobblestone", "cobbled_deepslate", "blackstone")  # la que gasta fabricar.js
CADENA = ["troncos", "mesa", "espada_madera", "pico_madera", "piedra", "espada_piedra", "comida", "cama_o_refugio"]
SESION_MENTE = RAIZ / "mente" / "alma" / "supervivencia" / "sesion.json"  # la de mente.py --mundo supervivencia
MUERTE = (r"(was .*|drowned.*|fell.*|blew up.*|died.*|hit .*|tried .*|suffocated.*|went .*|burned.*|experienced.*|starved.*|"
          r"withered.*)$")


def log(t):
    print(f"[{time.strftime('%H:%M:%S')}] {t}", flush=True)


def fecha():
    return time.strftime("%Y-%m-%d %H:%M:%S")  # como obras.js (sv-SE, hora local)


def cadena_de(inv, comida, cama, refugio_fijo):
    """Lo de la cadena que tiene ahora: inventario de `estado` ({objeto: n}); comida y cama de obs_sv; la cabaña de obras.json."""
    return {"troncos": sum(n for k, n in inv.items() if k.endswith("_log")) >= 8, "mesa": inv.get("crafting_table", 0) > 0,
            "espada_madera": inv.get("wooden_sword", 0) > 0, "pico_madera": inv.get("wooden_pickaxe", 0) > 0,
            "piedra": sum(inv.get(k, 0) for k in PIEDRA) >= 8, "espada_piedra": inv.get("stone_sword", 0) > 0,
            "comida": (comida or 0) >= 6, "cama_o_refugio": bool(cama) or any(k.endswith("_bed") for k in inv) or refugio_fijo}


def leer(ruta):
    return [json.loads(l) for l in Path(ruta).read_text().splitlines() if l.strip()]


class Proceso:
    """Un bot lanzado por el banco (node io.js); se cierra por su PID, nunca por nombre."""
    def __init__(self, nombre, puerto, entorno, ruta):
        self.p = subprocess.Popen(["node", "io.js", f"{nombre}:{puerto}:recolector:ordenes"], cwd=RAIZ / "bot", stdout=open(ruta, "w"),
                                  stderr=subprocess.STDOUT, env=entorno, start_new_session=True)

    def vivo(self):
        return self.p.poll() is None

    def cerrar(self):
        if self.vivo():
            os.kill(self.p.pid, signal.SIGTERM)
            try:
                self.p.wait(10)
            except subprocess.TimeoutExpired:
                os.kill(self.p.pid, signal.SIGKILL)


class Banco:
    """Una ejecución (los personajes, 3 días) medida por tramos. `r`, `lanzar` y las rutas se cambian en --comprobar."""
    def __init__(self, salida, r=pn.r, lanzar=Proceso, obras=pn.OBRAS, consola=SV / "logs" / "latest.log", logs=SV / "logs",
                 sesion_mente=SESION_MENTE, paso=PASO, arboles=True, espera_mente=120, comprobar_puertos=True):
        self.salida, self.r, self.lanzar, self.obras, self.consola, self.dir_logs = Path(salida), r, lanzar, Path(obras), Path(consola), Path(logs)
        self.sesion_mente, self.paso, self.arboles, self.espera_mente = Path(sesion_mente), paso, arboles, espera_mente
        self.comprobar_puertos = comprobar_puertos
        self.procs, self.logs, self.cadena, self.muertes = {}, {}, {}, {}
        d = json.loads(pn.MUNDO.read_text())
        self.puntos, self.camp = d["puntos"], d["campamento"]
        self.cab = None
        self.dia_hecho, self.tramos_logs = 0, []
        if self.salida.exists():  # seguir: la cabecera, los tramos y lo conseguido hasta ahora
            filas = leer(self.salida)
            self.cab = next(f for f in filas if f["tipo"] == "ejecucion")
            self.tramos_logs = [f["logs"] for f in filas if f["tipo"] == "tramo"]
            dias = [f for f in filas if f["tipo"] == "dia"]
            por_dia = Counter(f["dia"] for f in dias)
            self.dia_hecho = max([k for k, n in por_dia.items() if n == len(self.cab["personajes"])] or [0])
            for f in dias:
                if f["dia"] <= self.dia_hecho:
                    self.cadena[f["personaje"]] = f["cadena"]

    # ---- personajes ----
    @property
    def pers(self):
        return self.cab["personajes"]

    def bot(self, p):
        return pn.Bot(p["nombre"], p["puerto"])

    def reglas(self):
        """Solo al empezar la ejecución: las reglas del mundo, los árboles junto a los puntos y el aviso de obras de antes."""
        for g, v in (("keep_inventory", "false"), ("advance_time", "true"), ("spawn_monsters", "true"), ("spawn_phantoms", "false")):
            pn.gamerule(g, v)
        if self.arboles:
            t = subprocess.run([sys.executable, "reponer_arboles.py"], cwd=SV, capture_output=True, text=True).stdout
            log("árboles: " + next((l for l in t.splitlines() if l.startswith("RESULTADO")), t[-200:]))
        try:
            viejas = [o["nombre"] for o in json.loads(self.obras.read_text()).get("obras", []) if o.get("estado") != "deshecha"]
        except (OSError, ValueError):
            viejas = []
        if viejas:
            log(f"AVISO: obras.json tiene obras sin deshacer de antes ({', '.join(viejas)}): la mente puede usarlas; mejor restaurar la copia")

    def arrancar(self):
        for p in self.pers:
            if self.comprobar_puertos and not self.bot(p).orden("personajes", 3).startswith("sin respuesta"):
                raise pn.Parada(f"ya hay un bot en el puerto {p['puerto']}: no lanzo otro")
        sello = time.strftime("%Y%m%d-%H%M%S")
        nombres = ",".join(p["nombre"] for p in self.pers)
        for p in self.pers:
            env = {**os.environ, "IO_SERVIDOR": "supervivencia", "IO_POLITICA": self.cab["politica"], "IO_BOTS": nombres}
            env.pop("IO_MODO", None)
            env.pop("IO_DECISOR", None)
            ruta = self.dir_logs / f"bot-{p['nombre']}-mente-sv-{sello}.log"
            self.logs[p["nombre"]] = str(ruta)
            self.procs[p["nombre"]] = self.lanzar(p["nombre"], p["puerto"], env, ruta)
        for p in self.pers:
            for _ in range(60):
                time.sleep(1 if self.paso >= 1 else 0.01)
                if not self.procs[p["nombre"]].vivo():
                    raise pn.Parada(f"el bot {p['nombre']} se cerró al arrancar ({Path(self.logs[p['nombre']]).name})")
                if "ha aparecido" in Path(self.logs[p["nombre"]]).read_text(errors="replace"):
                    break
            else:
                raise pn.Parada(f"el bot {p['nombre']} no apareció en 60 s")
        log("conectados: " + ", ".join(f"{p['nombre']} {p['puerto']} ({p['condicion']})" for p in self.pers))

    def preparar(self, nuevo):
        for p in self.pers:
            b = self.bot(p)
            b.orden("reflejos no"), b.orden("para"), b.orden("modo ordenes"), b.orden(f"perfil {self.cab['perfil']}")
            b.orden("jugador_prueba ninguno"), b.orden("campamento " + " ".join(map(str, self.camp)))
        if not nuevo:
            return
        for p in self.pers:
            n, (x, _, z) = p["nombre"], p["punto"]
            self.r(f"gamemode survival {n}")
            self.r(f"{pn.OW} positioned {x} 0 {z} positioned over motion_blocking_no_leaves run tp {n} ~ ~ ~")
        time.sleep(2 if self.paso >= 1 else 0)
        for sitio in [p["punto"] for p in self.pers] + [self.camp]:
            pn.matar_cerca(sitio)
        for p in self.pers:
            n = p["nombre"]
            self.r(f"clear {n}")
            self.r(f"effect clear {n}")
            self.r(f"effect give {n} minecraft:instant_health 1 10 true")
            self.r(f"effect give {n} minecraft:saturation 1 20 true")
        self.r(f"scoreboard objectives remove {ETIQ}")
        self.r(f"scoreboard objectives add {ETIQ} deathCount")

    def soltar(self, d0, fin):
        for p in self.pers:
            self.bot(p).orden("reflejos si")
        for p in self.pers:
            if p["condicion"] == "cuerpo":
                self.bot(p).orden("modo libre")
        alma = next((p for p in self.pers if p["condicion"] == "mente"), None)
        if alma:
            log(f"LISTO: Alma en {alma['punto']} (puerto {alma['puerto']}), día {d0 + 1} de {self.cab['total']}. Lanza ya la mente: "
                f"python3 mente/alma/mente.py inicio --mundo supervivencia --minutos {20 * (fin - d0) - 1} --turnos {30 * (fin - d0)} "
                f"--meta \"día {d0 + 1} de {self.cab['total']}: …\" (GUIA_supervivencia.md). Mido hasta el amanecer del día {fin + 1}.")

    # ---- lecturas ----
    def reloj(self):
        return pn.hora(r=self.r)  # (día, ticks del día) en 1.21.11 y 26.1 (servidor/rcon.py)

    def salud_pos(self, n):
        s = re.search(r"(-?[\d.]+)f", self.r(f"data get entity {n} Health"))
        p = re.findall(r"(-?[\d.]+)d", self.r(f"data get entity {n} Pos"))
        return (float(s[1]) if s else None), ([round(float(v), 1) for v in p[:3]] if len(p) >= 3 else None)

    def muertes_de(self, n):
        m = re.search(r"has (\d+) \[", self.r(f"scoreboard players get {n} {ETIQ}"))
        return int(m[1]) if m else 0

    def refugio_fijo(self, n):
        try:
            obras = json.loads(self.obras.read_text()).get("obras", [])
        except (OSError, ValueError):
            return False
        return any(o.get("personaje") == n and o.get("plano") == "cabana_techada" and o.get("estado") == "terminada"
                   and (o.get("inicio") or "") >= self.cab["desde"] for o in obras)

    def causas(self, desde, hasta):
        """{personaje: [mensajes de muerte]} de la consola entre dos horas locales HH:MM:SS (sin cruzar la medianoche)."""
        out, nombres = {}, "|".join(p["nombre"] for p in self.pers)
        if self.consola.exists():
            for l in self.consola.read_text(errors="replace").splitlines():
                m = re.match(rf"\[(\d\d:\d\d:\d\d)\] \[Server thread/INFO\]: ({nombres}) " + MUERTE, l)
                if m and desde <= m[1] <= hasta:
                    out.setdefault(m[2], []).append(m[3])
        return out

    # ---- un tramo: medir de un amanecer a otro ----
    def abrir(self, dia):
        return {p["nombre"]: {"dia": dia, "salud_min": 20.0, "perdida": 0.0, "s_prev": None, "hambre_min": 20, "refugio": 0,
                              "muertes": [], "pos": None, "inv": {}, "desde": time.strftime("%H:%M:%S")} for p in self.pers}

    def cerrar_dia(self, est):
        hasta = time.strftime("%H:%M:%S")
        for p in self.pers:
            e = est[p["nombre"]]
            causas = self.causas(e["desde"], hasta).get(p["nombre"], [])
            fila = {"tipo": "dia", "ejecucion": self.cab["id"], "personaje": p["nombre"], "condicion": p["condicion"], "punto": p["punto"],
                    "dia": e["dia"], "muertes": len(e["muertes"]), "sobrevive": not e["muertes"],
                    "muertes_detalle": [{**m, "causa": causas[i] if i < len(causas) else None} for i, m in enumerate(e["muertes"])],
                    "salud_min": e["salud_min"], "vida_perdida": round(e["perdida"], 1), "hambre_min": e["hambre_min"],
                    "s_refugiado": round(e["refugio"] * self.paso * CADA_OBS), "cadena": self.cadena.get(p["nombre"], {}),
                    "inventario_fin": e["inv"], "pos_fin": e["pos"], "fecha": fecha()}
            with open(self.salida, "a") as f:
                f.write(json.dumps(fila, ensure_ascii=False) + "\n")
            log(f"  día {e['dia']} {p['nombre']:4s} ({p['condicion']}) {'vive' if fila['sobrevive'] else 'MUERE ×%d' % fila['muertes']} · "
                f"salud mín {fila['salud_min']} · perdida {fila['vida_perdida']} · cadena {', '.join(fila['cadena']) or '-'}")

    def medir(self, d0, fin):
        t0, limite = time.time(), (fin - d0) * 1200 * 1.5 + 120
        est, k = self.abrir(d0 + 1), 0
        for p in self.pers:
            self.muertes[p["nombre"]] = self.muertes_de(p["nombre"])
        while True:
            time.sleep(self.paso)
            k += 1
            mb = pn.memoria_mb()
            if mb < MIN_MB:
                raise pn.Parada(f"solo quedan {mb} MB de memoria disponible (mínimo {MIN_MB}): paro")
            if time.time() - t0 > limite:
                raise pn.Parada(f"el tramo pasa de {limite:.0f} s sin llegar al amanecer del día {fin + 1} (¿el servidor va lento?)")
            dia, h = self.reloj()
            if dia is None:
                continue
            while dia >= est[self.pers[0]["nombre"]]["dia"]:  # amaneció: el día medido queda escrito
                self.cerrar_dia(est)
                self.dia_hecho = est[self.pers[0]["nombre"]]["dia"]
                if self.dia_hecho >= fin:
                    return f"amanecer del día {fin + 1}"
                est = self.abrir(self.dia_hecho + 1)
            for p in self.pers:
                n, e, b = p["nombre"], est[p["nombre"]], self.bot(p)
                if not self.procs[n].vivo():
                    raise pn.Parada(f"el bot {n} se cerró")
                s, pos = self.salud_pos(n)
                if s is not None:
                    e["perdida"] += max(0.0, (e["s_prev"] if e["s_prev"] is not None else s) - s)
                    e["s_prev"], e["salud_min"] = s, min(e["salud_min"], s)
                e["pos"] = pos or e["pos"]
                m = self.muertes_de(n)
                for _ in range(m - self.muertes[n]):
                    e["muertes"].append({"hora": h, "pos": e["pos"]})
                    log(f"MUERTE de {n} el día {e['dia']} (hora {h}) en {e['pos']}")
                self.muertes[n] = max(m, self.muertes[n])
                if k % CADA_ESTADO and k % CADA_OBS:
                    continue
                inv, hambre = e["inv"], None
                if k % CADA_ESTADO == 0:
                    t = b.orden("estado", 10)
                    if t.startswith("pos "):
                        inv = Counter()
                        for nom, c in re.findall(r"([a-z_]+)x(\d+)", t.split("inventario: ")[-1]):
                            inv[nom] += int(c)
                        e["inv"] = inv = dict(inv)
                        hambre = re.search(r"hambre (\d+)", t)
                        if hambre:
                            e["hambre_min"] = min(e["hambre_min"], int(hambre[1]))
                d = b.json("obs_sv", 10).get("datos") or {} if k % CADA_OBS == 0 else {}
                e["refugio"] += bool(d.get("en_refugio"))
                tiene = cadena_de(inv, d.get("comida"), d.get("cama"), k % CADA_OBS == 0 and self.refugio_fijo(n))
                c = self.cadena.setdefault(n, {})
                for clave in CADENA:
                    if tiene[clave] and clave not in c:
                        c[clave] = {"dia": e["dia"], "hora": h}
                        log(f"  {n} consigue {clave} (día {e['dia']}, hora {h})")

    def tramo(self, dias, nuevo):
        d0 = self.dia_hecho
        fin = min(d0 + dias, self.cab["total"])
        if d0 >= fin:
            log(f"la ejecución ya tiene sus {self.cab['total']} días")
            return
        t0, motivo = time.time(), None
        try:
            self.arrancar()
            if nuevo:
                self.reglas()
            self.preparar(nuevo)
            self.r(f"time set {DIA * d0}")  # 0 al empezar; al seguir, el último amanecer medido
            self.soltar(d0, fin)
            motivo = self.medir(d0, fin)
        except pn.Parada as e:
            motivo = "PARADA: " + str(e)
            log(motivo)
        finally:
            final = self.dia_hecho >= self.cab["total"]
            self.cerrar(final)
            with open(self.salida, "a") as f:
                f.write(json.dumps({"tipo": "tramo", "ejecucion": self.cab["id"], "dias": [d0 + 1, self.dia_hecho], "logs": self.logs,
                                    "segundos": round(time.time() - t0), "motivo": motivo, "final": final, "fecha": fecha()},
                                   ensure_ascii=False) + "\n")
        log(f"tramo acabado ({motivo}); días medidos: {self.dia_hecho} de {self.cab['total']}" +
            ("" if self.dia_hecho >= self.cab["total"] else f" · sigue con: experimento_mente_sv.py seguir {self.salida}"))

    # ---- cerrar: al acabar cada tramo; el último, además, deja el mundo como estaba ----
    def cerrar(self, final):
        vivos = [p for p in self.pers if p["nombre"] in self.procs and self.procs[p["nombre"]].vivo()]
        for p in vivos:  # lo que pase después del amanecer no se mide: todos quietos, y la mente cierra lo suyo
            if p["condicion"] == "cuerpo":
                self.bot(p).orden("modo ordenes", 5)
        if any(p["condicion"] == "mente" for p in vivos) and self.sesion_mente.exists():
            log("espero a que la mente cierre su sesión (mente.py fin --mundo supervivencia)")
            for _ in range(int(self.espera_mente)):
                if not self.sesion_mente.exists():
                    break
                time.sleep(1)
        for p in vivos:
            self.bot(p).orden("modo ordenes", 5)
            if final:  # que no se desconecte dentro de un pozo que se va a rellenar
                self.r(f"gamemode survival {p['nombre']}")
                self.r(f"{pn.OW} positioned {self.camp[0] + 2 * ORDEN.index(p['nombre'])} 0 {self.camp[2]} positioned over "
                       f"motion_blocking_no_leaves run tp {p['nombre']} ~ ~ ~")
        time.sleep(1.5 if self.paso >= 1 else 0)
        for p in self.pers:
            if p["nombre"] in self.procs:
                self.procs[p["nombre"]].cerrar()
        if final:
            todos = self.tramos_logs + [self.logs]
            repuestos = fallos = 0
            for logs in reversed(todos):  # del último tramo al primero: queda lo que había antes del primero
                for ruta in logs.values():
                    if Path(ruta).exists():
                        hechos = pn.reponer_terreno(ruta)
                        repuestos += len(hechos)
                        fallos += sum(len(x) > 4 for x in hechos)
            obras = self.reponer_obras()
            for sitio in [p["punto"] for p in self.pers] + [self.camp]:
                pn.matar_cerca(sitio)
            self.r("time set 1000")
            log(f"mundo repuesto: {repuestos} casillas de pozos ({fallos} sin reponer) y {obras} de obras y minados")
        self.r("save-all")

    def reponer_obras(self):
        """Lo que construyeron (→ aire) y minaron (→ el bloque que había) los personajes de la ejecución desde su inicio, según
        obras.json, solo dentro del rectángulo de obras; las obras quedan «deshecha» y lo minado «repuesto»."""
        try:
            d = json.loads(self.obras.read_text())
        except (OSError, ValueError):
            return 0
        rect, nombres, cambios = d.get("permitido") or {}, {p["nombre"] for p in self.pers}, []
        for o in d.get("obras", []):
            if o.get("personaje") in nombres and (o.get("inicio") or "") >= self.cab["desde"] and o.get("estado") != "deshecha":
                cambios += [(x, y, z, "air") for x, y, z, *_ in o.get("bloques", [])]
                o.update(estado="deshecha", fin=fecha(), nota="repuesta por experimento_mente_sv.py")
        for m in d.get("minados", []):
            if m.get("personaje") in nombres and (m.get("t") or "") >= self.cab["desde"] and not m.get("repuesto"):
                cambios.append((m["x"], m["y"], m["z"], m["tipo"]))
                m["repuesto"] = fecha()
        cambios = [c for c in cambios if rect and rect["x1"] <= c[0] <= rect["x2"] and rect["z1"] <= c[2] <= rect["z2"]]
        trozos = sorted({(x >> 4, z >> 4) for x, _, z, _ in cambios})
        for cx, cz in trozos:  # como pn.reponer_terreno: sin jugador cerca no hay nada cargado
            self.r(f"{pn.OW} run forceload add {cx * 16} {cz * 16}")
        try:
            for x, y, z, b in cambios:
                self.r(f"{pn.OW} run setblock {x} {y} {z} {b if ':' in b else 'minecraft:' + b}")
        finally:
            for cx, cz in trozos:
                self.r(f"{pn.OW} run forceload remove {cx * 16} {cz * 16}")
        self.obras.write_text(json.dumps(d, ensure_ascii=False, indent=1))
        return len(cambios)


def cabecera(a, salida):
    cuerpos = [c.strip() for c in a.cuerpos.split(",") if c.strip()]
    if any(c not in ORDEN[:3] for c in cuerpos):
        raise SystemExit(f"--cuerpos solo puede llevar {', '.join(ORDEN[:3])} (Alma es la de --alma)")
    puntos = json.loads(pn.MUNDO.read_text())["puntos"]
    nombres = [n for n in ORDEN if n in cuerpos] + ["Alma"]
    pers = [{"nombre": n, "puerto": PUERTOS[n], "condicion": a.alma if n == "Alma" else "cuerpo",
             "punto": puntos[(ORDEN.index(n) + a.rotacion) % 4]} for n in nombres]
    return {"tipo": "ejecucion", "id": Path(salida).stem, "rotacion": a.rotacion, "total": a.total, "perfil": a.perfil,
            "politica": a.politica, "personajes": pers, "desde": fecha()}


def resumen(rutas):
    filas = [f for ruta in rutas for f in leer(ruta)]
    cabs = {f["id"]: f for f in filas if f["tipo"] == "ejecucion"}
    dias = [f for f in filas if f["tipo"] == "dia"]
    por = {}
    for f in dias:
        por.setdefault((f["ejecucion"], f["personaje"]), []).append(f)
    out, cuerpo_total, mente_total = {}, [], []
    print("ejecución                personaje condición  días  sin morir  muertes  cadena (día)")
    for (ej, n), fs in sorted(por.items()):
        fs.sort(key=lambda f: f["dia"])
        c = fs[-1]["cadena"]
        o = {"condicion": fs[0]["condicion"], "punto": fs[0]["punto"], "dias": len(fs), "dias_sin_morir": sum(f["sobrevive"] for f in fs),
             "muertes": sum(f["muertes"] for f in fs), "cadena": {k: c[k]["dia"] for k in CADENA if k in c}}
        out[f"{ej}|{n}"] = o
        (mente_total if o["condicion"] == "mente" else cuerpo_total).append(o)
        print(f"{ej:24s} {n:9s} {o['condicion']:9s} {o['dias']:4d}  {o['dias_sin_morir']:9d}  {o['muertes']:7d}  "
              + (", ".join(f"{k} {d}" for k, d in o["cadena"].items()) or "-"))
    media = lambda xs: sum(xs) / len(xs) if xs else None
    for ej, cab in cabs.items():
        m = [o for k, o in out.items() if k.startswith(ej + "|") and o["condicion"] == "mente"]
        cs = [o["muertes"] for k, o in out.items() if k.startswith(ej + "|") and o["condicion"] == "cuerpo"]
        if not m:
            continue
        m = m[0]
        completa = m["dias"] >= cab["total"]
        esp = m["cadena"].get("espada_piedra")
        ref = media(cs) if cs else media([o["muertes"] for o in cuerpo_total])
        print(f"{ej}: " + ("" if completa else f"INCOMPLETA ({m['dias']}/{cab['total']} días) · ")
              + f"{'PASA ' if esp and esp <= 3 else 'FALLA'} espada de piedra en ≤ 3 días ({f'día {esp}' if esp else 'no'}) · "
              + (f"{'PASA ' if m['muertes'] <= ref else 'FALLA'} muertes de la mente {m['muertes']} ≤ cuerpo solo {ref:.2f}" if ref is not None
                 else "sin cuerpo solo con el que comparar"))
    if mente_total and cuerpo_total:
        mm, mc = sum(o["muertes"] for o in mente_total), media([o["muertes"] for o in cuerpo_total]) * len(mente_total)
        print(f"total: muertes de la mente {mm} frente a {mc:.2f} del cuerpo solo (media por personaje × {len(mente_total)} ejecuciones) · "
              f"días sin morir: mente {media([o['dias_sin_morir'] for o in mente_total]):.2f}, cuerpo {media([o['dias_sin_morir'] for o in cuerpo_total]):.2f}")
    print("RESULTADO mente_sv: " + json.dumps(out, ensure_ascii=False))
    return out


# ---------- prueba en seco ----------

class CuerpoFalso:
    """Un personaje de mentira en su puerto: las órdenes que usan el banco y mente.py, con la hora de `reloj()` y el
    inventario que diga `plan` [(tick, objeto, n)]."""
    def __init__(self, nombre, puerto, reloj, plan=()):
        from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
        self.nombre, self.reloj, self.plan, self.recibidas, self.ordenes, self.eventos = nombre, reloj, list(plan), [], [], []
        yo = self

        class H(BaseHTTPRequestHandler):
            def do_GET(self):
                q = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query)
                out = yo.atender((q.get("c") or [""])[0], (q.get("de") or [None])[0])
                self.send_response(200), self.end_headers()
                self.wfile.write((out + "\n").encode())

            def log_message(self, *_):
                pass
        self.srv = ThreadingHTTPServer(("127.0.0.1", puerto), H)
        threading.Thread(target=self.srv.serve_forever, daemon=True).start()

    def inventario(self):
        inv = Counter()
        for t, obj, n in self.plan:
            if self.reloj() >= t:
                inv[obj] += n
        return inv

    def atender(self, c, de):
        self.recibidas.append(c)
        t, inv = self.reloj(), self.inventario()
        h = t % DIA
        if c == "estado":
            return f"pos (96, 67, -56) · salud 20 · hambre 17 · jugadores: ninguno · inventario: " + (", ".join(f"{k}x{n}" for k, n in inv.items()) or "vacío")
        if c == "personajes":
            return json.dumps({"yo": self.nombre})
        if c == "obs_sv":
            return json.dumps({"obs": [], "datos": {"hora": h, "noche": 12480 <= h <= 23520, "luz": {"valor": 15}, "arma": "wooden_sword" if inv.get("wooden_sword") else None,
                                                    "armadura": 0, "tierra": 2, "cama": False, "comida": 3, "refugio": [90, 66, -50], "refugio_dist": 4.2,
                                                    "en_refugio": 13000 <= h <= 23000, "hostiles": 1, "hostil": "zombie@9.0", "caida": False, "lava": False, "agua_profunda": False}})
        if c.startswith(("orden ", "orden_esperar ")):
            self.ordenes.append({"texto": c.split(" ", 1)[1], "quien": de or "ío", "exito": True, "resultado": "hecho", "s": 2})
            return "hecho" if c.startswith("orden_esperar") else "voy"
        if c.startswith("resumen"):
            ords, evs, self.ordenes, self.eventos = self.ordenes, self.eventos, [], []
            return json.dumps({"personaje": self.nombre, "mundo": "supervivencia", "desde": None, "hasta": "19:00:00", "seq": [0, 1],
                               "modo": {"modo": "ordenes", "perfil": "recolector", "orden": None, "despues": "quieto", "tramo": None},
                               "hecho": {"ordenes": ords, "tramos": [], "troncos_ganados": 0, "viajes_cofre": {"n": 0, "guardado": {}}, "habilidades": {}},
                               "fallos": [], "eventos": evs,
                               "ahora": {"pos": [96, 67, -56], "salud": 20, "hambre": 17, "hora": {"ticks": h, "noche": 12480 <= h <= 23520},
                                         "arbol": None, "jugador": None, "amenaza": None, "companero": None,
                                         "inventario": {"troncos": 0, "tablones": 0, "herramientas": [], "comida": 3, "otros": {}, "huecos": 30},
                                         "cofre": {"activo": True, "guardados": 0, "llenos": False}, "campamento": [96, 67, -56]}})
        return "vale"


class ServidorFalso:
    """El RCON de mentira: un reloj que avanza `paso` ticks en cada «time query daytime», salud, posición y muertes."""
    def __init__(self, paso=1500, golpes=(), muertes=()):
        self.t, self.paso, self.golpes, self.morir, self.cmds = 0, paso, list(golpes), list(muertes), []
        self.dano, self.marcador, self.hechos = Counter(), Counter(), set()

    def r(self, cmd):
        self.cmds.append(cmd)
        if (m := re.match(r"time set (\d+)$", cmd)):
            self.t = int(m[1]); return f"Set the time to {self.t}"
        if cmd == "time query daytime":
            self.t += self.paso
            for n, t, dano in self.golpes:
                if self.t >= t and ("golpe", n, t) not in self.hechos:
                    self.hechos.add(("golpe", n, t)); self.dano[n] += dano
            for n, t in self.morir:
                if self.t >= t and ("muerte", n, t) not in self.hechos:
                    self.hechos.add(("muerte", n, t)); self.marcador[n] += 1
            return f"The time is {self.t % DIA}"
        if cmd == "time query day":
            return f"The time is {self.t // DIA}"
        if (m := re.match(r"data get entity (\w+) Health", cmd)):
            v = 20 - self.dano[m[1]]
            self.dano[m[1]] = 0  # el golpe dura una lectura: luego se cura
            return f"{m[1]} has the following entity data: {v:.1f}f"
        if (m := re.match(r"data get entity (\w+) Pos", cmd)):
            return f"{m[1]} has the following entity data: [96.5d, 67.0d, -56.5d]"
        if (m := re.match(rf"scoreboard players get (\w+) {ETIQ}", cmd)):
            return f"{m[1]} has {self.marcador[m[1]]} [{ETIQ}]"
        if cmd.startswith("gamerule"):
            return "Gamerule " + cmd.split()[1] + " is now set to: " + (cmd.split()[2] if len(cmd.split()) > 2 else "true")
        if " setblock " in cmd:
            return "Changed the block"
        return ""


class ProcesoFalso:
    def __init__(self, nombre, puerto, entorno, ruta):
        assert entorno["IO_SERVIDOR"] == "supervivencia" and entorno["IO_POLITICA"].endswith("dagger3.json"), entorno.get("IO_POLITICA")
        t = f"[mc] {nombre} ha aparecido en (96, 67, -56)\n"
        if nombre == "Alma":
            t += '[terreno] {"rotos": [[90, 66, -50, "dirt"]], "puestos": [[90, 67, -50, "dirt"]]}\n'
        Path(ruta).write_text(t)
        self.abierto = True

    def vivo(self):
        return self.abierto

    def cerrar(self):
        self.abierto = False


def comprobar():
    global PUERTOS
    ok, puertos_reales = [], PUERTOS

    def mira(cond, texto):
        ok.append(bool(cond))
        print(("bien  " if cond else "FALLO ") + texto, flush=True)

    # 2026-11-02: los datos de cada persona, en su copia «.local» (zonas.local.json…)
    local = lambda p: p.with_name(p.stem + ".local" + p.suffix)
    reales = [pn.MUNDO, pn.OBRAS, local(RAIZ / "mundos" / "supervivencia" / "diario.md"), local(RAIZ / "mundos" / "supervivencia" / "arboles.json"),
              local(RAIZ / "mente" / "diario.md"), RAIZ / "mente" / "alma" / "diario.md", RAIZ / "mente" / "alma" / "memoria.md"]
    antes = {p: p.read_bytes() if p.exists() else None for p in reales}
    tmp = Path(tempfile.mkdtemp(prefix="mente_sv_"))
    r_real = pn.r
    try:
        # 1 · el banco: nuevo (1 día) y seguir (2 días), con Soma, Eco, Iris y Alma en puertos de prueba y la rotación 1
        srv = ServidorFalso(golpes=[("Soma", 15000, 5)], muertes=[("Eco", 30000)])
        pn.r = srv.r  # matar_cerca, gamerule y reponer_terreno usan el RCON del módulo
        PUERTOS = {n: 3191 + i for i, n in enumerate(ORDEN)}
        planes = {"Alma": [(3000, "oak_log", 9), (5000, "crafting_table", 1), (6000, "wooden_sword", 1), (7000, "wooden_pickaxe", 1),
                           (9000, "cobblestone", 8), (26000, "stone_sword", 1)], "Soma": [(4000, "oak_log", 3), (8000, "wooden_sword", 1)]}
        falsos = {n: CuerpoFalso(n, PUERTOS[n], lambda: srv.t, planes.get(n, ())) for n in ORDEN}
        obras = tmp / "obras.json"
        rect = json.loads(pn.OBRAS.read_text())["permitido"]
        obras.write_text(json.dumps({"permitido": rect, "obras": [
            {"id": "o1", "nombre": "cabana_techada-1", "plano": "cabana_techada", "personaje": "Alma", "inicio": "2999-01-01 00:00:00", "estado": "terminada",
             "bloques": [[100, 67, -50, "oak_planks"]]},
            {"id": "o0", "nombre": "vieja", "plano": "cabana", "personaje": "Alma", "inicio": "2000-01-01 00:00:00", "estado": "terminada",
             "bloques": [[101, 67, -51, "oak_planks"]]}],
            "minados": [{"t": "2999-01-01 00:00:01", "personaje": "Alma", "x": 101, "y": 66, "z": -52, "tipo": "stone"}]}))
        salida = tmp / "mente-sv-prueba.jsonl"
        a = argparse.Namespace(rotacion=1, total=3, perfil="recolector", politica=str(RED_SV), cuerpos="Soma,Eco,Iris", alma="mente")
        rutas = dict(obras=obras, consola=tmp / "latest.log", logs=tmp, sesion_mente=tmp / "sesion.json", paso=0.005, arboles=False, espera_mente=0, comprobar_puertos=False)
        b = Banco(salida, r=srv.r, lanzar=ProcesoFalso, **rutas)
        b.cab = cabecera(a, salida)
        salida.write_text(json.dumps(b.cab, ensure_ascii=False) + "\n")
        puntos = json.loads(pn.MUNDO.read_text())["puntos"]
        mira([p["punto"] for p in b.pers] == [puntos[1], puntos[2], puntos[3], puntos[0]], "rotación 1: Soma, Eco, Iris y Alma en los puntos 1, 2, 3 y 0")
        b.tramo(1, True)
        mira("time set 0" in srv.cmds and any("keep_inventory false" in c for c in srv.cmds) and any("spawn_phantoms false" in c for c in srv.cmds),
             "nuevo: amanecer del día 0, keep_inventory false y spawn_phantoms false")
        mira(all(f"clear {n}" in srv.cmds for n in ORDEN) and all("modo libre" in falsos[n].recibidas for n in ORDEN[:3])
             and "modo libre" not in falsos["Alma"].recibidas and "resumen" not in falsos["Alma"].recibidas,
             "inventario vacío; los cuerpos en modo libre; Alma no (y sin pedirle `resumen`)")
        mira(all("jugador_prueba ninguno" in falsos[n].recibidas and "reflejos si" in falsos[n].recibidas for n in ORDEN), "jugador_prueba ninguno y reflejos en todos")
        mira(b.dia_hecho == 1 and not any(" setblock " in c for c in srv.cmds), "tras el primer tramo: 1 día y el mundo sin reponer (no es el último)")
        srv.cmds.clear()
        b2 = Banco(salida, r=srv.r, lanzar=ProcesoFalso, **rutas)
        mira(b2.dia_hecho == 1 and b2.cadena["Alma"].get("mesa", {}).get("dia") == 1, "seguir: lee el día hecho y la cadena de Alma")
        b2.tramo(2, False)
        mira("time set 24000" in srv.cmds and "time set 1000" in srv.cmds, "seguir pone el amanecer del día 1; al acabar, el día")
        filas = leer(salida)
        dias = [f for f in filas if f["tipo"] == "dia"]
        de = lambda n, d: next(f for f in dias if f["personaje"] == n and f["dia"] == d)
        mira(len(dias) == 12 and len([f for f in filas if f["tipo"] == "tramo"]) == 2, "12 líneas de día (4 personajes × 3) y 2 tramos")
        mira(de("Alma", 3)["cadena"].get("espada_piedra", {}).get("dia") == 2 and de("Alma", 1)["cadena"].get("cama_o_refugio", {}).get("dia") == 1
             and "comida" not in de("Alma", 3)["cadena"], "cadena de Alma: espada de piedra el día 2, refugio fijo (cabaña techada) el 1, comida no")
        mira(de("Soma", 1)["salud_min"] == 15 and de("Soma", 1)["vida_perdida"] == 5 and set(de("Soma", 3)["cadena"]) == {"espada_madera"},
             "Soma: el golpe de 5 el día 1 y solo la espada de madera")
        mira(de("Eco", 2)["muertes"] == 1 and not de("Eco", 2)["sobrevive"] and de("Eco", 1)["sobrevive"] and de("Eco", 3)["sobrevive"],
             "Eco muere una vez el día 2 y sobrevive el 1 y el 3")
        mira("execute in minecraft:overworld run setblock 90 66 -50 minecraft:dirt" in srv.cmds and "execute in minecraft:overworld run setblock 90 67 -50 minecraft:air" in srv.cmds,
             "al acabar repone el pozo de Alma (los dos tramos)")
        ob = json.loads(obras.read_text())
        mira("execute in minecraft:overworld run setblock 100 67 -50 minecraft:air" in srv.cmds and "execute in minecraft:overworld run setblock 101 66 -52 minecraft:stone" in srv.cmds
             and not any("101 67 -51" in c for c in srv.cmds) and ob["obras"][0]["estado"] == "deshecha" and ob["obras"][1]["estado"] == "terminada" and ob["minados"][0].get("repuesto"),
             "repone la cabaña y lo minado de esta ejecución, no la obra de antes")
        res = resumen([salida])
        mira(res[f"{b.cab['id']}|Alma"]["cadena"]["espada_piedra"] == 2 and res[f"{b.cab['id']}|Eco"]["muertes"] == 1
             and res[f"{b.cab['id']}|Soma"]["dias_sin_morir"] == 3, "resumen: espada de piedra día 2, Eco 1 muerte, Soma 3 días sin morir")
        for f in falsos.values():
            f.srv.shutdown()

        # 2 · mente.py --mundo supervivencia, copiado a una carpeta temporal (no escribe nada de verdad) contra una Alma de mentira
        arbol = tmp / "arbol"
        for rel in ("mente/alma/mente.py", "entrenamiento/mundo.py", "mundos/supervivencia/mundo.json"):
            (arbol / rel).parent.mkdir(parents=True, exist_ok=True)
            shutil.copy(RAIZ / rel, arbol / rel)
        (arbol / "mundos" / "supervivencia" / "diario.md").write_text("")
        t_ini = time.time()
        reloj = lambda: int(11000 + 200 * (time.time() - t_ini))  # anochece (11500) a los 2,5 s
        alma = CuerpoFalso("Alma", 3195, reloj)

        def mente(*args):
            env = {k: v for k, v in os.environ.items() if k != "IO_SERVIDOR"}
            p = subprocess.run([sys.executable, str(arbol / "mente/alma/mente.py"), *args], capture_output=True, text=True, env=env, timeout=120)
            return p.stdout + p.stderr
        o = mente("inicio", "--mundo", "supervivencia", "--puerto", "3195", "--minutos", "5", "--turnos", "6", "--meta", "día 1: cadena mínima", "--forzar")
        mira("mundo supervivencia" in o and "supervivencia: hora" in o and "anochecer en" in o, "inicio: sesión del mundo de supervivencia con la línea de supervivencia")
        mira("campamento 96 67 -56" not in alma.recibidas, "el campamento que ya tenía el cuerpo se respeta")
        o = mente("ver", "--mundo", "supervivencia")
        mira("refugio a 4 bloques" in o and "arma -" in o and "monstruos 1 (el más cerca zombie@9.0)" in o, "ver: refugio, equipo y monstruos")
        alma.eventos.append({"t": "19:00:01", "tipo": "hambre", "datos": 6})
        o = mente("--mundo", "supervivencia", "esperar", "--max", "40")
        mira("anochecer (hora" in o and "evento: hambre" in o, "esperar despierta al anochecer y con el aviso de hambre")
        mente("meta", "libre", "--perfil", "supervivencia", "--minutos", "0.05", "--mundo", "supervivencia")
        o = mente("esperar", "--mundo", "supervivencia", "--max", "40")
        mira("fin de la meta libre" in o and "perfil supervivencia" in alma.recibidas, "meta libre con perfil supervivencia y su fin")
        mente("orden", "vuelve al campamento", "--mundo", "supervivencia", "--porque", "anochece")
        o = mente("esperar", "--mundo", "supervivencia", "--max", "40")
        mira("orden terminada" in o and "evento: anochecer" not in o, "orden terminada (y el anochecer avisa una sola vez)")
        o = mente("ver")
        mira("no hay sesión en el mundo usuario" in o and "--mundo supervivencia" in o, "sin --mundo avisa de que la sesión es del otro mundo")
        o = mente("fin", "--mundo", "supervivencia", "--voz", "Alma ha hecho la prueba.")
        sv = arbol / "mente" / "alma" / "supervivencia"
        mira("sesión cerrada" in o and (sv / "sesiones.md").exists() and (sv / "diario.md").exists() and not (sv / "sesion.json").exists()
             and not (arbol / "mente" / "alma" / "diario.md").exists(), "fin: los archivos de la mente en mente/alma/supervivencia/, ninguno en los del usuario")
        d = (arbol / "mundos" / "supervivencia" / "diario.md").read_text()
        mira("## Mente Alma · sesión" in d and "mundo supervivencia" in d and "fin ·" in d, "cabecera y cierre en el diario del mundo de supervivencia")
        alma.srv.shutdown()
    finally:
        pn.r, PUERTOS = r_real, puertos_reales
        shutil.rmtree(tmp, ignore_errors=True)
    mira(all((p.read_bytes() if p.exists() else None) == v for p, v in antes.items()), "ningún archivo real cambió (obras, mundo, diarios, memoria)")
    print(f"comprobar: {sum(ok)}/{len(ok)} bien")
    return all(ok)


def main():
    if sys.argv[1:] == ["--comprobar"]:
        sys.exit(0 if comprobar() else 1)
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("parte", choices=["nuevo", "seguir", "resumen"])
    ap.add_argument("rutas", nargs="*")
    ap.add_argument("--rotacion", type=int, default=0, choices=range(4))
    ap.add_argument("--dias", type=int, default=1, help="días de este tramo")
    ap.add_argument("--total", type=int, default=3)
    ap.add_argument("--cuerpos", default="Soma,Eco,Iris")
    ap.add_argument("--alma", choices=["mente", "cuerpo"], default="mente")
    ap.add_argument("--perfil", default="recolector")
    ap.add_argument("--politica", default=str(RED_SV))
    a = ap.parse_args()
    if a.parte == "resumen":
        resumen(a.rutas)
        return
    pol = Path(a.politica)
    a.politica = str(pol.resolve() if pol.exists() else AQUI / pol)
    if "players" not in pn.r("list"):
        sys.exit("el servidor de supervivencia no responde por RCON (servidor-supervivencia/arrancar.sh)")
    if pn.memoria_mb() < 2 * MIN_MB:
        sys.exit(f"solo hay {pn.memoria_mb()} MB disponibles: no empiezo")
    (SV / "logs").mkdir(exist_ok=True)
    if a.parte == "nuevo":
        salida = SV / "logs" / f"mente-sv-{time.strftime('%Y%m%d-%H%M')}.jsonl"
        b = Banco(salida)
        b.cab = cabecera(a, salida)
        salida.write_text(json.dumps(b.cab, ensure_ascii=False) + "\n")
        log(f"resultados en {salida.relative_to(RAIZ)} · rotación {a.rotacion} · " + ", ".join(f"{p['nombre']}→{p['punto']}" for p in b.pers))
        b.tramo(a.dias, True)
    else:
        if not a.rutas:
            sys.exit("seguir necesita la RUTA del .jsonl de la ejecución")
        b = Banco(a.rutas[0])
        if not b.cab:
            sys.exit(f"{a.rutas[0]} no tiene cabecera de ejecución")
        b.tramo(a.dias, False)
    resumen([b.salida])


if __name__ == "__main__":
    main()
