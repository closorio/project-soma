#!/usr/bin/env python3
"""Preparación del mundo local de F8 (26.1.2; una vez, con el servidor en marcha; la lanza arrancar.sh la primera vez).

- Reglas de los bancos de F8 (PLAN_F8_perfiles.md): pvp apagado, monstruos encendidos, keep_inventory false (la muerte cuesta
  el inventario) y spawn_phantoms false.
- Dificultad normal.
- Punto de aparición junto a árboles: si el bosque (forest, birch_forest o flower_forest) más cercano está a más de
  24 bloques, lo mueve allí (setworldspawn sobre el suelo).
- Apunta semilla, punto de aparición y bosque en mundos/local/mundo.json (sin claves; conserva servidor, rcon, campamento y
  puntos) y deja la marca .preparado.
Uso: python3 preparar.py [--forzar]   (--forzar: aunque ya exista .preparado)
"""
import json, re, sys, time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "servidor"))
from rcon import rcon

OW = "execute in minecraft:overworld"
BOSQUES = ("minecraft:forest", "minecraft:birch_forest", "minecraft:flower_forest")
CERCA = 24  # bloques: más lejos que esto, se mueve el punto de aparición
MUNDO = AQUI.parent / "mundos" / "local" / "mundo.json"

def r(cmd):
    return rcon(cmd, servidor="local")

def aparicion():
    """(x, y, z) del punto de aparición, leído de un marcador puesto en `~ ~ ~` (las órdenes por RCON se ejecutan allí)."""
    r("forceload add ~ ~")  # en 1.21.11 ya no hay chunks de aparición siempre cargados
    # Recién marcado, el chunk tarda en cargar sus entidades: un marcador invocado antes no lo encuentran ni `data get` ni `kill`
    # (en el primer arranque real quedó uno suelto). Espera, y repite la lectura hasta encontrarlo.
    time.sleep(2)
    r(f"{OW} run summon minecraft:marker ~ ~ ~ {{Tags:[\"lab_aparicion\"]}}")
    for _ in range(10):
        pos = r("data get entity @e[type=minecraft:marker,tag=lab_aparicion,limit=1] Pos")
        if "entity data" in pos:
            break
        time.sleep(0.5)
    r("kill @e[type=minecraft:marker,tag=lab_aparicion]")
    r("forceload remove ~ ~")
    m = re.findall(r"(-?[\d.]+)d", pos)
    return tuple(int(float(v)) for v in m[:3]) if len(m) >= 3 else None

def bosque_cercano():
    """(bioma, x, z, distancia) del bosque más cercano al punto de aparición, o None."""
    mejor = None
    for b in BOSQUES:
        texto = r(f"locate biome {b}")
        CRUDO[b] = texto  # va a mundo.json, por si el formato de la respuesta no es el esperado
        m = re.search(r"\[(-?\d+), [^,]+, (-?\d+)\] \((\d+) blocks? away\)", texto)
        if m and (mejor is None or int(m[3]) < mejor[3]):
            mejor = (b, int(m[1]), int(m[2]), int(m[3]))
    return mejor

CRUDO = {}

def main():
    if (AQUI / ".preparado").exists() and "--forzar" not in sys.argv:
        print("ya estaba preparado (--forzar para repetir)")
        return
    hechos = [r("gamerule pvp false"), r("gamerule spawn_monsters true"), r("gamerule keep_inventory false"),
              r("gamerule spawn_phantoms false"), r("difficulty normal")]
    semilla = re.search(r"\[(-?\d+)\]", r("seed"))
    antes = aparicion()
    bosque = bosque_cercano()
    movido = False
    if bosque and bosque[3] > CERCA:
        _, x, z, _ = bosque
        r(f"forceload add {x} {z}")
        time.sleep(2)
        r(f"{OW} positioned {x} 0 {z} positioned over motion_blocking_no_leaves run setworldspawn ~ ~ ~")
        r(f"forceload remove {x} {z}")
        movido = True
    despues = aparicion()
    datos = {
        "semilla": int(semilla[1]) if semilla else None,
        "aparicion_original": antes, "aparicion": despues, "movida_al_bosque": movido,
        "bosque_mas_cercano": {"bioma": bosque[0], "x": bosque[1], "z": bosque[2], "distancia": bosque[3]} if bosque else None,
        "reglas": hechos, "locate": CRUDO, "fecha": time.strftime("%Y-%m-%d %H:%M"),
    }
    previo = json.loads(MUNDO.read_text()) if MUNDO.exists() else {}
    MUNDO.write_text(json.dumps({**previo, **datos}, ensure_ascii=False, indent=1) + "\n")
    (AQUI / ".preparado").write_text(datos["fecha"] + "\n")
    print(f"preparado: semilla {datos['semilla']}, aparición {despues}" + (f" (movida desde {antes} a un {bosque[0]})" if movido else "")
          + (f"; bosque más cercano a {bosque[3]} bloques" if bosque else "; sin bosque cerca"))

if __name__ == "__main__":
    main()
