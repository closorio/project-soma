#!/usr/bin/env python3
"""Serie del ejecutor de F2 en el servidor local: troncos conseguidos por episodio con la red frente al guion (y lo que se pida),
desde los mismos puntos que medir.py (semilla fija) y alternando qué variante sale primero en cada punto.
Variantes = políticas × perfiles (F3: perfiles/*.json). Para comparar perfiles con un «jugador» fijo y repetible, jugador=X,Z
invoca allí un aldeano quieto (NoAI, RCON de prueba) y el bot lo toma como el jugador (orden jugador_prueba); se retira al final.
Entre episodios deja el banco como estaba (RCON de prueba): repone los troncos picados, retira los troncos caídos que quedaron
y quita del inventario de cada personaje lo ganado en el episodio. Para que un inventario casi lleno no falsee la medida, al empezar
cada personaje guarda en el cofre (../cofres.json, habilidad depositar) lo que lleva, y allí se queda; lo que no quepa se aparta como
antes (troncos y huevos, cantidades en ejecutor_apartado.json) y se devuelve al terminar, también si la serie se interrumpe.
Cofre en los episodios: el reflejo de guardar puede saltar (con --umbral-cofre F se adelanta, para probarlo). Antes de cada episodio
se fotografía el cofre (ejecuciones/cofre-episodio.json) y al acabar se comprueba que lo que entró es lo que dicen los personajes
(«cuadra») y se quita (sus troncos se reponen en el árbol, como lo ganado en el inventario). Los troncos guardados cuentan como ganados.
Con --sin-cofre, el reflejo se apaga y todo es como antes.
Arbolado: antes y después de cada episodio, un personaje fotografía los troncos del arbolado de pruebas y la huella de cada zona
protegida (orden arbolado de io.js). Los troncos que falten sin que los picara picar_tronco (el navegador ya no rompe troncos; por si
acaso) se reponen también, fuera de las zonas, y se avisa; si algo cambia dentro de una zona, se avisa (nunca se toca).
No usa puntos de partida dentro de las zonas protegidas por el usuario (../zonas.json, bot/zonas.js; se relee en cada punto).
Personaje: --puerto/--nombre (por defecto Soma en 3001; el nombre, el que dice el bot en ese puerto) para las órdenes RCON.
Varios personajes a la vez (fase D): --equipo Soma:3001:recolector,Eco:3002:cooperativo lleva a todos al mismo punto y les da un
episodio a la vez (un hilo cada uno, la misma red; ejecutor.en_equipo), cada uno con su perfil; las variantes son entonces solo
las políticas. Resume por personaje: troncos, éxito de ir al árbol y de picar, y conflictos (ir al árbol que era objetivo de otro).
Escribe ejecutor_medido.json (y una copia en ejecuciones/) y una línea por episodio y personaje en mente/diario.md.
Uso: medir_ejecutor.py [N=8] [semilla=42] [segundos=300] [politicas=red,guion] [perfiles=recolector] [jugador=X,Z|-]
                       [--puerto 3001] [--nombre Soma] [--equipo NOMBRE[:PUERTO[:PERFIL]],…] [--escalon 1.5] [--excluir X1,Z1,X2,Z2]
                       [--umbral-cofre F|NOMBRE:F,…] [--sin-cofre]"""
import argparse, itertools, json, math, random, re, sys, time
from collections import Counter
from pathlib import Path

import numpy as np

import cofre
import mundo
from ejecutor import AQUI, anotar, en_equipo, en_zona, episodio, linea_diario, nombre_de, orden, personajes, poner_perfil

sys.path.insert(0, str(AQUI.parent / "servidor"))
from rcon import rcon

OW = "execute in minecraft:overworld"
ETIQUETA = "jugador_prueba"
ZONA = None  # rectángulo [X1, Z1, X2, Z2] sin puntos de partida (--excluir)
RECT = mundo.RECT  # arbolado de pruebas, centro ± 64 (en el del usuario, (303, 32): 239, -32, 367, 96): lo que mira la foto
TRONCOS = [f"{e}{m}_log" for e in ("", "stripped_") for m in ("oak", "spruce", "birch", "jungle", "acacia", "dark_oak", "mangrove", "cherry", "pale_oak")]


_FIJOS = itertools.cycle(mundo.PUNTOS) if mundo.PUNTOS else None


def punto():
    """Igual que medir.py: 12-30 bloques del centro del mundo (mundo.py; en el del usuario, el arbolado (303, 32)), sin agua debajo,
    ni dentro de --excluir ni de las zonas protegidas del mundo (zonas.json). Si el mundo tiene puntos fijos (mundo.json: puntos,
    F7.5), los da por orden y vuelve a empezar."""
    if _FIJOS:
        return next(_FIJOS)
    if not mundo.CENTRO:
        raise SystemExit(f"el mundo {mundo.NOMBRE} no tiene centro ni puntos (mundo.json: aparicion, campamento o puntos)")
    cx, cz = mundo.CENTRO
    while True:
        ang, rad = random.uniform(0, 2 * math.pi), random.uniform(12, 30)
        x, z = round(cx + rad * math.cos(ang)), round(cz + rad * math.sin(ang))
        if ZONA and min(ZONA[0], ZONA[2]) <= x <= max(ZONA[0], ZONA[2]) and min(ZONA[1], ZONA[3]) <= z <= max(ZONA[1], ZONA[3]):
            continue
        if not en_zona(x, z) and "passed" not in rcon(f"{OW} positioned {x} 64 {z} positioned over world_surface if block ~ ~-1 ~ water"):
            return x, z


def inventario(puerto):
    c = Counter()
    for n, k in re.findall(r"([a-z_]+)x(\d+)", orden("estado", 10, puerto).split("inventario: ")[-1]):
        c[n] += int(k)
    return c


def tp(p, x, z):
    orden("para", 10, p["puerto"])
    rcon(f"{OW} positioned {x} 64 {z} positioned over motion_blocking_no_leaves run tp {p['nombre']} ~ ~ ~")


def limpiar(picados, ganado):
    """Repone los troncos picados, retira los troncos caídos junto a ellos y quita del inventario de cada uno lo ganado.
    Nunca toca las zonas protegidas por el usuario (../zonas.json): lo picado allí, si lo hubiera, no se repone."""
    fuera = {k: b for k, b in picados.items() if not en_zona(k[0], k[2])}
    if len(fuera) < len(picados):
        print(f"aviso: {len(picados) - len(fuera)} troncos picados dentro de una zona protegida; no se reponen", flush=True)
    picados = fuera
    for (x, y, z), b in picados.items():
        rcon(f"{OW} run setblock {x} {y} {z} minecraft:{b}")
    for (x, y, z), b in picados.items():
        rcon(f'{OW} run kill @e[type=item,x={x},y={y},z={z},distance=..10,nbt={{Item:{{id:"minecraft:{b}"}}}}]')
    for nombre, g in ganado.items():
        for n, c in g.items():
            rcon(f"clear {nombre} minecraft:{n} {c}")


def picados_de(jsonl, etiquetas):
    p = {}
    for linea in open(jsonl):
        d = json.loads(linea)
        r = d["resultado"]
        if d["etiqueta"] in etiquetas and d["habilidad"] == "picar_tronco" and r.get("exito") and r.get("pos"):
            p[tuple(r["pos"])] = r["bloque"]
    return p


def foto_arbolado(p):
    """Troncos del arbolado y huella de cada zona protegida, vistos por el personaje p (orden arbolado de io.js); None si no sabe."""
    try:
        return json.loads(orden("arbolado " + " ".join(map(str, RECT)), 60, p["puerto"]))
    except ValueError:
        return None


# Cambios naturales dentro de las zonas, que no son de los personajes: las ovejas del ESTANQUE comen hierba (hierba → tierra) y la
# hierba vuelve a crecer (visto el 2026-10-14). Se cuentan aparte y no dan aviso.
NATURALES = [{"grass_block", "dirt"}, {"short_grass", "tall_grass", "fern", "large_fern", "air"}]


def natural(cambio):
    """¿Es «x,y,z antes→después» un cambio natural (NATURALES)?"""
    a, b = cambio.split(" ", 1)[1].split("→")
    return any({a, b} <= g for g in NATURALES)


def cambios_columna(x, z, y0, antes, despues):
    """Bloques que cambiaron en una columna de la foto («sand*3,water*2,…» de abajo arriba): ["x,y,z antes→después", …]."""
    def lista(c):
        out = []
        for t in c.split(","):
            n, _, k = t.partition("*")
            out += [n] * int(k or 1)
        return out
    a, b = lista(antes), lista(despues)
    alto = max(len(a), len(b))
    a, b = a + ["air"] * (alto - len(a)), b + ["air"] * (alto - len(b))
    return [f"{x},{y0 + i},{z} {p}→{q}" for i, (p, q) in enumerate(zip(a, b)) if p != q]


def comparar_arbolado(antes, despues, picados):
    """Entre dos fotos del arbolado: los troncos que faltan sin que los picara picar_tronco ({(x, y, z): bloque}), las zonas
    protegidas que cambiaron ({zona: {troncos, bloques: ["x,y,z antes→después", …]}}) y, aparte, los cambios naturales de cada
    zona ({zona: n}; NATURALES). Lo que cae en trozos de mundo sin cargar en alguna foto no se compara."""
    if not antes or not despues:
        return {}, {}, {}
    sin = set(antes["sinCargar"]) | set(despues["sinCargar"])
    trozo = lambda k: f"{k[0] >> 4},{k[2] >> 4}"
    faltan = {tuple(map(int, k.split(","))): b for k, b in antes["troncos"].items() if k not in despues["troncos"]}
    otros = {k: b for k, b in faltan.items() if k not in picados and trozo(k) not in sin}
    cambios, naturales = {}, {}
    for n, z0 in antes["zonas"].items():
        z1 = despues["zonas"].get(n)
        if z1 is None:
            continue
        bloques = [c for k, col in sorted(z0["columnas"].items()) if k in z1["columnas"] and z1["columnas"][k] != col
                   for c in cambios_columna(*map(int, k.split(",")), antes["y"][0], col, z1["columnas"][k])]
        if any(map(natural, bloques)):
            naturales[n] = sum(map(natural, bloques))
        bloques = [c for c in bloques if not natural(c)]
        tr = None if z0["sinCargar"] or z1["sinCargar"] else [z0["troncos"], z1["troncos"]]
        if bloques or (tr and tr[0] != tr[1]):
            cambios[n] = {"troncos": tr, "bloques": bloques[:30], **({"mas": len(bloques) - 30} if len(bloques) > 30 else {})}
    return otros, cambios, naturales


def main():
    global ZONA
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    ap.add_argument("N", nargs="?", type=int, default=8)
    ap.add_argument("semilla", nargs="?", type=int, default=42)
    ap.add_argument("segundos", nargs="?", type=float, default=300)
    ap.add_argument("politicas", nargs="?", default="red,guion")
    ap.add_argument("perfiles", nargs="?", default="recolector")
    ap.add_argument("jugador", nargs="?", default="-")
    ap.add_argument("--puerto", type=int, default=3001)
    ap.add_argument("--nombre")
    ap.add_argument("--equipo", help="varios a la vez: NOMBRE[:PUERTO[:PERFIL]],…")
    ap.add_argument("--escalon", type=float, default=1.5, help="s entre el arranque de un personaje y el siguiente")
    ap.add_argument("--excluir", help="rectángulo X1,Z1,X2,Z2 sin puntos de partida")
    ap.add_argument("--umbral-cofre", help="huecos ocupados (0-1) a partir de los que salta el reflejo de guardar; por personaje: Soma:0.1,Eco:0.05")
    ap.add_argument("--sin-cofre", action="store_true", help="sin cofre: apartar y devolver como antes, y el reflejo apagado")
    a = ap.parse_args()
    ZONA = [int(v) for v in a.excluir.split(",")] if a.excluir else None
    POLITICAS, PERFILES = a.politicas.split(","), a.perfiles.split(",")
    JUGADOR = a.jugador if a.jugador != "-" else None
    equipo = personajes(a.equipo) if a.equipo else [{"nombre": a.nombre or nombre_de(a.puerto), "puerto": a.puerto, "perfil": None}]
    random.seed(a.semilla)
    if "red" in POLITICAS and not (AQUI / "politica_habilidades.json").exists():
        sys.exit("falta politica_habilidades.json: antes, entrenar_habilidades.py")
    for p in equipo:
        if not orden("obs", 10, p["puerto"]).startswith("{"):
            sys.exit(f"el bot {p['nombre']} no responde a obs en 127.0.0.1:{p['puerto']}")
        p["perfil0"] = json.loads(orden("perfil", 10, p["puerto"]))["perfil"]
        try:
            p["cofre0"] = json.loads(orden("cofre", 10, p["puerto"]))
        except ValueError:
            sys.exit(f"el bot {p['nombre']} no conoce la orden cofre: reinicia el bot (node io.js)")
    usar_cofre = bool(cofre.cofres()) and not a.sin_cofre
    for p in equipo:
        if not usar_cofre:
            orden("cofre no", 10, p["puerto"])
        elif a.umbral_cofre:
            por = dict(x.split(":") for x in a.umbral_cofre.split(",") if ":" in x)
            u = por.get(p["nombre"], a.umbral_cofre if ":" not in a.umbral_cofre else None)
            if u is not None:
                orden(f"cofre umbral {float(u)}", 10, p["puerto"])
    al_cofre = guardar_en_cofre(equipo) if usar_cofre else {}
    # lo que no se guardó (sin cofre, o no cupo): apartarlo como antes
    apartado = {p["nombre"]: {n: c for n, c in inventario(p["puerto"]).items() if n.endswith("_log") or n == "egg"} for p in equipo}
    (AQUI / "ejecutor_apartado.json").write_text(json.dumps({**apartado, "_cofre": al_cofre}))  # por si hubiera que devolverlo a mano
    for nombre, cosas in apartado.items():
        for n, c in cosas.items():
            rcon(f"clear {nombre} minecraft:{n} {c}")
    try:
        if JUGADOR:
            jx, jz = map(int, JUGADOR.split(","))
            rcon(f"kill @e[type=minecraft:villager,tag={ETIQUETA}]")
            rcon(f"{OW} positioned {jx} 64 {jz} positioned over motion_blocking_no_leaves run summon minecraft:villager ~ ~ ~ "
                 f"{{NoAI:1b,Silent:1b,Invulnerable:1b,PersistenceRequired:1b,Tags:[\"{ETIQUETA}\"]}}")
            for p in equipo:
                print(orden("jugador_prueba villager", 10, p["puerto"]))
        serie(a.N, a.semilla, a.segundos, POLITICAS, PERFILES, JUGADOR, equipo, a.escalon, bool(a.equipo), usar_cofre)
    finally:
        if JUGADOR:
            rcon(f"kill @e[type=minecraft:villager,tag={ETIQUETA}]")
            for p in equipo:
                orden("jugador_prueba -", 10, p["puerto"])
        for p in equipo:
            poner_perfil(p["perfil0"], p["puerto"])
            c0 = p["cofre0"]
            orden(f"cofre {'si' if c0['activo'] else 'no'}", 10, p["puerto"])
            orden(f"cofre umbral {c0['umbral']}", 10, p["puerto"])
        devolver(apartado)


def guardar_en_cofre(equipo):
    """Al empezar la serie, cada personaje guarda en el cofre lo que lleva (habilidad depositar: conserva herramientas, armas y
    comida). Si no llega andando, se le lleva junto al cofre y lo repite. Se queda en el cofre: al acabar no hay nada que devolver."""
    x, _, z = cofre.cofres()[0]["bloques"][0]
    antes, guardado = cofre.total(cofre.foto()), {}
    for p in equipo:
        r = {}
        for intento in (1, 2):
            try:
                r = json.loads(orden("hab depositar", 200, p["puerto"]))
            except ValueError:
                r = {}
            if (r.get("exito") and not r.get("quedan")) or r.get("causa") == "nada que guardar" or intento == 2:
                break
            tp(p, x, z + 2)
            time.sleep(2)
        guardado[p["nombre"]] = r.get("guardado") or {}
        print(f"{p['nombre']} guarda en el cofre: {r.get('causa')} {guardado[p['nombre']]}"
              + (f" · no cupo {r['quedan']}" if r.get("quedan") else ""), flush=True)
    entro = +(cofre.total(cofre.foto()) - antes)
    todos = +sum((Counter(g) for g in guardado.values()), Counter())
    print(f"en el cofre entró {dict(entro)}: {'cuadra' if entro == todos else '¡NO CUADRA con lo que dicen los personajes: ' + str(dict(todos)) + '!'}",
          flush=True)
    return guardado


def devolver(apartado):
    """Devuelve lo apartado. Antes quita los troncos y huevos que queden (ganados en la serie y recogidos tarde: al empezar se
    apartaron todos), para no llenar el inventario. Si aun así algo no cabe, /give lo deja en el suelo junto al personaje y otro
    personaje lo recogería en la serie siguiente (pasó: +66 troncos de golpe): se retira del suelo y se anota en
    ejecuciones/no_cupo.jsonl, para devolverlo a mano cuando haya sitio."""
    apartado = {k: v for k, v in apartado.items() if not k.startswith("_")}  # «_cofre»: lo guardado en el cofre se queda allí
    for nombre, cosas in apartado.items():
        for n in TRONCOS + ["egg"]:  # solo *_log (como lo apartado), no la madera (*_wood) que también lleva #minecraft:logs
            rcon(f"clear {nombre} minecraft:{n}")
        for n, c in cosas.items():
            for k in range(0, c, 64):  # de pila en pila
                rcon(f"give {nombre} minecraft:{n} {min(64, c - k)}")
        time.sleep(1)
        suelo = {}
        for n in cosas:
            sel = f'@e[type=item,distance=..3,nbt={{Item:{{id:"minecraft:{n}"}}}}]'
            r = rcon(f"{OW} as {nombre} at @s as {sel} run data get entity @s Item.count")
            c = sum(int(v) for v in re.findall(r"entity data: (\d+)", r))
            if c:
                suelo[n] = c
                rcon(f"{OW} as {nombre} at @s run kill {sel}")
        if suelo:
            print(f"aviso: a {nombre} no le cupo {suelo} (retirado del suelo, anotado en ejecuciones/no_cupo.jsonl)", flush=True)
            with open(AQUI / "ejecuciones" / "no_cupo.jsonl", "a") as f:
                f.write(json.dumps({"fecha": time.strftime("%Y-%m-%d %H:%M"), "nombre": nombre, "no_cupo": suelo}) + "\n")
    print("devuelto:", apartado)


def serie(N, SEMILLA, SEG, POLITICAS, PERFILES=("recolector",), JUGADOR=None, equipo=None, escalon=1.5, en_grupo=False, usar_cofre=False):
    jsonl = AQUI / "ejecuciones" / f"serie-{time.strftime('%Y%m%d-%H%M')}.jsonl"
    jsonl.parent.mkdir(exist_ok=True)
    # Un personaje: variantes = políticas × perfiles. Equipo: variantes = políticas, cada personaje con su perfil.
    VARIANTES = [(pol, per) for pol in POLITICAS for per in ([None] if en_grupo else PERFILES)]
    nombre = lambda v: v[0] if en_grupo or len(PERFILES) == 1 else f"{v[0]}/{v[1]}"
    quienes = ", ".join(f"{p['nombre']}" + (f" ({p['perfil'] or p['perfil0']})" if en_grupo else "") for p in equipo)
    anotar(f"## Serie del ejecutor de habilidades · {time.strftime('%Y-%m-%d %H:%M')} ({N} puntos de medir.py, semilla {SEMILLA}; "
           f"{' y '.join(map(nombre, VARIANTES))}, {SEG:.0f} s cada episodio"
           + (f"; a la vez, desde el mismo punto: {quienes}" if en_grupo else (f"; {quienes}" if quienes not in ("Soma", "Io") else ""))
           + (f"; jugador de prueba: aldeano quieto en {JUGADOR}" if JUGADOR else "") + ")")
    puntos = [punto() for _ in range(N)]
    corridas = [(k, p, v) for k, p in enumerate(puntos, 1) for v in (VARIANTES if k % 2 else VARIANTES[::-1])]
    resultados, pendiente = [], ({}, {})
    for k, (x, z), (pol, per) in corridas:
        for p in equipo:
            poner_perfil(per or p["perfil"] or p["perfil0"], p["puerto"])
            tp(p, x, z)
        limpiar(*pendiente)  # lo del episodio anterior, con los personajes ya lejos de esas columnas
        time.sleep(3)
        inv0 = {p["nombre"]: inventario(p["puerto"]) for p in equipo}
        etiqueta = f"p{k} ({x},{z})"
        arbol0 = foto_arbolado(equipo[0])
        foto0 = cofre.foto() if usar_cofre else None
        if foto0 is not None:  # por si la serie se corta: reponer_serie.py --cofre deja el cofre así
            cofre.guardar_foto(foto0, AQUI / "ejecuciones" / "cofre-episodio.json", serie=jsonl.name, etiqueta=etiqueta)
        if en_grupo:
            rs = en_equipo(equipo, pol, SEG, "no", jsonl, etiqueta + " · ", escalon=escalon)
        else:
            rs = [episodio(pol, SEG, diario="no", jsonl=jsonl, etiqueta=etiqueta, puerto=equipo[0]["puerto"])]
            rs[0]["nombre"] = equipo[0]["nombre"]
        ganado = {}
        for p in equipo:  # el inventario, enseguida (como antes): lo que se recoja después no es del episodio
            orden("para", 10, p["puerto"])
            ganado[p["nombre"]] = inventario(p["puerto"]) - inv0[p["nombre"]]  # lo que limpiar() quita del inventario
        picados = picados_de(jsonl, {r["etiqueta"] for r in rs})
        arbol1 = foto_arbolado(equipo[0])
        rotos, en_zonas, naturales = comparar_arbolado(arbol0, arbol1, picados)
        if rotos:
            print(f"{etiqueta} aviso: {len(rotos)} troncos rotos sin picar_tronco (se reponen si están fuera de las zonas): "
                  f"{sorted(rotos)[:8]}", flush=True)
        if en_zonas:
            print(f"{etiqueta} ¡AVISO: cambios dentro de zonas protegidas (no se tocan): {en_zonas}!", flush=True)
        if naturales:
            print(f"{etiqueta} cambios naturales en zonas (ovejas y hierba; sin aviso): {naturales}", flush=True)
        arbol_ep = {"foto": arbol0 is not None and arbol1 is not None, "rotos_sin_picar": [[*k, b] for k, b in sorted(rotos.items())],
                    "zonas": en_zonas, "naturales": naturales}
        cofre_ep = None
        if foto0 is not None:  # lo guardado en el episodio: ¿cuadra con lo que entró en el cofre? y quitarlo (el árbol se repone)
            entro = cofre.aumento(foto0, cofre.foto())
            guardaron = +sum((Counter(r.get("depositado") or {}) for r in rs), Counter())
            quitado, avisos = cofre.quitar_aumento(foto0) if entro else (Counter(), [])
            cofre_ep = {"entro": dict(entro), "guardaron": dict(guardaron), "cuadra": entro == guardaron, "quitado": dict(quitado),
                        "avisos": avisos}
            if entro or guardaron or avisos:
                print(f"{etiqueta} cofre: guardaron {dict(guardaron)} · entró {dict(entro)} · "
                      f"{'cuadra' if cofre_ep['cuadra'] else '¡NO CUADRA!'} · quitado {dict(quitado)}" + (f" · avisos {avisos}" if avisos else ""),
                      flush=True)
        for p, r in zip(equipo, rs):
            r.update(punto=[x, z], ganado=dict(ganado[p["nombre"]] + Counter(r.get("depositado") or {})), variante=nombre((pol, per)),
                     arbolado=arbol_ep, **({"cofre_episodio": cofre_ep} if cofre_ep else {}))
            resultados.append(r)
            anotar(linea_diario(r))
            print(f"{r['etiqueta']} {r['variante']:5s} +{r['troncos']} troncos · junto {r['junto']} · jugador {r['jugador_medio']} · "
                  f"huidas {r['huidas']} · conflictos {r['conflictos']} · {r['decisiones']} decisiones · {r['causas']}"
                  + (f" · cofre {r['depositos'][1]}× {r['segundos_cofre']} s" if r.get("depositos", [0, 0])[1] else ""), flush=True)
        pendiente = ({**picados, **rotos}, ganado)
        medido = {"fecha": time.strftime("%Y-%m-%d %H:%M"), "N": N, "semilla": SEMILLA, "segundos": SEG,
                  "equipo": [{k_: v for k_, v in p.items()} for p in equipo], "a_la_vez": en_grupo, "episodios": resultados}
        (AQUI / "ejecutor_medido.json").write_text(json.dumps(medido, ensure_ascii=False))
        jsonl.with_suffix(".medido.json").write_text(json.dumps(medido, ensure_ascii=False))
    for p in equipo:
        tp(p, *puntos[0])
    limpiar(*pendiente)

    # Resumen por variante y personaje
    claves = [(nombre(v), p["nombre"]) for v in VARIANTES for p in equipo]
    etq = lambda c: c[0] if len(equipo) == 1 else (f"{c[1]}" if len(VARIANTES) == 1 else f"{c[0]}/{c[1]}")
    sel = lambda c, campo: [r[campo] for r in resultados if (r["variante"], r["nombre"]) == c]
    por = {c: [t or 0 for t in sel(c, "troncos")] for c in claves}
    txt = " · ".join(f"{etq(c)} {np.mean(v):.1f} ± {1.96 * np.std(v, ddof=1) / math.sqrt(len(v)):.1f} troncos/episodio ({v})"
                     for c, v in por.items() if len(v) > 1)

    def exito(c, habs):
        e = [sum(r["exitos"].get(h, [0, 0])[i] for r in resultados if (r["variante"], r["nombre"]) == c for h in habs) for i in (0, 1)]
        return f"{e[0]}/{e[1]}"
    txt += " · éxito ir al árbol (contando ir_a_otro_arbol): " + ", ".join(f"{etq(c)} {exito(c, ('ir_a_arbol', 'ir_a_otro_arbol'))}" for c in claves)
    txt += " · éxito picar: " + ", ".join(f"{etq(c)} {exito(c, ('picar_tronco',))}" for c in claves)
    if len(equipo) > 1:
        txt += " · conflictos (ir al árbol objetivo de otro): " + ", ".join(f"{etq(c)} {sum(sel(c, 'conflictos'))}" for c in claves)
        txt += " · ir_a_otro_arbol: " + ", ".join(f"{etq(c)} {sum(r['uso'].get('ir_a_otro_arbol', 0) for r in resultados if (r['variante'], r['nombre']) == c)}" for c in claves)
        for v in VARIANTES:
            tot = [sum(r["troncos"] or 0 for r in resultados if r["variante"] == nombre(v) and r["punto"] == list(pt)) for pt in puntos]
            txt += f" · equipo{' ' + nombre(v) if len(VARIANTES) > 1 else ''} {np.mean(tot):.1f} troncos/punto ({tot})"
    if JUGADOR:
        txt += " · junto al jugador (≤ 6 bloques, % de decisiones): " + ", ".join(
            f"{etq(c)} {100 * np.mean([j or 0 for j in sel(c, 'junto')]):.0f} %" for c in claves)
        txt += " · distancia media al jugador: " + ", ".join(
            f"{etq(c)} {np.mean([j for j in sel(c, 'jugador_medio') if j is not None] or [np.nan]):.1f}" for c in claves)
    txt += " · huidas: " + ", ".join(f"{etq(c)} {sum(sel(c, 'huidas'))}" for c in claves)
    eps_arbol = {(tuple(r["punto"]), r["variante"]): r.get("arbolado") or {} for r in resultados}  # uno por episodio, no por personaje
    if any(a.get("foto") for a in eps_arbol.values()):
        rotos_t = sum(len(a.get("rotos_sin_picar", [])) for a in eps_arbol.values())
        zonas_t = sorted({n for a in eps_arbol.values() for n in a.get("zonas", {})})
        nat = Counter()
        for a in eps_arbol.values():
            nat.update(a.get("naturales") or {})
        txt += (f" · arbolado (foto en {sum(bool(a.get('foto')) for a in eps_arbol.values())}/{len(eps_arbol)} episodios): "
                f"{rotos_t} troncos rotos sin picar, cambios en zonas: {', '.join(zonas_t) or 'ninguno'}"
                + (f" (aparte, naturales: {', '.join(f'{n} {c}' for n, c in sorted(nat.items()))})" if nat else ""))
    viajes = [(r["depositos"][1], r["segundos_cofre"]) for r in resultados if r.get("depositos")]
    if usar_cofre and sum(v for v, _ in viajes):
        eps = {json.dumps(r.get("cofre_episodio"), sort_keys=True) for r in resultados if (r.get("cofre_episodio") or {}).get("entro")}
        cuadran = sum(json.loads(e)["cuadra"] for e in eps)
        txt += (f" · cofre: {sum(v for v, _ in viajes)} viajes ({sum(s for _, s in viajes):.0f} s), por personaje " +
                ", ".join(f"{etq(c)} {sum(r['depositos'][1] for r in resultados if (r['variante'], r['nombre']) == c)}" for c in claves) +
                f"; cuadra en {cuadran}/{len(eps)} episodios con algo guardado")
    if len(claves) == 2 and N > 1:
        d = np.array(por[claves[0]]) - np.array(por[claves[1]])
        txt += f" · {etq(claves[0])} − {etq(claves[1])} por punto {d.mean():+.1f} ± {1.96 * d.std(ddof=1) / math.sqrt(N):.1f} troncos"
    print("RESULTADO: " + txt)
    if txt:
        anotar("Resultado: " + txt + ".")


if __name__ == "__main__":
    main()
