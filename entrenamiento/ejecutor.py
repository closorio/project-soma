#!/usr/bin/env python3
"""Ejecutor de F2 en Minecraft: observación del bot (orden `obs`, las 25 entradas de entorno_habilidades.py) → política → habilidad,
en bucle durante un episodio. Cada decisión cuesta ≥ 1 s, como en el simulador.
Políticas: red (politica_habilidades.json, inferencia con numpy), guion (politica_guion, la estrategia a mano del perfil, con la
regla del compañero), guion_solo (el mismo guion sin esa regla: va siempre al árbol más cercano) o azar.
Perfil (F3): el del bot (orden `perfil`), que va en 4 entradas; --perfil NOMBRE lo cambia antes de empezar.
Personaje: --puerto (el de control del bot, 3001 por defecto) y --nombre (por defecto, el que dice el bot en ese puerto).
Varios personajes (fase C): --personajes Soma:3001:recolector,Eco:3002:cooperativo lanza un hilo por personaje, todos con la misma
política (la red se lee una vez), escalonados --escalon s para que cada uno vea ya el objetivo del anterior.
Cofre: tras cualquier habilidad el bot puede ir a guardar lo recogido (reflejo de io.js, no lo decide la red); va en la respuesta
(«deposito»), en cada decisión («cofre») y en el resumen (depositos, depositado). Los troncos guardados cuentan como ganados.
Registro: cada episodio en el diario del mundo (mundo.py; mente/diario.md en el del usuario): secuencia de decisiones; con
--diario completo, una línea por decisión
y cada decisión con su observación en un JSONL (ejecuciones/).
Uso: ejecutor.py [--politica red|guion|azar] [--perfil NOMBRE] [--puerto 3001] [--nombre Soma] [--segundos 300]
                  [--diario resumen|completo|no] [--jsonl RUTA] [--personajes NOMBRE[:PUERTO[:PERFIL]],… [--escalon 1.5]]"""
import argparse, json, threading, time, urllib.parse, urllib.request
from collections import Counter
from pathlib import Path

import numpy as np

import mundo
from entorno_habilidades import HABILIDADES, OBS, I, politica_guion, politica_guion_solo

AQUI = Path(__file__).parent
DIARIO = mundo.DIARIO  # el del mundo de IO_SERVIDOR (mundo.py)
# recoger solo troncos (lo que cuenta la observación; si no, persigue huevos tras una valla); huir «-»: el hostil más cercano
ARGS = {"ir_a_arbol": "80", "picar_tronco": "", "recoger": "8 _log", "ir_a_jugador": "", "huir": "-", "ir_a_otro_arbol": "80"}
ESPERA = {"ir_a_arbol": 300, "ir_a_jugador": 150, "ir_a_otro_arbol": 300}  # s de margen de la petición HTTP (el resto, 90)
REFLEJO = 120  # s más: tras cualquier habilidad puede saltar el reflejo de guardar en el cofre (bot/habilidades/depositar.js)
CORTO = {"ir_a_arbol": "árbol", "picar_tronco": "picar", "recoger": "recoger", "ir_a_jugador": "jugador", "huir": "huir",
         "ir_a_otro_arbol": "otro árbol"}
PUERTO = 3001  # puerto de control del personaje por defecto (Soma, antes Io); cada función acepta otro (varios personajes, un hilo cada uno)
_escribir = threading.Lock()  # varios hilos (personajes) escriben en el mismo JSONL y en el diario


def orden(c, t=30, puerto=None):
    try:
        return urllib.request.urlopen(f"http://127.0.0.1:{puerto or PUERTO}/?c=" + urllib.parse.quote(c), timeout=t).read().decode().strip()
    except Exception as e:
        return "ERROR " + str(e)[:60]


def nombre_de(puerto=None, defecto="Soma"):
    """Nombre del personaje que atiende en ese puerto (orden `personajes`), para las órdenes RCON (tp, clear, give)."""
    try:
        return json.loads(orden("personajes", 10, puerto))["yo"]
    except (ValueError, KeyError):
        return defecto


ZONAS = mundo.ZONAS


def en_zona(x, z):
    """¿Cae (x, z) en alguna zona protegida del mundo (zonas.json de mundo.py, la de bot/zonas.js)? Se relee cada vez."""
    try:
        zs = json.loads(ZONAS.read_text()).get("zonas", [])
    except (OSError, ValueError):
        return False
    return any(min(q["x1"], q["x2"]) <= x <= max(q["x1"], q["x2"]) and min(q["z1"], q["z2"]) <= z <= max(q["z1"], q["z2"]) for q in zs)


def personajes(texto):
    """«Soma:3001:recolector,Eco:3002» → [{nombre, puerto, perfil}] (como los argumentos de io.js; puertos 3001, 3002… por defecto)."""
    lista = []
    for k, x in enumerate(t for t in texto.split(",") if t):
        nombre, puerto, perfil = (x.split(":") + [None, None])[:3]
        lista.append({"nombre": nombre, "puerto": int(puerto) if puerto else 3001 + k, "perfil": perfil or None})
    return lista


def observar(inicio=None, puerto=None):
    """{obs: [25], datos: {...}} del bot; con inicio=segundos empieza el episodio (reloj, troncos de partida, sin habilidad previa)."""
    r = orden(f"obs inicio {inicio}" if inicio else "obs", 30, puerto)
    try:
        return json.loads(r)
    except ValueError:
        return None


def politica(nombre, ruta=AQUI / "politica_habilidades.json", semilla=0):
    """Devuelve f(obs) → (índice de habilidad, valores Q o None)."""
    if nombre == "guion":
        return lambda o: (politica_guion(o), None)
    if nombre == "guion_solo":
        return lambda o: (politica_guion_solo(o), None)
    if nombre == "azar":
        rng = np.random.default_rng(semilla)
        return lambda o: (int(rng.integers(len(HABILIDADES))), None)
    pol = json.loads(Path(ruta).read_text())
    assert pol["acciones"] == HABILIDADES and pol["obs"] == OBS, "la política no es de este entorno"
    capas = [(np.array(c["w"]), np.array(c["b"])) for c in pol["capas"]]

    def red(o):
        x = np.asarray(o, dtype=np.float64)
        for i, (w, b) in enumerate(capas):
            x = w @ x + b
            if i < len(capas) - 1:
                x = np.maximum(x, 0)
        return int(x.argmax()), [round(float(v), 2) for v in x]
    return red


def percepcion(o, d):
    """La observación en palabras (para el diario)."""
    p = [f"árbol a {o[0] * 48:.0f}" if o[0] < 1 else "sin árbol a la vista"]
    if o[2]: p.append("tronco al alcance")
    elif o[1]: p.append("restos altos enfrente")
    if d.get("objetos"): p.append(f"{d['objetos']} troncos en el suelo")
    if o[I["companero_dist"]] < 1:
        p.append(f"{d.get('companero') or 'compañero'}" + (" va a mi árbol" if o[I["companero_mismo_arbol"]] else ""))
    p.append(f"+{d.get('ganados', 0)} troncos")
    p.append(f"jugador a {o[5] * 48:.0f}" if o[5] < 1 else "sin jugador a la vista")
    if o[6] < 1: p.append(f"amenaza a {o[6] * 16:.0f}")
    if o[7]: p.append("noche")
    if o[8] < 1: p.append(f"salud {o[8] * 20:.0f}")
    return ", ".join(p)


def secuencia(decisiones):
    """Decisiones seguidas iguales agrupadas: «árbol✓ picar✓×3 recoger✗(no llegó) …»."""
    toks = []
    for d in decisiones:
        t = CORTO[d["habilidad"]] + ("✓" if d["exito"] else f"✗({d['causa']})")
        if d.get("cofre"):
            t += "+cofre" + ("✓" if d["cofre"]["exito"] else "✗")
        if toks and toks[-1][0] == t:
            toks[-1][1] += 1
        else:
            toks.append([t, 1])
    return " ".join(t + (f"×{n}" if n > 1 else "") for t, n in toks)


def anotar(texto):
    with _escribir, open(DIARIO, "a") as f:
        f.write(texto.rstrip("\n") + "\n")


def poner_perfil(nombre, puerto=None):
    r = orden(f"perfil {nombre}", 10, puerto)
    if not r.startswith("{"):
        raise SystemExit(f"el bot no aceptó el perfil {nombre}: {r[:120]}")
    return json.loads(r)


def episodio(nombre="red", segundos=300, diario="resumen", jsonl=None, etiqueta="", ruta=AQUI / "politica_habilidades.json",
             puerto=None, elegir=None):
    """Un episodio de `segundos` con la política `nombre` y el perfil que tenga el bot del puerto `puerto`. Devuelve un resumen
    con los troncos ganados, las decisiones, la distancia al jugador (media y % de decisiones a ≤ 6 bloques), las huidas, el
    éxito de cada habilidad y, con compañeros, cuántas veces fue al árbol que era objetivo de otro (conflictos).
    elegir: la política ya cargada (con varios personajes, la misma para todos)."""
    elegir = elegir or politica(nombre, ruta)
    ob = observar(inicio=segundos, puerto=puerto)
    if ob is None:
        return {"politica": nombre, "error": "el bot no responde a obs"}
    if len(ob["obs"]) != len(OBS):
        raise SystemExit(f"el bot da {len(ob['obs'])} entradas y el entorno {len(OBS)}: reinicia el bot (node io.js)")
    perfil = ob["datos"].get("perfil")
    t0, decisiones, lineas = time.time(), [], []
    f = open(jsonl, "a") if jsonl else None
    while time.time() - t0 < segundos:
        ob = observar(puerto=puerto)
        if ob is None:  # bot desconectado o reconectando
            time.sleep(2)
            continue
        o, datos = ob["obs"], ob["datos"]
        a, q = elegir(np.array(o, dtype=np.float32))
        h = HABILIDADES[a]
        ti = time.time()
        r = orden(f"hab {h} {ARGS[h]}".strip(), ESPERA.get(h, 90) + REFLEJO, puerto)
        try:
            r = json.loads(r)
        except ValueError:
            r = {"habilidad": h, "exito": False, "causa": "sin respuesta: " + r[:40]}
        dt = time.time() - ti
        if dt < 1:
            time.sleep(1 - dt)  # como el simulador: cada decisión cuesta al menos 1 s
        causa = str(r.get("causa", "")).split(":")[0]
        dec = {"t": round(ti - t0, 1), "habilidad": h, "exito": bool(r.get("exito")), "causa": causa, "s": round(time.time() - ti, 1),
               "jugador": datos.get("jugador"), "companero": datos.get("companero"), "mismo_arbol": o[I["companero_mismo_arbol"]]}
        if r.get("deposito"):  # tras la habilidad saltó el reflejo de guardar en el cofre (no lo decide la red)
            dep = r["deposito"]
            dec["cofre"] = {"exito": bool(dep.get("exito")), "guardado": dep.get("guardado") or {}, "cuadra": dep.get("cuadra"),
                            "s": round(dep.get("ms", 0) / 1000, 1)}
        decisiones.append(dec)
        if f:
            with _escribir:
                f.write(json.dumps({"etiqueta": etiqueta, "politica": nombre, **dec, "q": q, "obs": o, "datos": datos, "resultado": r},
                                   ensure_ascii=False) + "\n"); f.flush()
        if diario == "completo":
            motivo = f" (Q {max(q):.2f})" if q else ""
            cofre = f" → guardé en el cofre {dec['cofre']['guardado']}" if dec.get("cofre") else ""
            lineas.append(f"- {dec['t']:.0f} s · percibí {percepcion(o, datos)} → elegí {h}{motivo} → "
                          f"{'éxito' if dec['exito'] else 'fallo'}: {causa} ({dec['s']} s){cofre}")
    time.sleep(1.5)  # objetos que aún vuelan hacia el inventario
    fin = observar(puerto=puerto) or {"datos": {}}
    if f:
        f.close()
    dj = [d["jugador"] for d in decisiones if d["jugador"] is not None]  # distancia al jugador antes de cada decisión
    res = {"politica": nombre, "perfil": perfil, "etiqueta": etiqueta, "segundos": round(time.time() - t0), "troncos": fin["datos"].get("ganados"),
           "decisiones": len(decisiones), "uso": dict(Counter(d["habilidad"] for d in decisiones)),
           "causas": dict(Counter(d["causa"] for d in decisiones)), "amenazas": sum(d["causa"] == "amenaza" for d in decisiones),
           "huidas": sum(d["causa"] == "a salvo" for d in decisiones),
           "exitos": {h: [sum(d["exito"] for d in decisiones if d["habilidad"] == h), n] for h, n in Counter(d["habilidad"] for d in decisiones).items()},
           "conflictos": sum(d["habilidad"] == "ir_a_arbol" and d["mismo_arbol"] > 0 for d in decisiones),
           "puerto": puerto or PUERTO,
           "depositos": [sum(d["cofre"]["exito"] for d in decisiones if d.get("cofre")), sum(1 for d in decisiones if d.get("cofre"))],
           "depositado": dict(sum((Counter(d["cofre"]["guardado"]) for d in decisiones if d.get("cofre")), Counter())),
           "deposito_cuadra": all(d["cofre"]["cuadra"] for d in decisiones if d.get("cofre") and d["cofre"]["guardado"]),
           "segundos_cofre": round(sum(d["cofre"]["s"] for d in decisiones if d.get("cofre")), 1),
           "jugador_medio": round(float(np.mean(dj)), 1) if dj else None,
           "junto": round(sum(x <= 6 for x in dj) / len(decisiones), 2) if decisiones else None,
           "secuencia": secuencia(decisiones)}
    if diario == "completo":
        anotar(f"## Episodio libre · {nombre} · perfil {perfil} · {time.strftime('%Y-%m-%d %H:%M')} ({segundos} s)\n" + "\n".join(lineas) +
               f"\nResultado: +{res['troncos']} troncos en {res['segundos']} s con {res['decisiones']} decisiones; "
               f"interrupciones por amenaza: {res['amenazas']}.")
    elif diario == "resumen":
        anotar(linea_diario(res))
    return res


def en_equipo(lista, nombre="red", segundos=300, diario="resumen", jsonl=None, etiqueta="", ruta=AQUI / "politica_habilidades.json",
              escalon=1.5):
    """Varios personajes a la vez (fase C): un episodio por personaje de `lista` ([{nombre, puerto}]), un hilo cada uno, todos con
    la misma política (la red se carga una vez y se comparte). Empiezan escalonados `escalon` s, para que cada uno vea ya el
    objetivo de los anteriores. Devuelve los resúmenes en el orden de la lista (con «nombre»)."""
    elegir = politica(nombre, ruta) if nombre != "azar" else None  # el azar, uno por hilo
    res = [None] * len(lista)

    def uno(k, p):
        time.sleep(k * escalon)
        res[k] = episodio(nombre, segundos, diario, jsonl, f"{etiqueta}{p['nombre']}", ruta, p["puerto"], elegir)
        res[k]["nombre"] = p["nombre"]
    hilos = [threading.Thread(target=uno, args=(k, p)) for k, p in enumerate(lista)]
    for h in hilos:
        h.start()
    for h in hilos:
        h.join()
    return res


def linea_diario(res):
    junto = f", junto al jugador {100 * res['junto']:.0f} % (media {res['jugador_medio']} bloques)" if res.get("jugador_medio") is not None else ""
    huidas = f", {res['huidas']} huidas" if res.get("huidas") else ""
    cofre = (f", {res['depositos'][1]} veces al cofre ({res['segundos_cofre']} s, guardó {res['depositado']})"
             if res.get("depositos") and res["depositos"][1] else "")
    return (f"- {res['etiqueta'] or time.strftime('%H:%M')} · {res['politica']}/{res.get('perfil')}: +{res['troncos']} troncos en "
            f"{res['segundos']} s{junto}{huidas}{cofre}, {res['decisiones']} decisiones: {res['secuencia']}")


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("--politica", default="red", choices=["red", "guion", "guion_solo", "azar"])
    ap.add_argument("--perfil", help="perfil de perfiles/*.json para el bot (si no, el que tenga)")
    ap.add_argument("--segundos", type=float, default=300)
    ap.add_argument("--diario", default="resumen", choices=["resumen", "completo", "no"])
    ap.add_argument("--jsonl", default=str(AQUI / "ejecuciones" / f"ejecutor-{time.strftime('%Y%m%d-%H%M')}.jsonl"))
    ap.add_argument("--ruta", default=str(AQUI / "politica_habilidades.json"))
    ap.add_argument("--puerto", type=int, default=3001, help="puerto de control del personaje")
    ap.add_argument("--nombre", help="nombre del personaje (por defecto, el que dice el bot en ese puerto)")
    ap.add_argument("--personajes", help="varios a la vez, un hilo cada uno: NOMBRE[:PUERTO[:PERFIL]],…")
    ap.add_argument("--escalon", type=float, default=1.5, help="s entre el arranque de un personaje y el siguiente")
    a = ap.parse_args()
    Path(a.jsonl).parent.mkdir(exist_ok=True)
    PUERTO = a.puerto
    lista = personajes(a.personajes) if a.personajes else [{"nombre": a.nombre or nombre_de(a.puerto), "puerto": a.puerto, "perfil": a.perfil}]
    for p in lista:
        if p["perfil"] or a.perfil:
            poner_perfil(p["perfil"] or a.perfil, p["puerto"])
    if a.diario == "resumen":
        anotar(f"## Episodio libre · {a.politica} · {', '.join(p['nombre'] for p in lista)} · {time.strftime('%Y-%m-%d %H:%M')}")
    if len(lista) == 1:
        res = [episodio(a.politica, a.segundos, a.diario, a.jsonl, lista[0]["nombre"] if a.nombre or a.puerto != 3001 else "", a.ruta, a.puerto)]
    else:
        res = en_equipo(lista, a.politica, a.segundos, a.diario, a.jsonl, ruta=a.ruta, escalon=a.escalon)
    for r in res:
        print(json.dumps(r, ensure_ascii=False))
