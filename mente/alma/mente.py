#!/usr/bin/env python3
"""Mente de «Alma» (F6; hasta el 2026-10-15 se llamó «Claude», carpeta mente/claude): la parte mecánica del bucle mente-cuerpo. La sesión de Claude Code decide; este guion habla con el
cuerpo (bot/io.js, puerto 3004 por defecto; todas las peticiones llevan de=mente), hace cumplir el contrato de la sesión
(minutos y turnos), espera sondeando el informe del cuerpo y guarda la memoria propia de la mente en esta carpeta.
Uso (desde cualquier sitio):
  mente.py inicio --minutos 45 --turnos 30 --meta "TEXTO" [--puerto 3004] [--forzar]   empieza una sesión (contrato)
  mente.py ver [--todo]                        informe del cuerpo desde la última lectura (orden `resumen`), compacto
  mente.py meta libre --perfil P --minutos N [--espero T] [--porque T]   fija perfil + modo libre durante N min (un turno)
  mente.py meta ordenes                        saca al cuerpo del modo libre
  mente.py orden "tala 5 troncos" [--porque T] [--esperar] [--limite 600]   una orden concreta (un turno)
  mente.py esperar [--max 600] [--sin-eventos]   duerme hasta que acabe la meta libre o la orden, o llegue un evento, PARAR
                                               o el fin del contrato; imprime solo lo nuevo
  mente.py anotar "aprendizaje"                a memoria.md (sin duplicados)
  mente.py propuesta "texto"                   a propuestas.md (reentrenar, habilidad que falta…)
  mente.py fin [--voz "resumen apto para voz"] deja el cuerpo quieto en modo órdenes y cierra la sesión
  mente.py estado                              el contrato y la meta en curso
Archivos: sesion.json (la sesión en curso), diario.md (un turno por línea), memoria.md, fallos.json, propuestas.md,
sesiones.md; PARAR (si existe, esperar vuelve enseguida y la mente debe cerrar). En ../diario.md (el del cuerpo) solo una
cabecera y una línea de cierre por sesión.
Mundo (F7.7): todas las órdenes aceptan --mundo usuario|supervivencia|companero (sin él, IO_SERVIDOR; sin nada, el del usuario, como
siempre). En el de supervivencia (GUIA_supervivencia.md) el cuerpo es Alma en el puerto 3104, los archivos de la mente van a
supervivencia/ (la memoria del mundo del usuario no vale allí; PARAR es el mismo), la cabecera y el cierre al diario de ese
mundo (mundos/supervivencia/diario.md), el campamento por defecto es el de mundos/supervivencia/mundo.json, el informe añade
una línea de supervivencia (hora, luz, equipo, refugio, monstruos; de `obs_sv`, que solo lee) y esperar despierta también con
hambre, noche, día, reaparecido y al anochecer (la hora pasa de ANOCHECER entre dos lecturas)."""
import argparse, datetime, json, os, re, subprocess, sys, time, urllib.parse, urllib.request
from pathlib import Path

AQUI = Path(__file__).resolve().parent
RAIZ = AQUI.parent.parent
SESION, PARAR = AQUI / "sesion.json", AQUI / "PARAR"
DIARIO, MEMORIA, FALLOS, PROPUESTAS, SESIONES = (AQUI / n for n in ("diario.md", "memoria.md", "fallos.json", "propuestas.md", "sesiones.md"))
DIARIO_CUERPO = RAIZ / "mente" / "diario.local.md"  # 2026-11-02: el diario del cuerpo es de cada persona (bot/mundo.js: propio)
PUERTO = 3004
PUERTOS = {"usuario": 3004, "supervivencia": 3104, "companero": 3004}  # F7.7: Alma en cada mundo (supervivencia en 31xx; en el server del compañero, el puerto de siempre: el mundo local no corre a la vez)
MUNDO, CAMPAMENTO = "usuario", None  # los fija elegir_mundo()
SONDEO = 20  # s entre lecturas del informe mientras se espera
BLOQUEOS = 5  # bloqueos seguidos en una espera que cuentan como atasco
AVISOS = {"amenaza", "bloqueado", "agua", "cofres_llenos", "muerto", "salud_baja", "orden_externa", "desconectado", "reconectado",
          "expulsado", "falta_material", "obra",
          "hambre", "noche", "dia", "reaparecido"}  # F7.1: solo llegan fuera del mundo del usuario (informe.vigilar)
ANOCHECER, NOCHE = 11500, (12480, 23520)  # F7.7: la regla del anochecer (GUIA_supervivencia.md); la noche, como el cuerpo
RECURRENTE_SESION, RECURRENTE_TOTAL = 5, 15
MAX_MEMORIA = 60

ahora = lambda: datetime.datetime.now()
hora = lambda: ahora().strftime("%H:%M:%S")
fecha = lambda: ahora().strftime("%Y-%m-%d %H:%M")


def carpeta(nombre):
    """Archivos de la mente en ese mundo: los de siempre en el del usuario; cada mundo aparte, en su subcarpeta."""
    return AQUI if nombre == "usuario" else AQUI / nombre


def elegir_mundo(nombre):
    """F7.7: puerto, archivos y diario del cuerpo del mundo `nombre` (el diario lo resuelve entrenamiento/mundo.py, como bot/mundo.js)."""
    global MUNDO, CAMPAMENTO, PUERTO, SESION, DIARIO, MEMORIA, FALLOS, PROPUESTAS, SESIONES, DIARIO_CUERPO
    os.environ["IO_SERVIDOR"] = nombre
    sys.path.insert(0, str(RAIZ / "entrenamiento"))
    import mundo
    c = carpeta(nombre)
    c.mkdir(exist_ok=True)
    MUNDO, PUERTO, DIARIO_CUERPO = nombre, PUERTOS[nombre], mundo.DIARIO
    CAMPAMENTO = mundo.datos().get("campamento")  # el del usuario no tiene mundo.json
    SESION = c / "sesion.json"
    DIARIO, MEMORIA, FALLOS, PROPUESTAS, SESIONES = (c / n for n in ("diario.md", "memoria.md", "fallos.json", "propuestas.md", "sesiones.md"))


# ---------- cuerpo ----------

def cuerpo(c, t=30, puerto=None):
    """Una orden al puerto del personaje (como ejecutor.orden), marcada de=mente."""
    s = sesion(False)
    url = f"http://127.0.0.1:{puerto or (s or {}).get('puerto', PUERTO)}/?c={urllib.parse.quote(c)}&de=mente"
    try:
        return urllib.request.urlopen(url, timeout=t).read().decode().strip()
    except Exception as e:
        return "ERROR " + str(e)[:80]


def resumen(todo=False, puerto=None):
    r = cuerpo("resumen todo" if todo else "resumen", 60, puerto)
    if r.startswith("ERROR"):
        raise SystemExit("el cuerpo no responde: " + r)
    d = json.loads(r)
    if not todo and SESION.exists():  # troncos picados en la sesión (el cuerpo pone a cero sus «guardados» al reconectar)
        try:
            s = json.loads(SESION.read_text())
            s["picados"] = s.get("picados", 0) + int((((d.get("hecho") or {}).get("habilidades") or {}).get("picar_tronco") or {}).get("ok", 0))
            if MUNDO != "usuario":  # F7.7: para anochecio()
                s["hora_previa"], s["hora_vista"] = s.get("hora_vista"), ((d.get("ahora") or {}).get("hora") or {}).get("ticks")
            guardar(s)
        except Exception:
            pass
    return d


def linea_sv():
    """F7.7: lo de supervivencia que no trae el informe (orden `obs_sv`, que solo lee): hora, luz, equipo, refugio, monstruos."""
    if MUNDO == "usuario":
        return None
    r = cuerpo("obs_sv", 20)
    try:
        d = json.loads(r)["datos"]
    except (ValueError, KeyError, TypeError):
        return "supervivencia: sin datos (" + r[:80] + ")"
    h = d.get("hora") or 0
    cuando = (f"anochecer en {(ANOCHECER - h) / 1200:.0f} min" if h < ANOCHECER else "ANOCHECE: regla del anochecer" if h < NOCHE[0]
              else f"noche, amanece en {(24000 - h) / 1200:.0f} min" if h <= NOCHE[1] else "amanece")
    luz = d.get("luz")
    ref = ("dentro" if d.get("en_refugio") else f"a {d['refugio_dist']:.0f} bloques ({','.join(map(str, d['refugio']))})"
           if d.get("refugio_dist") is not None and d.get("refugio") else "ninguno")
    peligro = [n for n, k in (("caída", "caida"), ("lava", "lava"), ("agua honda", "agua_profunda")) if d.get(k)]
    return (f"supervivencia: hora {h} ({cuando}) · luz {luz.get('valor') if isinstance(luz, dict) else luz} · arma {d.get('arma') or '-'}"
            f" · armadura {d.get('armadura') or 0} · tierra {d.get('tierra') or 0} · cama {'sí' if d.get('cama') else 'no'} · comida {d.get('comida') or 0}"
            f" · refugio {ref} · monstruos {d.get('hostiles') or 0}" + (f" (el más cerca {d['hostil']})" if d.get("hostil") else "")
            + (f" · peligro: {', '.join(peligro)}" if peligro else ""))


def anochecio(s):
    """F7.7: entre las dos últimas lecturas del informe la hora pasó de ANOCHECER (fuera del mundo del usuario)."""
    p, h = (s or {}).get("hora_previa"), (s or {}).get("hora_vista")
    return MUNDO != "usuario" and p is not None and h is not None and p < ANOCHECER <= h and h - p < 12000


# ---------- sesión y contrato ----------

def sesion(obligatoria=True):
    if SESION.exists():
        return json.loads(SESION.read_text())
    if obligatoria:
        otra = [m for m in PUERTOS if m != MUNDO and (carpeta(m) / "sesion.json").exists()]
        if otra:
            raise SystemExit(f"no hay sesión en el mundo {MUNDO}; hay una en el de {otra[0]}: añade --mundo {otra[0]}")
        raise SystemExit("no hay sesión: empieza con `mente.py inicio --minutos N --turnos M --meta \"…\"`")
    return None


def guardar(s):
    SESION.write_text(json.dumps(s, ensure_ascii=False, indent=1))


def contrato(s):
    """Minutos usados y restantes, turnos usados y restantes."""
    usados = (time.time() - s["inicio"]) / 60
    return {"min_usados": round(usados, 1), "min_restantes": round(max(0, s["minutos"] - usados), 1),
            "turnos_usados": s["turnos_usados"], "turnos_restantes": max(0, s["turnos"] - s["turnos_usados"])}


def agotado(s):
    c = contrato(s)
    return c["min_restantes"] <= 0 or c["turnos_restantes"] <= 0


def exigir_turno(s):
    if PARAR.exists():
        raise SystemExit("PARAR existe: el usuario quiere que pares. Cierra con `mente.py fin`.")
    if agotado(s):
        raise SystemExit("contrato agotado (%s): no hay más turnos. Cierra con `mente.py fin`." % texto_contrato(s))
    s["turnos_usados"] += 1


def texto_contrato(s):
    c = contrato(s)
    return f"{c['min_usados']:.0f}/{s['minutos']} min · {c['turnos_usados']}/{s['turnos']} turnos"


def anadir(ruta, texto):
    with ruta.open("a", encoding="utf-8") as f:
        f.write(texto.rstrip("\n") + "\n")


def turno(s, texto):
    """Una línea en el diario de la mente, con el turno y la hora."""
    anadir(DIARIO, f"- {hora()} · turno {s['turnos_usados']} · {texto}")


# ---------- informe compacto ----------

def _lista(v):
    return ", ".join(f"{n} {k.replace('_', ' ')}" for k, n in sorted(v.items())) if isinstance(v, dict) else str(v)


def actualizar_fallos(fallos, s):
    """Acumula en fallos.json (habilidad|causa → n total, n en esta sesión, última posición) y marca los recurrentes."""
    datos = json.loads(FALLOS.read_text()) if FALLOS.exists() and FALLOS.read_text().strip() else {}
    recurrentes = []
    for f in fallos:
        k = f"{f['habilidad']}|{f['causa']}"
        d = datos.setdefault(k, {"n": 0, "sesion": None, "n_sesion": 0})
        if d.get("sesion") != s["id"]:
            d.update(sesion=s["id"], n_sesion=0)
        d["n"] += f["n"]
        d["n_sesion"] += f["n"]
        d["ultimo"] = fecha()
        if f.get("pos"):
            d["pos"] = f["pos"]
        if d["n_sesion"] >= RECURRENTE_SESION or d["n"] >= RECURRENTE_TOTAL:
            recurrentes.append(k)
    FALLOS.write_text(json.dumps(datos, ensure_ascii=False, indent=1))
    return recurrentes


def formatear(rs, s, motivo=None, sv=None):
    """Varios informes seguidos (los sondeos de esperar) en un texto compacto, una línea por cosa (y la de linea_sv())."""
    if not rs:
        return "(sin informe)"
    u = rs[-1]
    ordenes = [o for r in rs for o in r["hecho"]["ordenes"]]
    tramos = [t for r in rs for t in r["hecho"]["tramos"]]
    eventos = [e for r in rs for e in r["eventos"] if e["tipo"] != "modo"]
    ganados = sum(r["hecho"]["troncos_ganados"] or 0 for r in rs)
    viajes = sum(r["hecho"]["viajes_cofre"]["n"] for r in rs)
    habs = {}
    for r in rs:
        for h, c in r["hecho"]["habilidades"].items():
            habs.setdefault(h, {"ok": 0, "fallo": 0})
            habs[h]["ok"] += c["ok"]; habs[h]["fallo"] += c["fallo"]
    fallos = {}
    for r in rs:
        for f in r["fallos"]:
            k = (f["habilidad"], f["causa"])
            fallos.setdefault(k, {"habilidad": f["habilidad"], "causa": f["causa"], "n": 0})
            fallos[k]["n"] += f["n"]
            if f.get("pos"):
                fallos[k]["pos"] = f["pos"]
    recurrentes = set(actualizar_fallos(list(fallos.values()), s))
    m, a = u["modo"], u["ahora"]
    L = [f"{u['personaje']} · {rs[0]['desde'] or 'inicio'}→{u['hasta']} · modo {m.get('modo')} (perfil {m.get('perfil')}) · orden en curso: "
         f"{m.get('orden') or '-'} · al terminar: {m.get('despues')}" + (f" · tramo libre: {m['tramo']['segundos']} s, {m['tramo']['decisiones']} decisiones, +{m['tramo']['troncos']} troncos" if m.get("tramo") else "")]
    if ordenes or tramos or habs:
        L.append(f"hecho: +{ganados} troncos · cofre {viajes} viajes · " + (" ".join(f"{h} {c['ok']}/{c['ok'] + c['fallo']}" for h, c in habs.items()) or "nada"))
    for t in tramos:
        L.append(f" tramo libre {t['inicio']} ({t['perfil']}) {t['s']} s, +{t['troncos']} troncos, acabó por {t['motivo']}: {t['secuencia']}")
    for o in ordenes:
        L.append(f" orden «{o['texto']}» ({o['quien']}) {'✓' if o['exito'] else '✗'} {o['resultado']} ({o['s']} s{'; ' + o['pasos'] if o.get('pasos') else ''})")
    if fallos:
        L.append("fallos: " + " · ".join(f"{f['habilidad']}·{f['causa']} ×{f['n']}" + (f" en {','.join(map(str, f['pos']))}" if f.get("pos") else "")
                                       + (" [RECURRENTE: propón arreglo, no insistas]" if f"{f['habilidad']}|{f['causa']}" in recurrentes else "") for f in fallos.values()))
    for e in eventos:
        L.append(f"evento {e['t']} {e['tipo']}" + (f" {json.dumps(e['datos'], ensure_ascii=False)}" if "datos" in e else ""))
    if a.get("desconectado"):
        L.append("ahora: DESCONECTADO")
    else:
        inv = a["inventario"]
        L.append(f"ahora: pos {','.join(map(str, a['pos'] or []))} · salud {a['salud']} · hambre {a['hambre']} · {'noche' if a['hora']['noche'] else 'día'}"
                 f" · inv: {inv['troncos']} troncos, {inv['tablones']} tablones, herr: {','.join(inv['herramientas']) or '-'}, comida {inv['comida']}, "
                 f"otros: {_lista(inv['otros']) or '-'}, {inv['huecos']} huecos · cofre: {a['cofre']['guardados']} guardados{' LLENOS' if a['cofre']['llenos'] else ''}"
                 f" · árbol {','.join(map(str, a['arbol'])) if a.get('arbol') else '-'} · jugador {a.get('jugador') or '-'} · amenaza {a.get('amenaza') or '-'}"
                 f" · compañero {a.get('companero') or '-'} · campamento {','.join(map(str, a['campamento'])) if a.get('campamento') else '-'}")
    if sv:
        L.append(sv)
    L.append(f"contrato: {texto_contrato(s)}" + (f" · meta en curso: {s['meta_actual']['texto']}" if s.get("meta_actual") else "") + (f" · esperar acabó por: {motivo}" if motivo else ""))
    return "\n".join(L)


# ---------- órdenes de la mente ----------

def cmd_inicio(a):
    if SESION.exists() and not a.forzar:
        raise SystemExit("ya hay una sesión (sesion.json); ciérrala con `mente.py fin` o usa --forzar")
    ocupados = []
    try:
        salida = subprocess.run(["narrador", "trabajador", "lista"], capture_output=True, text=True, timeout=30).stdout
        ocupados = re.findall(r"^(io-mundo-simulado-\S+)\s+busy", salida, re.M)
    except Exception:
        pass
    yo = 1 if os.environ.get("NARRADOR_IO") else 0  # si la mente es un trabajador, ella misma sale como ocupada
    if len(ocupados) - yo > 0 and not a.forzar:
        raise SystemExit("hay otro trabajador ocupado en el servidor (%s): no mandes nada; espera o pide permiso" % ", ".join(ocupados))
    if cuerpo("estado", 10, a.puerto).startswith("ERROR"):
        raise SystemExit(f"el cuerpo no responde en el puerto {a.puerto}: no arranques el servidor ni los bots por tu cuenta; dilo en el informe")
    if PARAR.exists():
        PARAR.unlink()
    s = {"id": ahora().strftime("%Y%m%d-%H%M%S"), "inicio": time.time(), "minutos": a.minutos, "turnos": a.turnos, "turnos_usados": 0,
         "puerto": a.puerto, "meta": a.meta, "meta_actual": None}
    r = resumen(False, a.puerto)  # lo anterior a la sesión no cuenta: se lee y se descarta
    s["troncos0"] = (r["ahora"].get("inventario") or {}).get("troncos", 0) + (r["ahora"].get("cofre") or {}).get("guardados", 0)
    if not r["ahora"].get("campamento"):  # F7.7: en el de supervivencia, el de mundo.json
        cuerpo("campamento " + (" ".join(map(str, CAMPAMENTO)) if CAMPAMENTO else "aqui"), 10, a.puerto)
    guardar(s)
    en = "" if MUNDO == "usuario" else f" · mundo {MUNDO}"
    anadir(DIARIO_CUERPO, f"## Mente Alma · sesión {fecha()}{en} · meta: {a.meta} · contrato {a.minutos} min, {a.turnos} turnos")
    anadir(DIARIO, f"## Sesión {s['id']} · meta: {a.meta} · contrato {a.minutos} min, {a.turnos} turnos")
    print(f"sesión {s['id']} abierta{en} · {texto_contrato(s)} · meta: {a.meta}")
    print(formatear([r], s, sv=linea_sv()))


def cmd_ver(a):
    s = sesion()
    print(formatear([resumen(a.todo)], s, sv=linea_sv()))


def cmd_meta(a):
    s = sesion()
    if a.tipo == "ordenes":
        print(cuerpo("modo ordenes"))
        s["meta_actual"] = None
        guardar(s)
        return
    exigir_turno(s)
    if not a.perfil or not a.minutos:
        raise SystemExit("meta libre necesita --perfil y --minutos")
    r1 = cuerpo(f"perfil {a.perfil}")
    if "no existe" in r1:
        raise SystemExit(r1)
    r2 = cuerpo("modo libre despues quieto")
    s["meta_actual"] = {"tipo": "libre", "perfil": a.perfil, "hasta": time.time() + a.minutos * 60, "texto": f"libre {a.perfil} {a.minutos} min",
                        "espero": a.espero}
    guardar(s)
    turno(s, f"META libre · perfil {a.perfil} · {a.minutos} min" + (f" · espero: {a.espero}" if a.espero else "") + (f" · porque: {a.porque}" if a.porque else ""))
    print(f"meta fijada: perfil {a.perfil}, modo libre {a.minutos} min · {texto_contrato(s)}")
    print(r2)


def cmd_orden(a):
    s = sesion()
    exigir_turno(s)
    s["meta_actual"] = {"tipo": "orden", "texto": a.texto, "inicio": time.time()}
    guardar(s)
    turno(s, f"ORDEN «{a.texto}»" + (f" · porque: {a.porque}" if a.porque else ""))
    if a.esperar:
        r = cuerpo("orden_esperar " + a.texto, a.limite)
        s["meta_actual"] = None
        guardar(s)
        print(r)
        turno(s, f"resultado de «{a.texto}»: {r}")
    else:
        print(cuerpo("orden " + a.texto))


def avisos(rs, r, s=None):
    """Eventos del último sondeo que despiertan a la mente. «bloqueado» solo cuando se repite (≥ BLOQUEOS en esta espera):
    un bloqueo suelto lo resuelve el cuerpo; cinco seguidos es un atasco y toca cambiar de plan. F7.7: «anochecer» no es un
    evento del cuerpo: lo pone anochecio(s)."""
    tipos = sorted({e["tipo"] for e in r["eventos"] if e["tipo"] in AVISOS and e["tipo"] != "bloqueado"})
    nb = sum(1 for rr in rs for e in rr["eventos"] if e["tipo"] == "bloqueado")
    if nb >= BLOQUEOS:
        tipos.append(f"bloqueado ×{nb}")
    if anochecio(s):
        tipos.append(f"anochecer (hora {s['hora_vista']}: regla del anochecer)")
    return tipos


def cmd_esperar(a):
    s = sesion()
    rs, t0, motivo = [], time.time(), None
    while True:
        time.sleep(5 if not rs else SONDEO)
        r = resumen()
        rs.append(r)
        s = sesion()
        m = s.get("meta_actual")
        if PARAR.exists():
            motivo = "PARAR (el usuario quiere que pares: cierra con fin)"
        elif agotado(s):
            motivo = "contrato agotado: cierra con fin"
        elif m and m["tipo"] == "libre" and time.time() >= m["hasta"]:
            cuerpo("modo ordenes"); motivo = "fin de la meta libre (el cuerpo queda en órdenes)"
        elif m and m["tipo"] == "orden" and not r["modo"]["orden"] and any(o["quien"] == "mente" for rr in rs for o in rr["hecho"]["ordenes"]):
            motivo = "orden terminada"
        elif not a.sin_eventos and avisos(rs, r, s):
            motivo = "evento: " + ", ".join(avisos(rs, r, s))
        elif time.time() - t0 >= a.max:
            motivo = f"tiempo máximo ({a.max} s)"
        elif r["ahora"].get("desconectado"):
            motivo = "cuerpo desconectado"
        if motivo:
            break
    if motivo.startswith(("fin de la meta", "orden terminada")):
        s["meta_actual"] = None
        guardar(s)
    texto = formatear(rs, s, motivo, linea_sv())
    print(texto)
    turno(s, "esperé → " + motivo + " · " + texto.split("\n")[1 if len(texto.split("\n")) > 1 else 0][:200])


def cmd_anotar(a):
    lineas = MEMORIA.read_text().splitlines() if MEMORIA.exists() else []
    if any(a.texto.strip() in l for l in lineas):
        print("ya estaba en memoria.md"); return
    anadir(MEMORIA, f"- ({ahora().strftime('%Y-%m-%d')}) {a.texto.strip()}")
    n = len([l for l in MEMORIA.read_text().splitlines() if l.startswith("- ")])
    print(f"anotado ({n} aprendizajes" + (f"; pasa de {MAX_MEMORIA}: resume o quita los viejos" if n > MAX_MEMORIA else "") + ")")


def cmd_propuesta(a):
    anadir(PROPUESTAS, f"- ({fecha()}) {a.texto.strip()}")
    print("propuesta anotada")


def cmd_fin(a):
    s = sesion()
    cuerpo("orden quedate", 20)  # corta lo que esté haciendo y lo deja en modo órdenes
    cuerpo("modo ordenes despues quieto", 10)
    r = resumen()
    sv = linea_sv()  # antes de borrar sesion.json (lleva el puerto)
    s = sesion()
    t = (r["ahora"].get("inventario") or {}).get("troncos", 0) + (r["ahora"].get("cofre") or {}).get("guardados", 0) - s.get("troncos0", 0)
    c = contrato(s)
    linea = (f"- {hora()} · fin · {c['min_usados']:.0f} min, {c['turnos_usados']} turnos · troncos talados en la sesión: {s.get('picados', 0)} (inventario+cofre {t:+d}) · meta: {s['meta']}"
             + (f" · {a.voz}" if a.voz else ""))
    anadir(DIARIO_CUERPO, linea)
    anadir(DIARIO, linea)
    anadir(SESIONES, f"## {s['id']} · {s['meta']}\n{linea}")
    SESION.unlink()
    print(f"sesión cerrada: {linea[2:]}")
    print(formatear([r], s, sv=sv))


def cmd_estado(a):
    s = sesion(False)
    if not s:
        print("sin sesión"); return
    print(json.dumps({**{k: v for k, v in s.items() if k != "inicio"}, "contrato": contrato(s), "PARAR": PARAR.exists()}, ensure_ascii=False, indent=1))


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--mundo", choices=list(PUERTOS))  # F7.7: también después de la orden (mente.py ver --mundo supervivencia)
    comun = argparse.ArgumentParser(add_help=False)
    comun.add_argument("--mundo", choices=list(PUERTOS), default=argparse.SUPPRESS)
    sub = ap.add_subparsers(dest="cmd", required=True)
    nueva = lambda nombre: sub.add_parser(nombre, parents=[comun])
    p = nueva("inicio"); p.add_argument("--minutos", type=float, default=45); p.add_argument("--turnos", type=int, default=30)
    p.add_argument("--meta", required=True); p.add_argument("--puerto", type=int); p.add_argument("--forzar", action="store_true")
    p = nueva("ver"); p.add_argument("--todo", action="store_true")
    p = nueva("meta"); p.add_argument("tipo", choices=["libre", "ordenes"]); p.add_argument("--perfil"); p.add_argument("--minutos", type=float)
    p.add_argument("--espero"); p.add_argument("--porque")
    p = nueva("orden"); p.add_argument("texto"); p.add_argument("--porque"); p.add_argument("--esperar", action="store_true")
    p.add_argument("--limite", type=int, default=600)
    p = nueva("esperar"); p.add_argument("--max", type=int, default=600); p.add_argument("--sin-eventos", action="store_true")
    p = nueva("anotar"); p.add_argument("texto")
    p = nueva("propuesta"); p.add_argument("texto")
    p = nueva("fin"); p.add_argument("--voz")
    nueva("estado")
    a = ap.parse_args()
    elegir_mundo(a.mundo or os.environ.get("IO_SERVIDOR") or "usuario")
    if a.cmd == "inicio":
        a.puerto = a.puerto or PUERTO
    globals()["cmd_" + a.cmd](a)


if __name__ == "__main__":
    main()
