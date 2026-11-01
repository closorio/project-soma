#!/usr/bin/env python3
"""Puerta A0 del asistente (PLAN_asistente.md): ¿Soma trabaja en el mundo del usuario en 26.3, a través de ViaProxy?
Hace falta: servidor/ y servidor/proxy/ en marcha, y Soma conectado (make assistant: puerto 3001, modo órdenes).
Criterio fijado antes de medir: pasan todas estas pruebas.
  conexión: ≥ 10 min seguidos sin expulsión ni desconexión
  caminar:  ≥ 90 bloques en horizontal con explorar (terreno de verdad, en la llanura más cercana)
  picar:    ≥ 10 bloques
  poner:    5/5 de tierra, comprobados por RCON
  cofre:    poner un cofre, guardar y sacar
  mesa:     poner una mesa y fabricar un pico de piedra
  cama:     dormir de noche y amanecer
Se mide el protocolo, no el terreno ni el combate. Todo menos caminar se hace en una plataforma de arena.py, en pacífico, y
se restaura al acabar (ver entrenamiento/arena.py). El mundo 26.3 va sin límites ("reglas": "libre" en su mundo.json):
cofres.json se devuelve como estaba, porque la prueba registra en él su cofre.
Uso: python entrenamiento/humo_26_3.py [--minutos 10] [--puerto 3001] [--centro X Z]"""
import argparse, math, re, sys, time
from pathlib import Path

from arena import RAIZ, Mundo, Sesion, guardar

LOG = RAIZ / "servidor-supervivencia" / "logs" / "bots-usuario.log"
CORTES = re.compile(r"\[mc\] (expulsado|desconectado|error)")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--minutos", type=float, default=10)
    ap.add_argument("--puerto", type=int, default=3001)
    ap.add_argument("--centro", type=int, nargs=2, metavar=("X", "Z"))
    a = ap.parse_args()
    m = Mundo("usuario", "Soma", a.puerto)
    if not m.esperar_conectado():
        print("Soma no está en el servidor: make user-server-start proxy-start assistant")
        return 1
    desde = LOG.stat().st_size if LOG.exists() else 0
    with Sesion(m, ficheros=[RAIZ / "mundos" / "usuario" / "cofres.json", RAIZ / "mundos" / "usuario" / "obras.json"]) as s:
        bx, by, bz = s.suelo_firme(*(a.centro or (None, None)))
        print(f"sitio de la prueba: {bx} {by} {bz}", flush=True)
        m.r(f"clear {m.personaje}")
        m.dar("stone_pickaxe", "bread 8")

        d, rumbos = 0, []
        for rumbo in ("este", "oeste", "norte", "sur"):  # el primero con 100 bloques de tierra firme
            m.tp(bx, by, bz)
            p0 = m.pos()
            e = m.hab(f"explorar {rumbo} 100 180", 220)
            p1 = m.pos()
            d = math.hypot(p1[0] - p0[0], p1[2] - p0[2]) if p0 and p1 else 0
            rumbos.append(f"{rumbo} {d:.0f} ({e.get('causa')})")
            if d >= 90:
                break
        s.anota("caminar", d >= 90, "; ".join(rumbos))

        s.plataforma()
        s.en(0, -8)
        r = m.hab("minar grass_block 10 6")
        rotos = len(r.get("rotos") or [])
        s.anota("picar", rotos >= 10, f"{rotos} rotos ({r.get('causa')})")

        s.en(0, 0)
        m.dar("dirt 16")
        puestos = 0
        for _ in range(5):
            q = m.hab("poner dirt")
            p = q.get("pos")
            if q.get("exito") and p and "passed" in m.r(f"execute if block {p[0]} {p[1]} {p[2]} minecraft:dirt"):
                puestos += 1
        s.anota("poner", puestos == 5, f"{puestos}/5 comprobados por RCON")

        s.en(8, 0)
        m.dar("chest")  # depositar se lleva todo lo que no es herramienta ni comida: el material de cada prueba, justo antes
        c = m.hab("poner chest")
        antes = m.cuantos("dirt")
        g = m.hab("depositar")
        medio = m.cuantos("dirt")
        q = m.hab("sacar_del_cofre dirt 2")
        despues = m.cuantos("dirt")
        s.anota("cofre", bool(c.get("exito") and g.get("exito") and q.get("exito") and medio < antes and despues > medio),
                f"poner {c.get('causa')}; tierra {antes} → guardar {medio} → sacar {despues}")

        s.en(-8, 0)
        m.dar("crafting_table", "cobblestone 3", "oak_planks 4")
        picos = m.cuantos("stone_pickaxe")
        t = m.hab("poner crafting_table")
        f = m.hab("fabricar pico_piedra")
        s.anota("mesa", bool(t.get("exito") and m.cuantos("stone_pickaxe") > picos),
                f"poner {t.get('causa')}; fabricar {f.get('causa')}; picos {picos} → {m.cuantos('stone_pickaxe')}")

        s.en(0, 8)
        m.dar("white_bed")
        m.r("gamerule players_sleeping_percentage 0")
        m.r("time set 13000")
        time.sleep(2)
        z = m.hab("dormir 120", 200)
        s.anota("cama", bool(z.get("exito")), str(z.get("causa")))
        m.r("time set day")

        falta = s.t0 + a.minutos * 60 - time.time()
        if falta > 0:
            print(f"espero {falta:.0f} s para completar {a.minutos:g} min conectado…", flush=True)
            time.sleep(falta)
        texto = LOG.read_text(encoding="utf-8", errors="replace")[desde:] if LOG.exists() else ""
        cortes = [l for l in texto.splitlines() if CORTES.search(l)]
        minutos = (time.time() - s.t0) / 60
        s.anota("conexión", m.conectado() and not cortes,
                f"{minutos:.1f} min; {len(cortes)} cortes" + (f" (primero: {cortes[0][-120:]})" if cortes else ""))
    datos = s.datos("A0", "humo 26.3 por ViaProxy", "minecraft 26.3")
    guardar(datos, nota=False)  # la nota de A0 ya está en el vault; otra pasada solo deja el JSON
    return 0 if datos["pasa"] else 2


if __name__ == "__main__":
    sys.exit(main())
