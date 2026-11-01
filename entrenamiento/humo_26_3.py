#!/usr/bin/env python3
"""Puerta A0 del asistente (PLAN_asistente.md): ¿Soma trabaja en el mundo del usuario en 26.3, a través de ViaProxy?
Hace falta: servidor/ y servidor/proxy/ en marcha, y Soma conectado (make assistant: puerto 3001, modo órdenes).
Criterio fijado antes de medir: pasan todas estas pruebas.
  conexión: ≥ 10 min seguidos sin expulsión ni desconexión
  caminar:  ≥ 90 bloques en horizontal con explorar
  picar:    ≥ 10 bloques
  poner:    5/5 de tierra, comprobados por RCON
  cofre:    poner un cofre, guardar y sacar
  mesa:     poner una mesa y fabricar un pico de piedra
  cama:     dormir de noche y amanecer
Se mide el protocolo a través de ViaProxy, no las reglas del mundo ni el combate. Por eso, mientras dura:
  - Soma va con spreadplayers a la llanura más cercana (`locate biome plains`; `--centro X Z` cambia el sitio), el terreno
    donde explorar dio 10/10 en E0. Ahí camina; el resto de pruebas se hace en una plataforma de hierba de 21×21 a y=200
    sobre ese sitio (sin tocar el terreno: al acabar se borra entera), cada una en su trozo y con su material;
  - obras.json lleva un rectángulo de obras temporal de 48×48 alrededor (en el mundo del usuario solo se pica y se pone
    dentro de él), y cofres.json registra el cofre de la prueba;
  - dificultad pacífica (sin monstruos que corten las habilidades por «amenaza») y `players_sleeping_percentage 0`.
Al acabar, pase lo que pase, devuelve obras.json, cofres.json, la dificultad y la regla a como estaban, y borra la
plataforma con todo lo que se puso en ella.
Escribe entrenamiento/ejecuciones/humo-26-3-<fecha>.json (formato «pruebas» de conocimiento/herramientas/experimento.py).
Uso: python entrenamiento/humo_26_3.py [--minutos 10] [--puerto 3001]"""
import argparse, json, math, re, sys, time, urllib.parse, urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ / "servidor"))
from rcon import rcon  # noqa: E402

NOMBRE = "Soma"
LOG = RAIZ / "servidor-supervivencia" / "logs" / "bots-usuario.log"
CORTES = re.compile(r"\[mc\] (expulsado|desconectado|error)")


def r(c):
    return rcon(c, servidor="usuario")


def orden(puerto, c, t=200):
    try:
        return urllib.request.urlopen(f"http://127.0.0.1:{puerto}/?c=" + urllib.parse.quote(c), timeout=t).read().decode().strip()
    except Exception as e:
        return f"sin respuesta: {e}"


def hab(puerto, c, t=200):
    s = orden(puerto, "hab " + c, t)
    try:
        return json.loads(s)
    except ValueError:
        return {"exito": False, "causa": s[:200]}


def pos():
    m = re.search(r"\[(-?[\d.]+)d, (-?[\d.]+)d, (-?[\d.]+)d\]", r(f"data get entity {NOMBRE} Pos"))
    return tuple(float(v) for v in m.groups()) if m else None


def cuantos(item):  # «clear X item 0» cuenta sin quitar nada
    m = re.search(r"Found (\d+)", r(f"clear {NOMBRE} {item} 0"))
    return int(m.group(1)) if m else 0


def conectado():
    return NOMBRE in r("list")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--minutos", type=float, default=10)
    ap.add_argument("--puerto", type=int, default=3001)
    ap.add_argument("--centro", type=int, nargs=2, metavar=("X", "Z"))
    a = ap.parse_args()
    P = a.puerto
    for _ in range(30):
        if conectado():
            break
        time.sleep(2)
    else:
        print("Soma no está en el servidor: make user-server-start proxy-start assistant")
        return 1
    t0, desde = time.time(), (LOG.stat().st_size if LOG.exists() else 0)
    pruebas = []

    def anota(nombre, pasa, detalle):
        pruebas.append({"nombre": nombre, "pasa": bool(pasa), "detalle": detalle})
        print(("SÍ " if pasa else "NO ") + nombre + ": " + detalle, flush=True)

    obras_f, cofres_f = (RAIZ / "mundos" / "usuario" / "obras.json").resolve(), (RAIZ / "mundos" / "usuario" / "cofres.json").resolve()
    copia = {f: f.read_text(encoding="utf-8") for f in (obras_f, cofres_f)}
    dificultad = (re.search(r"difficulty is (\w+)", r("difficulty")) or [None, "normal"])[1].lower()
    sueno = (re.search(r"set to (\d+)", r("gamerule players_sleeping_percentage")) or [None, "100"])[1]
    puestos_mundo = []
    try:
        return prueba(P, a, t0, desde, pruebas, anota, obras_f, puestos_mundo)
    finally:
        for f, t in copia.items():
            f.write_text(t, encoding="utf-8")
        for b in puestos_mundo:
            r("fill %d %d %d %d %d %d air" % b[1:] if b[0] == "fill" else "setblock %d %d %d air" % b)
        r(f"difficulty {dificultad}")
        r(f"gamerule players_sleeping_percentage {sueno}")
        r(f"effect clear {NOMBRE}")
        print(f"restaurado: obras.json, cofres.json, dificultad {dificultad}, sueño {sueno} %, {len(puestos_mundo)} bloques quitados")


def prueba(P, a, t0, desde, pruebas, anota, obras_f, puestos_mundo):
    if a.centro:
        cx, cz = a.centro
    else:
        m = None
        for bioma in ("plains", "meadow", "forest", "savanna"):
            m = re.search(r"\[(-?\d+), [~\d-]+, (-?\d+)\]", r(f"locate biome minecraft:{bioma}"))
            if m:
                break
        cx, cz = (int(m.group(1)), int(m.group(2))) if m else (0, 0)
    al_sitio = lambda: r(f"spreadplayers {cx} {cz} 1 30 false {NOMBRE}")
    r("difficulty peaceful")
    al_sitio(); time.sleep(3)
    p = pos()
    bx, by, bz = int(p[0]), int(p[1]), int(p[2])
    volver = lambda: r(f"tp {NOMBRE} {bx + 0.5} {by} {bz + 0.5}")
    Y = 200  # la plataforma: suelo en Y - 1, aire encima
    puestos_mundo.append(("fill", bx - 10, Y - 1, bz - 10, bx + 10, Y + 4, bz + 10))
    en = lambda dx, dz: (r(f"tp {NOMBRE} {bx + dx + 0.5} {Y} {bz + dz + 0.5}"), time.sleep(2))  # su trozo de plataforma
    dar = lambda *cosas: [r(f"give {NOMBRE} {c}") for c in cosas]
    print(f"sitio de la prueba: {bx} {by} {bz}", flush=True)
    d = json.loads(obras_f.read_text(encoding="utf-8"))
    d["permitido"] = {"x1": bx - 24, "z1": bz - 24, "x2": bx + 24, "z2": bz + 24, "nota": "TEMPORAL: humo_26_3.py (se restaura al acabar)"}
    obras_f.write_text(json.dumps(d, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    for c in ("time set day", "weather clear", f"effect give {NOMBRE} resistance 1200 4 true", f"clear {NOMBRE}",
              f"give {NOMBRE} stone_pickaxe", f"give {NOMBRE} oak_planks 64", f"give {NOMBRE} cobblestone 3",
              f"give {NOMBRE} chest", f"give {NOMBRE} crafting_table", f"give {NOMBRE} white_bed",
              f"give {NOMBRE} dirt 16", f"give {NOMBRE} bread 8"):
        r(c)
    d, rumbos = 0, []
    for rumbo in ("este", "oeste", "norte", "sur"):  # el primero que tenga 100 bloques de tierra firme
        volver(); time.sleep(2)
        p0 = pos()
        e = hab(P, f"explorar {rumbo} 100 180", 220)
        p1 = pos()
        d = math.hypot(p1[0] - p0[0], p1[2] - p0[2]) if p0 and p1 else 0
        rumbos.append(f"{rumbo} {d:.0f} ({e.get('causa')})")
        if d >= 90:
            break
    anota("caminar", d >= 90, "; ".join(rumbos))
    r(f"fill {bx - 10} {Y} {bz - 10} {bx + 10} {Y + 4} {bz + 10} air")
    r(f"fill {bx - 10} {Y - 1} {bz - 10} {bx + 10} {Y - 1} {bz + 10} grass_block")
    en(0, -8)
    rotos, causas = 0, []
    for bloque in ("grass_block", "dirt", "sand"):  # lo que haya a mano: hierba, tierra o arena del desierto
        if rotos >= 10:
            break
        m = hab(P, f"minar {bloque} {10 - rotos} 6")
        rotos += len(m.get("rotos") or [])
        causas.append(f"{bloque}: {m.get('causa')}")
    anota("picar", rotos >= 10, f"{rotos} rotos ({'; '.join(causas)})")

    en(0, 0)
    puestos = 0
    for _ in range(5):
        q = hab(P, "poner dirt")
        p = q.get("pos")
        if q.get("exito") and p:
            puestos_mundo.append(tuple(p))
            if "passed" in r(f"execute if block {p[0]} {p[1]} {p[2]} minecraft:dirt"):
                puestos += 1
    anota("poner", puestos == 5, f"{puestos}/5 comprobados por RCON")

    en(10, 0)
    dar("chest")
    c = hab(P, "poner chest")
    if c.get("pos"):
        puestos_mundo.append(tuple(c["pos"]))
    antes = cuantos("dirt")
    g = hab(P, "depositar")
    medio = cuantos("dirt")
    s = hab(P, "sacar_del_cofre dirt 2")
    despues = cuantos("dirt")
    anota("cofre", bool(c.get("exito") and g.get("exito") and s.get("exito") and medio < antes and despues > medio),
          f"poner {c.get('causa')}; tierra {antes} → guardar {medio} → sacar {despues}")

    en(-10, 0)
    dar("crafting_table", "cobblestone 3", "oak_planks 4")
    picos = cuantos("stone_pickaxe")
    t = hab(P, "poner crafting_table")
    if t.get("pos"):
        puestos_mundo.append(tuple(t["pos"]))
    f = hab(P, "fabricar pico_piedra")
    anota("mesa", bool(t.get("exito") and cuantos("stone_pickaxe") > picos),
          f"poner {t.get('causa')}; fabricar {f.get('causa')}; picos {picos} → {cuantos('stone_pickaxe')}")

    en(0, 12)
    dar("white_bed")
    r("gamerule players_sleeping_percentage 0")
    r("time set 13000")
    time.sleep(2)
    z = hab(P, "dormir 120", 200)
    anota("cama", bool(z.get("exito")), str(z.get("causa")))
    r("time set day")
    volver()  # de vuelta al suelo antes de borrar la plataforma

    falta = t0 + a.minutos * 60 - time.time()
    if falta > 0:
        print(f"espero {falta:.0f} s para completar {a.minutos:g} min conectado…", flush=True)
        time.sleep(falta)
    texto = LOG.read_text(encoding="utf-8", errors="replace")[desde:] if LOG.exists() else ""
    cortes = [l for l in texto.splitlines() if CORTES.search(l)]
    minutos = (time.time() - t0) / 60
    anota("conexión", conectado() and not cortes,
          f"{minutos:.1f} min; {len(cortes)} cortes" + (f" (primero: {cortes[0][-120:]})" if cortes else ""))
    fecha = time.strftime("%Y-%m-%d %H:%M")
    datos = {"tipo": "puerta", "puerta": "A0", "titulo": "humo 26.3 por ViaProxy", "fecha": fecha, "entorno": "minecraft 26.3",
             "politica": "habilidades por el puerto", "N": len(pruebas), "pruebas": pruebas,
             "pasa": all(p["pasa"] for p in pruebas), "minutos": round(minutos, 1)}
    sal = RAIZ / "entrenamiento" / "ejecuciones" / f"humo-26-3-{time.strftime('%Y%m%d-%H%M')}.json"
    sal.parent.mkdir(parents=True, exist_ok=True)
    sal.write_text(json.dumps(datos, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"{'PASA' if datos['pasa'] else 'NO PASA'} la puerta A0 ({sum(p['pasa'] for p in pruebas)}/{len(pruebas)}): {sal}")
    return 0 if datos["pasa"] else 2


if __name__ == "__main__":
    sys.exit(main())
