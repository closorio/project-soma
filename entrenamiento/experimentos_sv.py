#!/usr/bin/env python3
"""F7.6 · medición de supervivencia real en el mundo de supervivencia (puerto 25566), con el servidor ya en marcha
(servidor-supervivencia/arrancar.sh). Reutiliza el banco de una noche (servidor-supervivencia/probar_noche.py: equipo, vigía por
RCON, reposición del terreno, registro del bot) para la matriz del plan. Fijado antes de medir (PLAN_F7_supervivencia.md, F7.6):

Políticas (un bot cada una, conectados a la vez; mismo cuerpo, con los reflejos y la regla del usuario ante un golpe):
  red     Prueba1 · modo libre con IO_POLITICA = la red de supervivencia (por defecto la oficial, politica_supervivencia_dagger3.json:
          semilla 0 de DAgger 3, decisión del usuario 2026-10-16)
  guion   Prueba2 · modo libre con IO_DECISOR=guion (bot/guion_sv.js, copia exacta de guion_sv_lote)
  vieja   Prueba3 · modo libre con IO_POLITICA = politica_habilidades.json (la red del mundo del usuario: solo sabe huir)
  quieto  Prueba4 · modo órdenes, sin decidir nada (solo los reflejos del cuerpo)
noches: cada noche, los 4 bots a la vez, cada uno en uno de los 4 puntos de mundos/supervivencia/mundo.json; de una noche a otra
  los puntos rotan (cuadrado latino: la política j va al punto (j + rotación) % 4), así que en 4 noches cada política pasa por los
  4 puntos con el mismo perfil (1 réplica por celda política × perfil × punto, la versión corta del plan). Equipo «hacha + 4 pan + 4
  tierra», salud y hambre llenas, `time set 12000` (atardecer: la noche entera dentro) y hasta las 6:29 del día siguiente, la
  muerte o --max s. Las noches alternan perfiles (recolector, supervivencia, recolector…) para que, si hay que parar, haya de los dos.
encuentros: monstruos cerca para ejercitar la regla de reacción (huir solo con más de 2 enemigos o salud < 8; acorralado se
  defiende; del creeper se aparta): de noche (18000), cada bot en su punto con un escenario invocado a su lado: «zombi» (1 zombi a
  2,5 bloques: debe defenderse), «tres_zombis» (3 a 2,5: debe huir y, de noche, refugiarse; si no puede huir, defenderse),
  «creeper» (a 4: debe apartarse) y «vida_baja» (salud 5 con /damage y 1 zombi a 2,5: debe huir). 75 s cada uno o hasta la muerte.
Métricas por bot y ejecución (las del plan): sobrevive (sí/no), vida mínima, vida perdida total, golpes recibidos, monstruos matados
(informe), segundos refugiado (muestreo de en_refugio cada 10 s), troncos, veces que comió, decisiones ante hostil a la vista y
reflejos (con su motivo) del registro del bot. Criterio principal: tasa de noches sobrevividas; secundario: vida perdida. Éxito de la
fase: red ≥ 75 % de noches sobrevividas con equipo, red ≥ guion − 10 puntos, frente a la red vieja y «quieto» como suelo; las
diferencias, con la dispersión entre puntos (pocas noches: se informa sin forzar conclusiones).
Los 4 bots no se ven como «el jugador» (jugador_prueba ninguno: jugador_dist = 1, como en el simulador; la red vieja no va hacia
otro bot) y entre dos ejecuciones se apagan los reflejos y se paran (que no siga, p. ej., refugiarse tras huir en la siguiente).
Seguridad: solo el servidor de supervivencia (RCON de «supervivencia»); para si la memoria disponible baja de 800 MB; cada bot se
cierra por su PID; al acabar cada ejecución repone el terreno de refugiarse/salir_del_refugio, mata monstruos y objetos a ≤ 64 de
los puntos, pone el día y guarda (save-all). Los muertos pasan a espectador hasta la siguiente ejecución.
Uso: experimentos_sv.py noches [--perfiles recolector,supervivencia] [--rotaciones 0,1,2,3] [--max 700] [--seguir RUTA]
     experimentos_sv.py encuentros [--escenarios zombi,tres_zombis,creeper,vida_baja] [--perfil P] [--rotacion 0-3] [--seguir RUTA]
     experimentos_sv.py resumen RUTA [RUTA …]
Resultados: servidor-supervivencia/logs/matriz-sv-AAAAMMDD-HHMM.jsonl (una línea por bot y ejecución) y «RESULTADO …» al final.
"""
import argparse, json, math, os, re, signal, subprocess, sys, time
from collections import Counter, defaultdict
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent
SV = RAIZ / "servidor-supervivencia"
sys.path.insert(0, str(SV))
import probar_noche as pn  # noqa: E402  (r, Bot, vigia, matar_cerca, reponer_terreno, memoria_mb, KIT, OW, MUNDO, FIN_HORA)

r, OW = pn.r, pn.OW
MIN_MB = 800
ETIQ = "matriz_sv"
POLITICAS = ["red", "guion", "vieja", "quieto"]
NOMBRES = {"red": ("Prueba1", 3101), "guion": ("Prueba2", 3102), "vieja": ("Prueba3", 3103), "quieto": ("Prueba4", 3104)}
RED_SV = AQUI / "politica_supervivencia_dagger3.json"  # la oficial (semilla 0 de DAgger 3; decisión del usuario 2026-10-16)
RED_VIEJA = AQUI / "politica_habilidades.json"
ESCENARIOS = {  # (monstruos a invocar: [(tipo, distancia)], daño previo con /damage)
    "zombi": ([("zombie", 2.5)], 0), "tres_zombis": ([("zombie", 2.5), ("zombie", 2.5), ("zombie", 2.5)], 0),
    "creeper": ([("creeper", 4.0)], 0), "vida_baja": ([("zombie", 2.5)], 15)}


def log(t):
    print(f"[{time.strftime('%H:%M:%S')}] {t}", flush=True)


def muertes_de(nombre):
    m = re.search(r"has (\d+) \[", r(f"scoreboard players get {nombre} {ETIQ}"))
    return int(m[1]) if m else 0


def decisiones(desde, nombre):
    """Decisiones del modo libre de este bot desde `desde` (UTC ISO), en los diarios de hoy y de ayer (la sesión cruza medianoche)."""
    decs = []
    for dia in {time.strftime("%Y%m%d"), time.strftime("%Y%m%d", time.localtime(time.time() - 86400))}:
        f = AQUI / "ejecuciones" / f"modos-supervivencia-{dia}.jsonl"
        if not f.exists():
            continue
        for l in f.read_text(errors="replace").splitlines():
            try:
                d = json.loads(l)
            except ValueError:
                continue
            if d.get("tipo") == "decision" and d.get("personaje") == nombre and d.get("t", "") >= desde:
                decs.append(d)
    return decs


def muertes_en_consola(desde_local):
    """{bot: mensaje de muerte} de la consola del servidor desde la hora local HH:MM:SS (si la sesión no cruza medianoche)."""
    out = {}
    f = SV / "logs" / "latest.log"
    if f.exists():
        for l in f.read_text(errors="replace").splitlines():
            m = re.match(r"\[(\d\d:\d\d:\d\d)\] \[Server thread/INFO\]: (Prueba\d) (was .*|drowned.*|fell.*|blew up.*|died.*|hit .*|"
                         r"tried .*|suffocated.*|went .*|burned.*|experienced.*|starved.*|withered.*)$", l)
            if m and m[1] >= desde_local:
                out[m[2]] = m[3]
    return out


def resumen_decisiones(decs):
    ante = Counter(d["habilidad"] for d in decs if (d.get("datos") or {}).get("hostil"))
    return {"n": len(decs), "usos": dict(Counter(d["habilidad"] for d in decs).most_common()),
            "ante_hostil": dict(ante), "comer": sum(d["habilidad"] == "comer" for d in decs),
            "causas": dict(Counter(f"{d['habilidad']}: {str(d.get('causa', '')).split(':')[0][:30]}" for d in decs).most_common(10))}


def reflejos_de(texto):
    hab, mot = Counter(), Counter()
    for l in texto.splitlines():
        m = re.search(r"\[reflejo\] (\w+) [^(]*\((.*)\) → (éxito|fallo)", l)
        if m:
            hab[m[1]] += 1
            mot[f"{m[1]}: {re.sub(r'[0-9.]+', '#', m[2].split(':')[0])[:40]} → {m[3]}"] += 1
    return {"reflejos": dict(hab), "motivos": dict(mot.most_common(12))}


class Sesion:
    def __init__(self, a):
        self.a, self.bots, self.procs, self.logs = a, {}, {}, {}
        ini = time.strftime("%Y%m%d-%H%M")
        self.salida = Path(a.seguir).resolve() if a.seguir else SV / "logs" / f"matriz-sv-{ini}.jsonl"
        self.hechas = set()
        if self.salida.exists():
            for l in self.salida.read_text().splitlines():
                d = json.loads(l)
                self.hechas.add(d["clave"])
        d = json.loads(pn.MUNDO.read_text())
        self.puntos, self.camp = d["puntos"], d["campamento"]

    # ---- bots ----
    def arrancar(self):
        for pol in POLITICAS:
            nombre, puerto = NOMBRES[pol]
            env = {**os.environ, "IO_SERVIDOR": "supervivencia",
                   "IO_POLITICA": str(RED_VIEJA if pol == "vieja" else Path(self.a.politica))}
            env.pop("IO_MODO", None)
            env.pop("IO_DECISOR", None)
            if pol == "guion":
                env["IO_DECISOR"] = "guion"
            ruta = SV / "logs" / f"bot-{nombre}-matriz-{time.strftime('%Y%m%d-%H%M')}.log"
            self.logs[pol] = ruta
            self.procs[pol] = subprocess.Popen(["node", "io.js", f"{nombre}:{puerto}:recolector:ordenes"], cwd=RAIZ / "bot",
                                               stdout=open(ruta, "w"), stderr=subprocess.STDOUT, env=env, start_new_session=True)
            self.bots[pol] = pn.Bot(nombre, puerto)
        for pol in POLITICAS:
            for _ in range(60):
                time.sleep(1)
                if self.procs[pol].poll() is not None:
                    raise pn.Parada(f"el bot {pol} se cerró al arrancar ({self.logs[pol].name})")
                if "ha aparecido" in self.logs[pol].read_text(errors="replace"):
                    break
            else:
                raise pn.Parada(f"el bot {pol} no apareció en 60 s")
        log("bots conectados: " + ", ".join(f"{p}={NOMBRES[p][0]}" for p in POLITICAS))

    def cerrar(self):
        for pol, p in self.procs.items():
            if p.poll() is None:
                self.bots[pol].orden("modo ordenes", 5)
                nombre = NOMBRES[pol][0]
                r(f"gamemode survival {nombre}")
                c = self.camp  # que no se desconecte dentro de un refugio que se va a rellenar
                r(f"{OW} positioned {c[0] + 2 * POLITICAS.index(pol)} 0 {c[2]} positioned over motion_blocking_no_leaves run tp {nombre} ~ ~ ~")
        time.sleep(1.5)
        for pol, p in self.procs.items():
            if p.poll() is None:
                os.kill(p.pid, signal.SIGTERM)  # solo los bots que lanzó este banco, por su PID
                try:
                    p.wait(10)
                except subprocess.TimeoutExpired:
                    os.kill(p.pid, signal.SIGKILL)

    # ---- una ejecución (noche o encuentro): preparar, vigilar, recoger, dejarlo como estaba ----
    def preparar(self, perfil, sitios, hora):
        # spawn_phantoms false (2026-10-16): los bots no duermen en cama y, tras ~1 h de noches seguidas, el insomnio acumulado
        # traía fantasmas (2 muertes en la última noche de la réplica 1); cada ejecución mide «una noche» desde cero, como el plan
        for g, v in (("keep_inventory", "false"), ("advance_time", "true"), ("spawn_monsters", "true"), ("spawn_phantoms", "false")):
            pn.gamerule(g, v)
        for pol in POLITICAS:
            b, nombre = self.bots[pol], NOMBRES[pol][0]
            b.orden("reflejos no"), b.orden("para"), b.orden(f"perfil {perfil}")  # nada de la ejecución anterior sigue en marcha
            b.orden("jugador_prueba ninguno")  # los otros bots no son «el jugador» (en el simulador jugador_dist es siempre 1)
            r(f"gamemode survival {nombre}")
            px, _, pz = sitios[pol]
            r(f"{OW} positioned {px} 0 {pz} positioned over motion_blocking_no_leaves run tp {nombre} ~ ~ ~")
        time.sleep(2)
        for pol in POLITICAS:
            nombre = NOMBRES[pol][0]
            pn.matar_cerca(sitios[pol])
            r(f"clear {nombre}")
            for it, n in pn.KIT:
                r(f"give {nombre} minecraft:{it} {n}")
            r(f"effect clear {nombre}")
            r(f"effect give {nombre} minecraft:instant_health 1 10 true")
            r(f"effect give {nombre} minecraft:saturation 1 20 true")
        r(f"scoreboard objectives remove {ETIQ}")
        r(f"scoreboard objectives add {ETIQ} deathCount")
        r(f"time set {hora}")
        time.sleep(2)

    def vigilar(self, max_s, fin_al_amanecer, hora0):
        t0, est = time.time(), {}
        for pol in POLITICAS:
            s, p, _ = pn.vigia(NOMBRES[pol][0])
            est[pol] = {"salud_min": s or 20, "perdida": 0.0, "s_prev": s or 20, "muerte": None, "refugio": [], "hostil": 0, "pos0": p}
        medianoche, ultimo_muestreo = False, -99
        while time.time() - t0 < max_s:
            time.sleep(1)
            mb = pn.memoria_mb()
            if mb < MIN_MB:
                raise pn.Parada(f"solo quedan {mb} MB de memoria disponible (mínimo {MIN_MB}): paro")
            t = round(time.time() - t0)
            h = re.search(r"(\d+)", r("time query daytime"))
            h = int(h[1]) if h else None
            muestreo = t - ultimo_muestreo >= 10
            for pol in POLITICAS:
                e, nombre = est[pol], NOMBRES[pol][0]
                if e["muerte"]:
                    continue
                if self.procs[pol].poll() is not None:
                    raise pn.Parada(f"el bot {pol} se cerró")
                s, p, _ = pn.vigia(nombre)
                if s is not None:
                    e["perdida"] += max(0.0, e["s_prev"] - s)
                    e["s_prev"], e["salud_min"] = s, min(e["salud_min"], s)
                if (s is not None and s <= 0) or muertes_de(nombre):
                    e["muerte"] = {"t": t, "hora": h, "pos": p}
                    e["salud_min"] = 0
                    log(f"MUERTO {pol} ({nombre}) a los {t} s (hora {h})")
                    self.bots[pol].orden("modo ordenes", 5)
                    time.sleep(1)
                    r(f"gamemode spectator {nombre}")
                    continue
                if muestreo:
                    d = self.bots[pol].json("obs_sv", 10).get("datos") or {}
                    e["refugio"].append(bool(d.get("en_refugio")))
                    e["hostil"] += bool(d.get("hostil"))
            if muestreo:
                ultimo_muestreo = t
            if t % 60 == 0:
                log(f"t {t} s · hora {h} · " + " · ".join(f"{p} {'†' if est[p]['muerte'] else round(est[p]['s_prev'])}" for p in POLITICAS)
                    + f" · {mb} MB")
            if all(est[p]["muerte"] for p in POLITICAS):
                break
            if h is not None and h < hora0:
                medianoche = True
            if fin_al_amanecer and medianoche and h is not None and h >= pn.FIN_HORA:
                log(f"amaneció (hora {h}) a los {t} s")
                break
        return est, round(time.time() - t0), medianoche

    def recoger_y_limpiar(self, sitios, est, offsets, desde):
        filas = {}
        for pol in POLITICAS:  # que no siga ningún reflejo (p. ej. refugiarse tras huir) en la ejecución siguiente
            b = self.bots[pol]
            b.orden("reflejos no"), b.orden("para")
        time.sleep(4)  # que acabe y se escriba el reflejo en curso (un ataque dura 2-3 s)
        for pol in POLITICAS:
            b, nombre = self.bots[pol], NOMBRES[pol][0]
            fin = b.json("obs_sv").get("datos") or {}
            inf = b.json("resumen")  # desde la marca de ejecucion(): solo lo de esta ejecución («todo» acumulaba la sesión)
            ev = Counter(e.get("tipo") for e in inf.get("eventos", []))
            texto = self.logs[pol].read_text(errors="replace")[offsets[pol]:]
            filas[pol] = {"final": {k: fin.get(k) for k in ("salud", "hambre", "comida", "troncos", "arma", "tierra", "en_refugio")},
                          "eventos": dict(ev), "golpes": ev.get("golpe", 0),
                          "matados": sum(1 for l in texto.splitlines() if re.search(r"atacar .*→ éxito: (muerto|matado)", l)),
                          "decisiones": resumen_decisiones(decisiones(desde, nombre)), **reflejos_de(texto),
                          "habilidades_informe": (inf.get("hecho") or {}).get("habilidades")}
            _, pfin, _ = pn.vigia(nombre)
            filas[pol]["pos_fin"] = pfin
        # dejarlo como estaba: vivos al campamento (no desconectarse en un pozo), terreno, monstruos, día
        for pol in POLITICAS:
            nombre = NOMBRES[pol][0]
            r(f"gamemode survival {nombre}")
            c = self.camp
            r(f"{OW} positioned {c[0] + 2 * POLITICAS.index(pol)} 0 {c[2]} positioned over motion_blocking_no_leaves run tp {nombre} ~ ~ ~")
        time.sleep(1.5)
        repuestos = 0
        for pol in POLITICAS:
            hechos = pn.reponer_terreno(self.logs[pol])
            repuestos += len(hechos)
            fallos = [x for x in hechos if len(x) > 4]
            if fallos:
                log(f"terreno {pol}: {len(fallos)} casillas sin reponer: {fallos[:3]}")
        for p in list(sitios.values()) + [f["pos_fin"] for f in filas.values() if f.get("pos_fin")]:
            pn.matar_cerca(p)
        r("time set 1000")
        r(f"scoreboard objectives remove {ETIQ}")
        r("save-all")
        return filas, repuestos

    def ejecucion(self, clave, tipo, perfil, sitios, hora, max_s, fin_al_amanecer, antes=None):
        offsets = {p: self.logs[p].stat().st_size for p in POLITICAS}
        self.preparar(perfil, sitios, hora)
        for pol in POLITICAS:  # marca de lectura del informe: golpes y eventos se cuentan desde aquí (con el /damage de vida_baja)
            self.bots[pol].json("resumen", 10)
        if antes:
            antes()
        desde, desde_local = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime()), time.strftime("%H:%M:%S")
        for pol in POLITICAS:
            self.bots[pol].orden("reflejos si")
        for pol in ("red", "guion", "vieja"):
            self.bots[pol].orden("modo libre")
        log(f"{clave}: en marcha ({perfil}; " + ", ".join(f"{p}→{sitios[p][:1] + sitios[p][2:]}" for p in POLITICAS) + ")")
        try:
            est, segundos, medianoche = self.vigilar(max_s, fin_al_amanecer, hora)
        finally:
            filas, repuestos = self.recoger_y_limpiar(sitios, locals().get("est") or {}, offsets, desde)
        causas = muertes_en_consola(desde_local)
        for pol in POLITICAS:
            e = est[pol]
            fila = {"causa_muerte": causas.get(NOMBRES[pol][0]), "clave": f"{clave}|{pol}", "tipo": tipo, "ejecucion": clave, "politica": pol, "perfil": perfil, "punto": sitios[pol],
                    "hora_salida": hora, "segundos": segundos, "paso_medianoche": medianoche,
                    "sobrevive": e["muerte"] is None and (medianoche or not fin_al_amanecer), "muerte": e["muerte"],
                    "salud_min": e["salud_min"], "vida_perdida": round(e["perdida"], 1),
                    "s_refugiado": 10 * sum(e["refugio"]), "muestras_hostil": e["hostil"], **filas[pol],
                    "terreno_repuesto": repuestos, "eventos_de": "esta ejecucion", "fecha": time.strftime("%Y-%m-%d %H:%M:%S")}
            with open(self.salida, "a") as f:
                f.write(json.dumps(fila, ensure_ascii=False) + "\n")
            self.hechas.add(fila["clave"])
            log(f"  {pol:6s} {'vive' if fila['sobrevive'] else 'MUERE'} · salud mín {fila['salud_min']} · perdida {fila['vida_perdida']} · "
                f"golpes {fila['golpes']} · refugiado {fila['s_refugiado']} s · reflejos {fila['reflejos']} · usos {fila['decisiones']['usos']}")

    # ---- las dos partes ----
    def noches(self):
        perfiles, rots = self.a.perfiles.split(","), [int(x) for x in self.a.rotaciones.split(",")]
        orden = [(rot, p) for rot in rots for p in perfiles]  # recolector, supervivencia, recolector… (alternan)
        for rot, perfil in orden:
            clave = f"noche|{perfil}|rot{rot}"
            if all(f"{clave}|{p}" in self.hechas for p in POLITICAS):
                log(f"{clave}: ya hecha")
                continue
            sitios = {pol: self.puntos[(j + rot) % 4] for j, pol in enumerate(POLITICAS)}
            self.ejecucion(clave, "noche", perfil, sitios, 12000, self.a.max, True)

    def encuentros(self):
        sitios = {pol: self.puntos[j] for j, pol in enumerate(POLITICAS)}
        rot = self.a.rotacion  # sin rotación cada escenario pone a cada política siempre en el mismo punto (k): se confunden
        for k, esc in enumerate(self.a.escenarios.split(",")):
            clave = f"encuentro|{esc}" + (f"|rot{rot}" if rot else "")
            if all(f"{clave}|{p}" in self.hechas for p in POLITICAS):
                log(f"{clave}: ya hecho")
                continue
            monstruos, dano = ESCENARIOS[esc]
            sit = {pol: self.puntos[(j + k + rot) % 4] for j, pol in enumerate(POLITICAS)}

            def invocar(monstruos=monstruos, dano=dano, sit=sit):
                for pol in POLITICAS:
                    nombre = NOMBRES[pol][0]
                    if dano:
                        r(f"effect clear {nombre}")
                        r(f"damage {nombre} {dano} minecraft:generic")
                    for i, (tipo, d) in enumerate(monstruos):
                        a = 2 * math.pi * i / max(1, len(monstruos)) + 0.3
                        r(f"execute at {nombre} run summon minecraft:{tipo} ~{d * math.cos(a):.1f} ~ ~{d * math.sin(a):.1f}")
            previo = pn.gamerule("mob_griefing") if esc == "creeper" else None  # que el creeper invocado no rompa el terreno
            if previo in ("true", "false"):
                pn.gamerule("mob_griefing", "false")
            try:
                self.ejecucion(clave, "encuentro", self.a.perfil, sit, 18000, self.a.max_encuentro, False, antes=invocar)
            finally:
                if previo in ("true", "false"):
                    pn.gamerule("mob_griefing", previo)


def resumen(rutas):
    filas = [json.loads(l) for ruta in rutas for l in Path(ruta).read_text().splitlines()]
    out = {}
    for tipo in ("noche", "encuentro"):
        fs = [f for f in filas if f["tipo"] == tipo]
        if not fs:
            continue
        print(f"=== {tipo}s ({len(fs)} ejecuciones de bot)")
        por = defaultdict(list)
        for f in fs:
            por[(f["perfil"] if tipo == "noche" else f"{f['ejecucion'].split('|')[1]}/{f['perfil'][:4]}", f["politica"])].append(f)
        for (grupo, pol), g in sorted(por.items(), key=lambda x: (x[0][0], POLITICAS.index(x[0][1]))):
            viv = sum(f["sobrevive"] for f in g)
            refl = sum((Counter(f["reflejos"]) for f in g), Counter())
            mot = sum((Counter(f["motivos"]) for f in g), Counter())
            usos = sum((Counter(f["decisiones"]["ante_hostil"]) for f in g), Counter())
            out[f"{tipo}|{grupo}|{pol}"] = {"n": len(g), "sobreviven": viv, "vida_perdida_media": round(sum(f["vida_perdida"] for f in g) / len(g), 1),
                                             "golpes": sum(f["golpes"] for f in g), "s_refugiado_medio": round(sum(f["s_refugiado"] for f in g) / len(g)),
                                             "troncos_fin_medio": round(sum((f["final"].get("troncos") or 0) for f in g) / len(g), 1),
                                             "reflejos": dict(refl), "motivos": dict(mot.most_common(6)), "decisiones_ante_hostil": dict(usos)}
            o = out[f"{tipo}|{grupo}|{pol}"]
            print(f"{grupo:13s} {pol:6s} sobreviven {viv}/{len(g)} · vida perdida media {o['vida_perdida_media']} · golpes {o['golpes']} · "
                  f"refugiado {o['s_refugiado_medio']} s · troncos {o['troncos_fin_medio']} · reflejos {o['reflejos']} · ante hostil {o['decisiones_ante_hostil']}")
            if tipo == "encuentro":
                print(f"{'':20s} motivos {o['motivos']}")
    noches = [f for f in filas if f["tipo"] == "noche"]
    if noches:
        tasa = {pol: (sum(f["sobrevive"] for f in noches if f["politica"] == pol), sum(1 for f in noches if f["politica"] == pol)) for pol in POLITICAS}
        print("tasa de noches sobrevividas: " + " · ".join(f"{p} {v}/{n}" for p, (v, n) in tasa.items() if n))
        v, n = tasa["red"]
        vg, ng = tasa["guion"]
        if n:
            print(f"  {'PASA ' if v / n >= 0.75 else 'FALLA'} red ≥ 75 % de noches sobrevividas con equipo ({100 * v / n:.0f} %)")
        if n and ng:
            print(f"  {'PASA ' if v / n >= vg / ng - 0.10 else 'FALLA'} red ≥ guion − 10 puntos ({100 * v / n:.0f} % frente a {100 * vg / ng:.0f} %)")
    print("RESULTADO matriz: " + json.dumps(out, ensure_ascii=False))
    return out


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("parte", choices=["noches", "encuentros", "resumen"])
    ap.add_argument("rutas", nargs="*")
    ap.add_argument("--politica", default=str(RED_SV))
    ap.add_argument("--perfiles", default="recolector,supervivencia")
    ap.add_argument("--perfil", default="recolector", help="perfil de los encuentros")
    ap.add_argument("--rotaciones", default="0,1,2,3")
    ap.add_argument("--escenarios", default=",".join(ESCENARIOS))
    ap.add_argument("--max", type=float, default=700)
    ap.add_argument("--max-encuentro", type=float, default=75)
    ap.add_argument("--rotacion", type=int, default=0, help="encuentros: desplaza los puntos de las políticas (0-3)")
    ap.add_argument("--seguir", default=None)
    a = ap.parse_args()
    pol = Path(a.politica)
    a.politica = str(pol.resolve() if pol.exists() else AQUI / pol)
    if a.parte == "resumen":
        resumen(a.rutas)
        return
    if "players" not in r("list"):
        sys.exit("el servidor de supervivencia no responde por RCON (servidor-supervivencia/arrancar.sh)")
    if pn.memoria_mb() < 2 * MIN_MB:
        sys.exit(f"solo hay {pn.memoria_mb()} MB disponibles: no empiezo")
    (SV / "logs").mkdir(exist_ok=True)
    s = Sesion(a)
    log(f"resultados en {s.salida.relative_to(RAIZ)} · política de supervivencia {Path(a.politica).name}")
    try:
        s.arrancar()
        getattr(s, a.parte)()
    except pn.Parada as e:
        log("PARADA: " + str(e))
    finally:
        s.cerrar()
        r("save-all")
    if s.salida.exists():
        resumen([s.salida])


if __name__ == "__main__":
    main()
