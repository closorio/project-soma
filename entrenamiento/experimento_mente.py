#!/usr/bin/env python3
"""F6 · ¿Aporta la mente? Mismo punto de partida y misma duración, dos condiciones: «cuerpo» (el personaje solo, en modo libre con un
perfil fijo) y «mente» (una sesión de Claude Code fijando metas con mente/alma/mente.py mientras este guion mide). Tareas:
  T1  madera: troncos ganados en --segundos (600) desde un punto del arbolado (se espera empate: la mente no debe estorbar).
  T2  cabaña: solo tiene sentido con la mente (el cuerpo solo no sabe): segundos hasta que obras.json tenga una cabaña terminada,
      bloques puestos y troncos gastados. Para el cuerpo solo se apunta 0 sin medir.
  T3  atasco: desde la esquina sureste del HOGAR (323,25), segundos hasta el primer tronco ganado (--segundos 180).
Métricas comunes: troncos (inventario + guardados en el cofre), bloques recorridos (posición cada 2 s por el puerto), decisiones y
órdenes del personaje en ese tramo (entrenamiento/ejecuciones/modos-AAAAMMDD.jsonl), fallos por habilidad.
Criterio (fijado antes de medir): la mente «aporta» si cumple T2 y T3 (termina la cabaña; sale del atasco antes que el cuerpo
solo o cuando el cuerpo solo no sale) y en T1 no baja más de un 10 % frente al cuerpo solo (media de las réplicas).
Entre ejecuciones repone los troncos que falten en el arbolado (fotos antes y después, como medir_ejecutor.py; nunca dentro de
las zonas) y quita del inventario lo ganado; lo guardado en el cofre se apunta y no se toca. El reflejo del cofre se apaga en
T1 y T3 (y se restaura). Uso:
  experimento_mente.py cuerpo --tarea T1|T3 [--punto X,Z] [--segundos N] [--perfil recolector] [--puerto 3004] [--replica k]
  experimento_mente.py mente  --tarea T1|T2|T3 [--punto X,Z] [--segundos N] [--puerto 3004] [--replica k]
      (prepara el punto y espera: en otra terminal, la sesión de Claude Code, la mente de Alma, juega con mente.py; el guion acaba a los --segundos)
  experimento_mente.py resumen [RUTA]"""
import argparse, json, re, sys, threading, time
from collections import Counter
from pathlib import Path

import medir_ejecutor as me
import mundo
from ejecutor import AQUI, nombre_de, orden

PUNTOS = {"T1": (295, 22), "T2": None, "T3": (323, 25)}  # T1: el primer punto de medir_ejecutor (semilla 42); T2 lo elige la mente
SEGUNDOS = {"T1": 600, "T2": 1500, "T3": 180}
SALIDA = AQUI / "ejecuciones" / f"experimento_mente-{time.strftime('%Y%m%d')}.json"
OBRAS = mundo.OBRAS  # el del mundo de IO_SERVIDOR (mundo.py)
MODOS = lambda: mundo.modos(time.strftime('%Y%m%d'))


def troncos_de(puerto):
    inv = me.inventario(puerto)
    guardados = 0
    try:
        guardados = json.loads(orden("cofre", 10, puerto))["guardados"]
    except (ValueError, KeyError):
        pass
    return sum(n for k, n in inv.items() if k.endswith("_log")), guardados, inv


def posicion(puerto):
    m = re.search(r"pos \((-?\d+), (-?\d+), (-?\d+)\)", orden("estado", 10, puerto))
    return tuple(map(int, m.groups())) if m else None


class Vigia(threading.Thread):
    """Posición cada 2 s (distancia recorrida) y el segundo en que entra el primer tronco."""
    def __init__(self, puerto, troncos0):
        super().__init__(daemon=True)
        self.puerto, self.troncos0, self.distancia, self.primer_tronco, self.parar = puerto, troncos0, 0.0, None, False
        self.t0 = time.time()

    def run(self):
        ant = posicion(self.puerto)
        while not self.parar:
            time.sleep(2)
            p = posicion(self.puerto)
            if p and ant:
                self.distancia += ((p[0] - ant[0]) ** 2 + (p[2] - ant[2]) ** 2) ** 0.5
            ant = p or ant
            if self.primer_tronco is None and sum(troncos_de(self.puerto)[:2]) > self.troncos0:
                self.primer_tronco = round(time.time() - self.t0, 1)


def actividad(nombre, t0, t1):
    """Decisiones, órdenes y fallos del personaje entre t0 y t1 (ISO) en el jsonl de modos de hoy."""
    dec, ords, fallos = 0, 0, Counter()
    try:
        for linea in open(MODOS()):
            d = json.loads(linea)
            if d.get("personaje") != nombre or not (t0 <= d["t"] <= t1):
                continue
            if d["tipo"] == "decision":
                dec += 1
                if not d["exito"]:
                    fallos[f"{d['habilidad']}|{d['causa'].split(':')[0]}"] += 1
            elif d["tipo"] == "orden":
                ords += 1
                for p in d.get("pasos", []):
                    if not p.get("exito"):
                        fallos[f"{p['habilidad']}|{str(p.get('causa', '')).split(':')[0]}"] += 1
    except OSError:
        pass
    return dec, ords, dict(fallos.most_common(6))


def cabana_desde(t0):
    try:
        obras = json.loads(OBRAS.read_text())["obras"]
    except (OSError, ValueError, KeyError):
        return None
    for o in reversed(obras):
        if o["plano"].startswith("cabana") and o["inicio"] >= t0:
            return {"id": o["id"], "estado": o["estado"], "bloques": len(o["bloques"]), "inicio": o["inicio"], "fin": o["fin"]}
    return None


def ejecutar(a):
    p = {"nombre": nombre_de(a.puerto, "Alma"), "puerto": a.puerto}
    punto = tuple(map(int, a.punto.split(","))) if a.punto else PUNTOS[a.tarea]
    segundos = a.segundos or SEGUNDOS[a.tarea]
    if a.condicion == "cuerpo" and a.tarea == "T2":
        raise SystemExit("T2 con el cuerpo solo no se mide: el cuerpo no sabe construir (se apunta 0)")
    orden("para", 10, a.puerto)
    if punto:
        me.tp(p, *punto)
        time.sleep(2)
    cofre_antes = json.loads(orden("cofre", 10, a.puerto))
    if a.tarea in ("T1", "T3"):
        orden("cofre no", 10, a.puerto)
    foto0 = me.foto_arbolado(p)
    inv0 = me.inventario(a.puerto)
    tr0, g0, _ = troncos_de(a.puerto)
    t0 = time.time()
    iso0 = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(t0))
    vig = Vigia(a.puerto, tr0 + g0)
    vig.start()
    if a.condicion == "cuerpo":
        orden(f"perfil {a.perfil}", 10, a.puerto)
        orden("obs inicio 300", 10, a.puerto)
        print(orden("modo libre despues quieto", 10, a.puerto), flush=True)
    else:
        print(f"LISTO: {p['nombre']} en {posicion(a.puerto)}. Lanza ahora la mente (mente.py inicio --minutos {segundos / 60:.0f} …) con la tarea {a.tarea}. "
              f"Mido {segundos} s desde ahora.", flush=True)
    fin_cabana = None
    while time.time() - t0 < segundos:
        time.sleep(5)
        if a.tarea == "T3" and vig.primer_tronco is not None and a.condicion == "cuerpo":
            break
        if a.tarea == "T2":
            c = cabana_desde(time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t0)))
            if c and c["estado"] == "terminada":
                fin_cabana = round(time.time() - t0); break
    vig.parar = True
    orden("modo ordenes despues quieto", 10, a.puerto)
    orden("orden quedate", 20, a.puerto)
    time.sleep(2)
    t1 = time.time()
    iso1 = time.strftime("%Y-%m-%dT%H:%M:%S", time.gmtime(t1))
    tr1, g1, inv1 = troncos_de(a.puerto)
    foto1 = me.foto_arbolado(p)
    dec, ords, fallos = actividad(p["nombre"], iso0, iso1)
    faltan, cambios, naturales = me.comparar_arbolado(foto0, foto1, {})
    fila = {"tarea": a.tarea, "condicion": a.condicion, "replica": a.replica, "punto": punto, "segundos": round(t1 - t0), "perfil": a.perfil if a.condicion == "cuerpo" else None,
            "troncos": (tr1 + g1) - (tr0 + g0), "guardados": g1 - g0, "distancia": round(vig.distancia, 1), "primer_tronco_s": vig.primer_tronco,
            "decisiones": dec, "ordenes": ords, "fallos": fallos, "cabana": cabana_desde(time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t0))) if a.tarea == "T2" else None,
            "cabana_s": fin_cabana, "troncos_repuestos": len(faltan), "cambios_zonas": {k: v.get("troncos") for k, v in cambios.items()},
            "inicio": time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(t0)), "fin": time.strftime("%H:%M:%S", time.localtime(t1))}
    # dejar el banco como estaba: reponer los troncos que faltan (fuera de las zonas) y quitar lo ganado del inventario
    ganado = {p["nombre"]: {k: inv1[k] - inv0.get(k, 0) for k in inv1 if inv1[k] > inv0.get(k, 0)}}
    if a.tarea != "T2":
        me.limpiar(faltan, ganado)
    if cofre_antes.get("activo", True):
        orden("cofre si", 10, a.puerto)
    datos = json.loads(SALIDA.read_text()) if SALIDA.exists() else []
    datos.append(fila)
    SALIDA.write_text(json.dumps(datos, ensure_ascii=False, indent=1))
    print(json.dumps(fila, ensure_ascii=False), flush=True)
    if cambios:
        print(f"¡AVISO: cambios dentro de zonas protegidas (no se tocan): {cambios}", flush=True)


def resumen(ruta):
    datos = json.loads(Path(ruta).read_text())
    por = {}
    for f in datos:
        por.setdefault((f["tarea"], f["condicion"]), []).append(f)
    media = lambda xs: sum(xs) / len(xs) if xs else float("nan")
    print("tarea  condición  n  troncos   distancia  primer tronco (s)  cabaña (s)  decisiones/órdenes")
    for (t, c), fs in sorted(por.items()):
        pt = [f["primer_tronco_s"] for f in fs if f["primer_tronco_s"] is not None]
        cb = [f["cabana_s"] for f in fs if f.get("cabana_s") is not None]
        print(f"{t:5}  {c:9}  {len(fs)}  {media([f['troncos'] for f in fs]):6.1f}   {media([f['distancia'] for f in fs]):8.0f}  "
              f"{(f'{media(pt):.0f} ({len(pt)}/{len(fs)} salieron)' if pt else ('ninguno salió' if t == 'T3' else '-')):>22}  "
              f"{(f'{media(cb):.0f}' if cb else '-'):>10}  {media([f['decisiones'] for f in fs]):.0f}/{media([f['ordenes'] for f in fs]):.0f}")
    t1c, t1m = por.get(("T1", "cuerpo"), []), por.get(("T1", "mente"), [])
    if t1c and t1m:
        mc, mm = media([f["troncos"] for f in t1c]), media([f["troncos"] for f in t1m])
        print(f"T1: mente/cuerpo = {mm / mc:.2f} → {'no estorba (≥ 0,9)' if mm >= 0.9 * mc else 'ESTORBA (< 0,9)'}")
    t3c, t3m = por.get(("T3", "cuerpo"), []), por.get(("T3", "mente"), [])
    if t3m:
        sc = [f["primer_tronco_s"] for f in t3c if f["primer_tronco_s"] is not None]
        sm = [f["primer_tronco_s"] for f in t3m if f["primer_tronco_s"] is not None]
        print(f"T3: cuerpo sale {len(sc)}/{len(t3c)} ({media(sc):.0f} s), mente sale {len(sm)}/{len(t3m)} ({media(sm):.0f} s)" if sc or sm else "T3: nadie salió")
    t2 = por.get(("T2", "mente"), [])
    if t2:
        ok = [f for f in t2 if f.get("cabana_s") is not None]
        print(f"T2: cabaña terminada en {len(ok)}/{len(t2)} ({media([f['cabana_s'] for f in ok]):.0f} s de media)" if ok else f"T2: ninguna cabaña terminada en {len(t2)}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    for c in ("cuerpo", "mente"):
        p = sub.add_parser(c)
        p.add_argument("--tarea", choices=["T1", "T2", "T3"], required=True)
        p.add_argument("--punto"); p.add_argument("--segundos", type=int); p.add_argument("--perfil", default="recolector")
        p.add_argument("--puerto", type=int, default=3004); p.add_argument("--replica", type=int, default=0)
    p = sub.add_parser("resumen"); p.add_argument("ruta", nargs="?", default=str(SALIDA))
    a = ap.parse_args()
    if a.cmd == "resumen":
        resumen(a.ruta)
    else:
        a.condicion = a.cmd
        ejecutar(a)


if __name__ == "__main__":
    main()
