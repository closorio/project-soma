"""Entorno de F2: el modelo elige HABILIDADES del bot (bot/habilidades/), no pasos sueltos.

Semi-MDP abstracto en un plano 2D (bloques): no simula bloques, sino el resultado de cada habilidad
(éxito/fallo, causa, duración), con probabilidades y tiempos calibrados con lo medido en Minecraft
(probar_habilidades.py → habilidades_medidas.json). Así la brecha simulador→mundo se mide habilidad a habilidad.

Observación (25 números en [0, 1], ver OBS): lo que el bot puede calcular antes de decidir (17), su perfil (4) y el compañero (4).
Acciones (6): HABILIDADES. Cada paso dura lo que tarda la habilidad (mín. 1 s de decisión).
Recompensa según el perfil (F3, perfiles/*.json): sus pesos madera/compañía/seguridad/tiempo entran también en la observación
(divididos por perfiles/_escala.json), así una sola red sirve para todos los perfiles. PERFIL_BASE = recolector.
Varios personajes (fase C): MundoHabilidades(agentes=N) pone N agentes en el mismo mundo (árboles, objetos y jugador compartidos),
cada uno con su perfil, su reloj y su amenaza; decide siempre el que va más atrasado (`turno`) y step() le aplica la habilidad.
Entradas del compañero más cercano (otro personaje): a qué distancia está de mí y de mi árbol (su posición relativa a mí y a mi
objetivo) y si su objetivo (el árbol al que va o que tiene delante) es mi árbol; más la distancia al árbol más cercano que no es
objetivo de ningún compañero, al que va `ir_a_otro_arbol`. Con un solo agente todo es como antes (mismas tiradas del azar).
"""
import json
from pathlib import Path

import numpy as np

HABILIDADES = ["ir_a_arbol", "picar_tronco", "recoger", "ir_a_jugador", "huir", "ir_a_otro_arbol"]
PESOS = ["madera", "compania", "seguridad", "tiempo"]
COMPANERO = ["companero_dist", "companero_arbol_dist", "companero_mismo_arbol", "otro_arbol_dist"]
OBS = ["arbol_dist", "arbol_enfrente", "tronco_al_alcance", "objetos_suelo", "troncos_inv", "jugador_dist",
       "amenaza_dist", "noche", "salud", "tiempo_restante"] + ["previa_" + h for h in HABILIDADES] + ["previa_exito"] + \
      ["perfil_" + k for k in PESOS] + COMPANERO
I = {n: k for k, n in enumerate(OBS)}  # índice de cada entrada por su nombre (el guion no depende del orden)
PERFIL_BASE = {"madera": 1.0, "compania": 0.0, "seguridad": 1.0, "tiempo": 0.002}
DIR_PERFILES = Path(__file__).resolve().parent.parent / "perfiles"
ESCALA = {k: v for k, v in json.loads((DIR_PERFILES / "_escala.json").read_text()).items() if k in PESOS}
DIA, NOCHE = 1200.0, (0.52, 0.98)  # s por día de Minecraft; fracción del ciclo que es noche (12500-23500 ticks)
VISTA, RADIO_OBJ, META, VEL = 48.0, 8.0, 10, 4.3  # vista de troncos, radio de recoger, troncos de referencia, bloques/s andando

# Calibración por defecto; calibrar() la sustituye con lo medido. p = éxito cuando la precondición se cumple.
CAL = {"ir_a_arbol": {"p": 0.85, "s_paso": 0.6, "s_fallo": 30.0}, "picar_tronco": {"p": 0.95, "s": 3.1},
       "recoger": {"p": 0.8, "s": 2.0}, "ir_a_jugador": {"p": 0.9, "s": 6.0}, "huir": {"p": 0.75, "s": 5.0},
       "auto": 0.5, "obj_inalcanzable": 0.15}  # troncos que entran solos al picar; objetos que caen donde no se llega
CAL["ir_a_otro_arbol"] = CAL["ir_a_arbol"]  # el mismo andar; calibrar() usa lo medido de ir_a_arbol si no hay medidas propias
# Dos personajes delante del mismo árbol se estorban (pican el mismo bloque, se empujan): cada compañero delante multiplica la
# probabilidad de picar por ESTORBO. Supuesto sin medir; la fase D lo mide en Minecraft.
ESTORBO = 0.75
# Causas que solo dicen que no había nada que hacer: no cuentan para p ni para el tiempo.
PREVIO = 4  # peso (en pruebas) del valor por defecto al calibrar p
TRIVIALES = {"ir_a_arbol": ("sin árbol",), "picar_tronco": ("sin tronco al alcance", "tronco fuera de alcance"),
             "recoger": ("nada que recoger", "inventario lleno"), "ir_a_jugador": ("no veo", "ya estaba"), "huir": ("sin amenaza",),
             "ir_a_otro_arbol": ("sin árbol",)}


def cargar_perfiles():
    """{nombre: pesos} de perfiles/*.json (sin los que empiezan por «_»)."""
    return {f.stem: {**PERFIL_BASE, **json.loads(f.read_text())["pesos"]}
            for f in sorted(DIR_PERFILES.glob("*.json")) if not f.stem.startswith("_")}


def vector_perfil(pesos):
    """Las 4 entradas perfil_* de la observación: cada peso dividido por su escala, en [0, 1]."""
    return [min(1.0, max(0.0, pesos[k] / ESCALA[k])) for k in PESOS]


def calibrar(ruta=Path(__file__).with_name("habilidades_medidas.json")):
    cal = {h: dict(v) if isinstance(v, dict) else v for h, v in CAL.items()}
    try:
        medidas = json.loads(ruta.read_text())["habilidades"]
    except (OSError, ValueError, KeyError):
        return cal
    if medidas_auto := json.loads(ruta.read_text()).get("auto"):
        cal["auto"] = medidas_auto
    medidos = set()
    for h, m in medidas.items():
        ms = [x for x in m.get("muestras", []) if h in cal and not x[1].startswith(TRIVIALES[h])]
        if len(ms) < 3:
            continue
        medidos.add(h)
        cal[h]["p"] = (sum(x[0] for x in ms) + PREVIO * CAL[h]["p"]) / (len(ms) + PREVIO)  # pocas muestras: no fiarse de un 8/8
        ok = [x for x in ms if x[0]]
        if h == "ir_a_arbol":
            con_pasos = [x[2] / x[3] for x in ok if x[3]]
            if con_pasos: cal[h]["s_paso"] = float(np.median(con_pasos))
            if len(ms) > len(ok): cal[h]["s_fallo"] = float(np.median([x[2] for x in ms if not x[0]]))
        elif ok:
            cal[h]["s"] = float(np.median([x[2] for x in ok]))
    if "ir_a_otro_arbol" not in medidos:
        cal["ir_a_otro_arbol"] = cal["ir_a_arbol"]
    return cal


# Estado de cada agente. El que decide (turno) lo tiene en self.<clave>; los demás, en self.agentes[k] (lo guarda _cargar).
AGENTE = ("bot", "enfrente", "objetivo", "inv", "salud", "amenaza", "previa", "previa_ok", "t", "decisiones", "t_cerca", "huidas",
          "perfil", "vperfil", "hecho", "conflictos", "estorbos")


class MundoHabilidades:
    def __init__(self, semilla=None, perfil=None, pacifico=True, duracion=300.0, cal=None, agentes=1):
        self.rng = np.random.default_rng(semilla)
        self.n = agentes
        self.poner_perfil(perfil)
        self.pacifico, self.T = pacifico, duracion
        self.cal = cal or calibrar()
        self._habilidades = [self._ir_a_arbol, self._picar, self._recoger, self._ir_a_jugador, self._huir,
                             lambda c: self._ir_a_arbol(c, otro=True)]

    def poner_perfil(self, perfil=None):
        """perfil: nombre de perfiles/*.json o dict de pesos (lo que falte, de PERFIL_BASE), o una lista con uno por agente
        (fija también cuántos agentes hay). Vale para el siguiente reset()."""
        lista = perfil if isinstance(perfil, list) else [perfil]
        todos = cargar_perfiles()
        self.perfiles = [{**PERFIL_BASE, **(todos[p] if isinstance(p, str) else (p or {}))} for p in lista]
        if isinstance(perfil, list):
            self.n = len(lista)
        self.perfil = self.perfiles[0]
        self.vperfil = vector_perfil(self.perfil)

    # ---- estado ----
    def _guardar(self):
        return {k: getattr(self, k) for k in AGENTE}

    def _cargar(self, j):
        """Pasa el turno al agente j: guarda el estado del que decidía y pone el de j en self."""
        self.agentes[self.turno] = self._guardar()
        self.turno = j
        for k, v in self.agentes[j].items():
            setattr(self, k, v)

    def _companeros(self):
        """Estado de los otros agentes que siguen en el episodio."""
        return [self.agentes[k] for k in range(self.n) if k != self.turno and not self.agentes[k]["hecho"]]

    def _objetivos_ajenos(self):
        return {c["objetivo"] for c in self._companeros() if c["objetivo"] is not None}

    def resultados(self):
        """Estado final de cada agente (troncos, salud, tiempo junto al jugador…), en el orden de los agentes."""
        self.agentes[self.turno] = self._guardar()
        return self.agentes

    def reset(self):
        r = self.rng
        self.t, self.decisiones, self.hora0 = 0.0, 0, r.uniform(0, DIA)
        self.t_mundo, self.turno, self.hecho, self.conflictos, self.estorbos, self.objetivo = 0.0, 0, False, 0, 0, None
        self.perfil, self.vperfil = self.perfiles[0], vector_perfil(self.perfiles[0])
        self.bot = np.zeros(2)
        n = int(r.integers(2, 13))  # bastantes árboles: que limite el tiempo, no la madera (si no, el azar acaba igual)
        ang, dist = r.uniform(0, 2 * np.pi, n), r.uniform(4, 60, n)
        self.arboles = [{"pos": np.array([d * np.cos(a), d * np.sin(a)]), "k": int(r.integers(3, 6)),
                         "restos": bool(r.random() < 0.3), "agotado": False, "alcanzable": bool(r.random() > 0.15)}
                        for a, d in zip(ang, dist)]
        self.enfrente = None  # índice del árbol que tiene delante
        self.objetos = []  # [pos, edad, alcanzable]
        self.inv, self.salud = 0, 20.0
        a = r.uniform(0, 2 * np.pi)
        self.jugador = r.uniform(2, 70) * np.array([np.cos(a), np.sin(a)])
        self.amenaza = None
        self.previa, self.previa_ok = -1, 0
        self.t_cerca, self.huidas = 0.0, 0  # para comparar perfiles: segundos a ≤ 6 del jugador, huidas con éxito
        # La mitad de los episodios empiezan delante de un árbol, como en el banco real (tp al arbolado). Sin esto el perfil
        # cooperativo casi nunca se veía con un tronco delante y el jugador lejos, y en Minecraft seguía picando (86 % de acierto).
        alcanzables = [i for i, a in enumerate(self.arboles) if a["alcanzable"]]
        if alcanzables and r.random() < 0.5:
            self.enfrente = alcanzables[int(r.integers(len(alcanzables)))]
            self.bot = self.arboles[self.enfrente]["pos"] + np.array([1.0, 0.0])
        self.objetivo = self.enfrente
        self.agentes = [self._guardar()]
        # Con varios agentes, más árboles (los de un mundo más por cada agente): en Minecraft el arbolado da para varios a la vez,
        # y sin esto el simulador mide la escasez y no si se estorban.
        for _ in range(1, self.n):
            m = int(r.integers(2, 13))
            ang, dist = r.uniform(0, 2 * np.pi, m), r.uniform(4, 60, m)
            self.arboles += [{"pos": np.array([d * np.cos(a), d * np.sin(a)]), "k": int(r.integers(3, 6)),
                              "restos": bool(r.random() < 0.3), "agotado": False, "alcanzable": bool(r.random() > 0.15)}
                             for a, d in zip(ang, dist)]
        alcanzables = [i for i, a in enumerate(self.arboles) if a["alcanzable"]]
        # Los demás agentes: la mitad junto al primero (como en el banco de varios personajes, todos al mismo punto: así se ven
        # yendo al mismo árbol); el resto, delante de un árbol cualquiera o en un punto al azar del arbolado.
        for j in range(1, self.n):
            perfil = self.perfiles[j % len(self.perfiles)]
            ag = {**self.agentes[0], "perfil": perfil, "vperfil": vector_perfil(perfil), "enfrente": None, "objetivo": None}
            u = r.random()
            if u < 0.5:
                a = r.uniform(0, 2 * np.pi)
                ag["bot"] = self.agentes[0]["bot"] + r.uniform(1, 4) * np.array([np.cos(a), np.sin(a)])
            elif u < 0.75 and alcanzables:
                ag["enfrente"] = ag["objetivo"] = alcanzables[int(r.integers(len(alcanzables)))]
                ag["bot"] = self.arboles[ag["enfrente"]]["pos"] + np.array([1.0, 0.0])
            else:
                a = r.uniform(0, 2 * np.pi)
                ag["bot"] = r.uniform(0, 30) * np.array([np.cos(a), np.sin(a)])
            self.agentes.append(ag)
        return self.obs()

    def _d(self, p):
        return float(np.linalg.norm(p - self.bot))

    def _noche(self):
        f = ((self.hora0 + self.t) % DIA) / DIA
        return NOCHE[0] <= f <= NOCHE[1]

    def _visibles(self):
        """Árboles que vería ir_a_arbol (en vista, no agotados), del más cercano al más lejano."""
        v = [i for i, a in enumerate(self.arboles) if self._d(a["pos"]) <= VISTA and not a["agotado"] and (a["k"] or a["restos"])]
        return sorted(v, key=lambda i: self._d(self.arboles[i]["pos"]))

    def obs(self):
        vis = self._visibles()
        a = self.arboles[self.enfrente] if self.enfrente is not None else None
        cerca = sum(self._d(ob[0]) <= RADIO_OBJ for ob in self.objetos)
        dj = self._d(self.jugador)
        o = [min(self._d(self.arboles[vis[0]]["pos"]), VISTA) / VISTA if vis else 1.0,
             float(a is not None), float(a is not None and a["k"] > 0), min(cerca, 4) / 4, min(self.inv, META) / META,
             min(dj, VISTA) / VISTA, min(self._d(self.amenaza), 16) / 16 if self.amenaza is not None else 1.0,
             float(self._noche()), self.salud / 20, max(0.0, self.T - self.t) / self.T]
        o += [float(k == self.previa) for k in range(len(HABILIDADES))] + [float(self.previa_ok)] + self.vperfil
        # compañero más cercano: distancia a mí y a mi árbol, y si su objetivo es mi árbol; árbol más cercano que nadie más quiere
        comp = self._companeros()
        cj = min(comp, key=lambda c: self._d(c["bot"])) if comp else None
        mio = vis[0] if vis else None
        ajenos = self._objetivos_ajenos()
        otro = next((i for i in vis if i not in ajenos), None)
        o += [min(self._d(cj["bot"]), VISTA) / VISTA if cj else 1.0,
              min(float(np.linalg.norm(cj["bot"] - self.arboles[mio]["pos"])), VISTA) / VISTA if cj and mio is not None else 1.0,
              float(cj is not None and mio is not None and cj["objetivo"] == mio),
              min(self._d(self.arboles[otro]["pos"]), VISTA) / VISTA if otro is not None else 1.0]
        return np.array(o, dtype=np.float32)

    def _mover(self, destino, fraccion=1.0):
        destino = self.bot + (destino - self.bot) * fraccion
        if self._d(destino) > 0.5:
            self.enfrente = self.objetivo = None
        self.bot = destino

    # ---- habilidades: devuelven (éxito, causa, segundos, troncos ganados) ----
    def _ir_a_arbol(self, c, otro=False):
        """ir_a_arbol: al árbol alcanzable más cercano; ir_a_otro_arbol (otro=True): al más cercano que no sea el objetivo de
        ningún compañero (con un solo agente, lo mismo)."""
        vis = self._visibles()
        if otro:
            ajenos = self._objetivos_ajenos()
            vis = [j for j in vis if j not in ajenos]
        for j in vis:  # el bot comprueba el camino a pie y descarta (y recuerda) los inalcanzables, del más cercano en adelante
            if self.arboles[j]["alcanzable"]:
                break
            self.arboles[j]["agotado"] = True
        vis = [j for j in vis if self.arboles[j]["alcanzable"]]
        if not vis:
            return False, "sin árbol", 0.5, 0
        i = vis[0]
        self.conflictos += i in self._objetivos_ajenos()  # va al árbol de un compañero
        if self.enfrente == i:
            return True, "árbol enfrente", 0.2, 0
        d = self._d(self.arboles[i]["pos"])
        p = c["p"] ** (d / 20)  # medido a 12-30 bloques: más lejos, más fácil atascarse
        if self.rng.random() < p:
            dirn = (self.bot - self.arboles[i]["pos"]) / max(d, 1e-6)
            self._mover(self.arboles[i]["pos"] + dirn)
            self.enfrente = self.objetivo = i
            return True, "árbol enfrente", c["s_paso"] * max(1.0, 1.3 * d), 0
        self._mover(self.arboles[i]["pos"], self.rng.uniform(0.2, 0.8))
        self.objetivo = i  # sigue queriendo ir: hasta su siguiente decisión, los compañeros lo ven como su objetivo
        return False, "bloqueado", c["s_fallo"], 0

    def _picar(self, c):
        if self.enfrente is None:
            return False, "sin tronco al alcance", 0.2, 0
        a = self.arboles[self.enfrente]
        if a["k"] == 0:  # solo quedan restos altos: el bot marca la columna y ir_a_arbol la evita
            a["agotado"], self.enfrente = True, None
            return False, "tronco fuera de alcance" if a["restos"] else "sin tronco al alcance", 0.2, 0  # lo agotó un compañero
        juntos = sum(k["enfrente"] == self.enfrente for k in self._companeros())
        if self.rng.random() >= c["p"] * ESTORBO ** juntos:
            self.estorbos += juntos > 0
            return False, "no se rompió", c["s"] + 3, 0
        a["k"] -= 1
        if a["k"] == 0 and not a["restos"]:
            a["agotado"], self.enfrente = True, None
        if self.rng.random() < self.cal["auto"]:
            return True, "picado", c["s"], 1
        self.objetos.append([a["pos"] + self.rng.normal(0, 1.0, 2), 0.0, self.rng.random() >= self.cal["obj_inalcanzable"]])
        return True, "picado", c["s"], 0

    def _recoger(self, c):
        cerca = [o for o in self.objetos if self._d(o[0]) <= RADIO_OBJ]
        if not cerca:
            return False, "nada que recoger", 0.2, 0
        cogidos = [o for o in cerca if o[2] and self.rng.random() < c["p"]]  # sobre hojas o tras el agua: nunca
        self.objetos = [o for o in self.objetos if not any(o is x for x in cogidos)]
        if cogidos:
            self._mover(cogidos[-1][0])
        return bool(cogidos), "recogido" if cogidos else "no llegó", c["s"] + 0.5 * len(cerca), len(cogidos)

    def _ir_a_jugador(self, c):
        d = self._d(self.jugador)
        if d > VISTA:
            return False, "no veo", 0.1, 0
        if d <= 3:
            return True, "ya estaba", 0.1, 0
        if self.rng.random() < c["p"]:
            self._mover(self.jugador, 1 - 2.5 / d)
            return True, "llegué", 1 + d / VEL, 0
        self._mover(self.jugador, self.rng.uniform(0, 0.6))
        return False, "sin camino", min(10 + d, 90), 0

    def _huir(self, c):
        if self.amenaza is None or self._d(self.amenaza) >= 16:
            return True, "sin amenaza", 0.1, 0
        lejos = self.bot - self.amenaza
        lejos = lejos / max(np.linalg.norm(lejos), 1e-6)
        if self.rng.random() < c["p"]:
            self._mover(self.amenaza + lejos * 18)
            if self.rng.random() < 0.5:
                self.amenaza = None  # perdió el rastro
            return True, "a salvo", c["s"], 0
        self._mover(self.bot + lejos * self.rng.uniform(0, 4))
        return False, "sin camino", 0.3, 0

    # ---- mundo ----
    def _avanzar(self, dt):
        """El resto del mundo durante dt segundos. Devuelve la salud perdida."""
        r, perdida = self.rng, 0.0
        self.t += dt
        dm = max(0.0, self.t - self.t_mundo)  # lo compartido avanza con el reloj del agente más adelantado (con uno solo, dt)
        self.t_mundo += dm
        self.jugador = self.jugador + r.normal(0, 0.7 * np.sqrt(dm), 2)  # el jugador deambula
        self.objetos = [[p, e + dm, ok] for p, e, ok in self.objetos if e + dm < 300]  # desaparecen a los 5 min
        if not self.pacifico and self._noche():
            if self.amenaza is None and r.random() < 1 - np.exp(-dt / 120):  # ~1 hostil cada 2 min de noche
                a = r.uniform(0, 2 * np.pi)
                self.amenaza = self.bot + r.uniform(10, 24) * np.array([np.cos(a), np.sin(a)])
        elif self.amenaza is not None and not self._noche():
            self.amenaza = None  # se quema al amanecer
        if self.amenaza is not None and self._d(self.amenaza) > 32:
            self.amenaza = None  # demasiado lejos: deja de perseguir
        if self.amenaza is not None:  # se acerca a 1 bloque/s; cuerpo a cuerpo quita ~1 de vida por segundo
            d = self._d(self.amenaza)
            self.amenaza = self.amenaza + (self.bot - self.amenaza) / max(d, 1e-6) * max(min(d - 1.5, dt), 0)
            perdida = min(self.salud, max(dt - max(d - 2, 0), 0))
        else:
            self.salud = min(20.0, self.salud + dt / 4)  # regeneración con el hambre llena
        self.salud -= perdida
        return perdida

    def step(self, a):
        """Aplica la habilidad `a` al agente que tiene el turno. Devuelve (observación del agente que decide ahora, recompensa del
        que actuó, si el episodio terminó para todos, info con «agente» y «fin», si terminó para el que actuó)."""
        h = HABILIDADES[a]
        self.objetivo = self.enfrente  # el objetivo de un ir_a_arbol que falló dura hasta su siguiente decisión
        d0 = self._d(self.amenaza) if self.amenaza is not None else None
        exito, causa, s, ganados = self._habilidades[a](self.cal[h])
        dt = max(1.0, s)
        if d0 is not None and h != "huir" and d0 - 6 < dt:  # un hostil a ≤ 6 bloques interrumpe la habilidad
            dt, exito, causa, ganados = max(1.0, d0 - 6), False, "amenaza", 0
        perdida = self._avanzar(dt)
        self.inv += ganados
        self.decisiones += 1
        self.previa, self.previa_ok = a, int(exito)
        w = self.perfil
        cerca_jugador = self._d(self.jugador) <= 6
        self.t_cerca += dt * cerca_jugador
        self.huidas += causa == "a salvo"
        r = w["madera"] * ganados - w["tiempo"] * dt - w["seguridad"] * 0.05 * perdida + w["compania"] * 0.01 * dt * cerca_jugador
        hecho = self.t >= self.T or self.decisiones >= self.T  # ≥ 1 s por decisión
        if self.salud <= 0:
            r -= 5 * w["seguridad"]
            hecho = True
        self.hecho = hecho
        info = {"habilidad": h, "exito": exito, "causa": causa, "s": round(dt, 1), "agente": self.turno, "fin": hecho}
        # siguiente turno: el agente que sigue en el episodio con el reloj más atrasado (con uno solo, siempre el mismo)
        relojes = {k: (self.t if k == self.turno else self.agentes[k]["t"]) for k in range(self.n)
                   if not (self.hecho if k == self.turno else self.agentes[k]["hecho"])}
        if relojes:
            j = min(relojes, key=lambda k: (relojes[k], k))
            if j != self.turno:
                self._cargar(j)
        return self.obs(), float(r), not relojes, info



# Guion de cada perfil, leído de las entradas perfil_*: con el recolector y sin compañeros es el guion de F2.
# - Huir: de un hostil a < 8 bloques; con seguridad alta (≥ 0,6), de cualquiera que vea (< 16); con seguridad muy baja
#   (< 0,1), solo cuando ya le ha interrumpido (≤ 6).
# - Acompañar (compañía ≥ 0,5, o seguridad ≥ 0,6 de noche): con el jugador a la vista y a > 10 bloques, ir con él;
#   si no, recoger/picar como siempre, pero ir solo a árboles a ≤ 6 bloques (≤ 9 del jugador: no oscila) y si no, esperarle.
# - Compañero (fase C): si iba a ir a un árbol que es el objetivo del compañero más cercano y él está más cerca de ese árbol,
#   ir_a_otro_arbol (si hay otro al alcance de la vista, o a ≤ 6 bloques cuando acompaña). Delante de un árbol, pica igual.
CERCA_JUGADOR, ARBOL_JUNTO = 10 / VISTA, 6 / VISTA


def guion_lote(s, companero=True):
    """Guion para un lote de observaciones (array N×len(OBS)) → array de índices de habilidad.
    companero=False: el guion sin la regla del compañero (para medir lo que aporta)."""
    s = np.asarray(s)
    pc, ps = s[:, I["perfil_compania"]], s[:, I["perfil_seguridad"]]
    umbral = np.where(ps >= 0.6, 1.0, np.where(ps < 0.1, 0.4, 0.5))
    junto = (pc >= 0.5) | ((ps >= 0.6) & (s[:, I["noche"]] > 0))
    ve_jugador = s[:, I["jugador_dist"]] < 1
    limite = np.where(junto & ve_jugador, ARBOL_JUNTO, 1.0)
    a = np.where(s[:, I["arbol_dist"]] < limite, 0, 3)
    if companero:
        cedo = (s[:, I["companero_mismo_arbol"]] > 0) & (s[:, I["companero_arbol_dist"]] < s[:, I["arbol_dist"]]) & \
               (s[:, I["otro_arbol_dist"]] < limite)
        a = np.where((a == 0) & cedo, 5, a)
    a = np.where(s[:, I["arbol_enfrente"]] > 0, 1, a)  # árbol enfrente: pica (o marca la columna si solo quedan restos altos)
    a = np.where((s[:, I["objetos_suelo"]] > 0) & ~((s[:, I["previa_recoger"]] > 0) & (s[:, I["previa_exito"]] == 0)), 2, a)  # objetos cerca, salvo si recoger acaba de fallar
    a = np.where(junto & ve_jugador & (s[:, I["jugador_dist"]] > CERCA_JUGADOR), 3, a)
    return np.where(s[:, I["amenaza_dist"]] < umbral, 4, a)


def politica_guion(o, companero=True):
    """Referencia a mano (lo que debe igualar o superar el modelo): huir, acompañar, recoger, picar, ir al árbol (o a otro si el
    compañero va al mismo), ir al jugador."""
    return int(guion_lote(np.asarray(o, dtype=np.float32)[None], companero)[0])


def politica_guion_solo(o):
    """El guion sin la regla del compañero: va siempre al árbol más cercano."""
    return politica_guion(o, companero=False)


def jugar(env, pol, rng=None):
    """Un episodio entero con la política `pol` para todos los agentes (None: azar con `rng`).
    Devuelve el estado final de cada agente (env.resultados()) y su recompensa total."""
    o, hecho, R = env.reset(), False, [0.0] * env.n
    while not hecho:
        o, r, hecho, info = env.step(pol(o) if pol else int(rng.integers(len(HABILIDADES))))
        R[info["agente"]] += r
    return env.resultados(), R


if __name__ == "__main__":
    import sys
    from collections import Counter
    n = int(sys.argv[1]) if len(sys.argv) > 1 else 300
    print(f"calibración: { {h: round(v['p'], 2) for h, v in calibrar().items() if isinstance(v, dict)} } · {n} mundos por fila")
    for pacifico in (True, False):
        print(f"--- {'pacífico' if pacifico else 'con amenazas nocturnas'}")
        for perfil in cargar_perfiles():
            for nombre, pol in (("azar", None), ("guion", politica_guion)):
                env, rng = MundoHabilidades(semilla=0, perfil=perfil, pacifico=pacifico), np.random.default_rng(1)
                R, troncos, cerca, huidas, muertes, causas = [], [], [], [], 0, Counter()
                for _ in range(n):
                    o, hecho, total = env.reset(), False, 0.0
                    while not hecho:
                        o, r, hecho, info = env.step(pol(o) if pol else int(rng.integers(len(HABILIDADES))))
                        total += r
                        causas[info["habilidad"]] += 1
                    R.append(total); troncos.append(env.inv); cerca.append(env.t_cerca / env.t); huidas.append(env.huidas)
                    muertes += env.salud <= 0
                print(f"{perfil:13s} {nombre:5s} R {np.mean(R):5.1f} · troncos {np.mean(troncos):4.1f} · junto al jugador "
                      f"{100 * np.mean(cerca):3.0f} % · huidas {np.mean(huidas):3.1f} · muertes {muertes} · uso {dict(causas.most_common(3))}")
    print("--- varios personajes, pacífico (troncos por agente; conflictos: veces que fue al árbol de un compañero; "
          "estorbos: picar fallido con un compañero delante; solo = guion sin la regla del compañero)")
    for equipo in (["recolector"] * 2, ["recolector"] * 3, ["recolector", "cooperativo"]):
        for nombre, pol in (("guion", politica_guion), ("solo", politica_guion_solo)):
            env = MundoHabilidades(semilla=0, perfil=equipo)
            por = [[] for _ in equipo]
            conf = estorbos = 0
            for _ in range(n):
                ags, _ = jugar(env, pol)
                for k, ag in enumerate(ags):
                    por[k].append(ag["inv"])
                conf += sum(ag["conflictos"] for ag in ags); estorbos += sum(ag["estorbos"] for ag in ags)
            print(f"{'+'.join(equipo):35s} {nombre:5s} troncos {' / '.join(f'{np.mean(v):4.1f}' for v in por)} · "
                  f"conflictos {conf / n:4.1f} · estorbos {estorbos / n:4.1f} por episodio")
