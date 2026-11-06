#!/usr/bin/env python3
"""Perfiles v2 (roles de F8, PLAN_F8_perfiles.md): carga, resolución y validación en seco. Gemelo de bot/perfil_v2.js: las dos
dan la misma lista de etapas resuelta y los mismos errores (lo comprueba bot/probar_perfiles_seco.js).

Un rol (perfiles/v2/<rol>.json) elige etapas del catálogo común (perfiles/v2/_etapas.json) por id y puede cambiar sus campos;
También puede incluir submodos (perfiles/v2/submodos/<nombre>.json), que se componen al cargar: el capataz solo ve la lista plana
(conocimiento/decisiones/2026-11-05-arquitectura-de-roles.md). resolver() junta todo. validar() mira: el esquema del rol, que los estilos sean perfiles v1 que existen, los pesos dentro
de [0, _escala], que cada etapa exista, que pre y objetivo usen claves del estado del catálogo, que cada paso de `hacer` sea una
acción conocida (o «pendiente:…», lo que aún no existe) y que la cadena cierre: cada `pre` la cumple lo que dan las etapas de
antes (sin ciclos, en el orden del rol).
Uso: perfiles_v2.py --comprobar        (todos los roles; sale con 1 si hay errores)
     perfiles_v2.py --json             (roles resueltos y errores en JSON, para la prueba de JS)"""
import json
import re
import sys
from pathlib import Path

DIR = Path(__file__).resolve().parent.parent / "perfiles"
DIR_V2 = DIR / "v2"
PESOS_V2 = ["madera", "seguridad", "tiempo", "supervivencia", "progreso", "riesgo"]
TIPOS = ["madera", "fabricar", "mineral", "comida", "construir", "explorar", "dimension", "combate"]
NOCHE = ["refugio", "aprovechar_con_luz"]
COFRE = ["base", "no"]
POR_DEFECTO = {"pre": {}, "max_s": 600, "repetir": False}
DIR_SUB = DIR_V2 / "submodos"
NIVELES_MAX = 4
MADUREZ = ["borrador", "funciona", "medido", "aceptado"]
DUENOS = ["seppuq", "count"]
CAMPOS = ("id", "tipo", "pre", "objetivo", "hacer", "max_s", "repetir")


def _leer_submodos():
    return {f.stem: json.loads(f.read_text(encoding="utf-8")) for f in sorted(DIR_SUB.glob("*.json"))}


def catalogo():
    return {**json.loads((DIR_V2 / "_etapas.json").read_text(encoding="utf-8")), "submodos": _leer_submodos()}


def roles():
    return sorted(f.stem for f in DIR_V2.glob("*.json") if not f.stem.startswith("_"))


def cargar(nombre):
    return json.loads((DIR_V2 / f"{nombre}.json").read_text(encoding="utf-8"))


def _resolver_etapa(e, cat):
    r = {**POR_DEFECTO, **cat["etapas"].get(e.get("id"), {}), **e}
    return {k: r.get(k) for k in CAMPOS}


def _desplegar(lista, ruta, cat, errores, incluidos):
    """Despliega una lista de etapas y submodos. Precedencia: catálogo < submodo < «cambia» de quien lo incluye."""
    origen = " → ".join(["rol", *ruta])
    out = []
    for e in lista or []:
        if e.get("submodo") is None:
            out.append({**e, "_origen": origen})
            continue
        n = e["submodo"]
        camino = " → ".join([*ruta, n])
        if n in ruta:
            errores.append(f"submodo {camino}: ciclo")
            continue
        if len(ruta) >= NIVELES_MAX:
            errores.append(f"submodo {camino}: más de {NIVELES_MAX} niveles")
            continue
        sub = cat.get("submodos", {}).get(n)
        if not sub:
            errores.append(f"{origen}: el submodo «{n}» no existe")
            continue
        if n not in incluidos:
            incluidos.append(n)
        dentro = _desplegar(sub.get("etapas"), [*ruta, n], cat, errores, incluidos)
        cambia = e.get("cambia") or {}
        for i in cambia:
            if not any(x.get("id") == i for x in dentro):
                errores.append(f"{origen}: cambia.{i} no es una etapa de {n}")
        out += [{**x, **cambia[x.get("id")], "id": x.get("id")} if cambia.get(x.get("id")) else x for x in dentro]
    return out


def _componer(rol, cat):
    """La lista plana, más lo que se rompió al componerla. Una etapa que llega por dos caminos: si llega igual se queda la primera;
    si llega distinta es un error. Dos veces en la misma lista no se junta: es la «etapa repetida» de validar."""
    errores, incluidos, etapas, vistas = [], [], [], {}
    for e in _desplegar(rol.get("etapas"), [], cat, errores, incluidos):
        antes = vistas.get(e.get("id"))
        if antes is None:
            vistas[e.get("id")] = e
            etapas.append(e)
        elif antes["_origen"] == e["_origen"]:
            etapas.append(e)
        elif _resolver_etapa(antes, cat) != _resolver_etapa(e, cat):
            errores.append(f"etapa {e.get('id')}: llega distinta desde «{antes['_origen']}» y desde «{e['_origen']}»")
    return etapas, errores, incluidos


def resolver(rol, cat):
    """Las etapas del rol con los campos del catálogo, en orden: [{id, tipo, pre, objetivo, hacer, max_s, repetir}]."""
    return [_resolver_etapa(e, cat) for e in _componer(rol, cat)[0]]


def _condicion(c, cat, donde, errores):
    if not isinstance(c, dict):
        errores.append(f"{donde}: no es un objeto")
        return
    for seccion, valores in c.items():
        if seccion not in cat["estado"]:
            errores.append(f"{donde}: sección desconocida «{seccion}»")
            continue
        for k, v in valores.items():
            if k not in cat["estado"][seccion]:
                errores.append(f"{donde}: {seccion}.{k} no está en el estado del catálogo")
            elif seccion == "inv" and not (isinstance(v, (int, float)) and not isinstance(v, bool) and v > 0):
                errores.append(f"{donde}: {seccion}.{k} debe ser un número > 0")
            elif seccion != "inv" and v is not True:
                errores.append(f"{donde}: {seccion}.{k} debe ser true")


def _cumple(pre, dado):
    """Lo que falta de `pre` con lo que ya han dado las etapas anteriores (inv: el máximo dado; memoria e hitos: si se dieron)."""
    falta = []
    for seccion, valores in pre.items():
        for k, v in valores.items():
            if seccion == "inv":
                if dado["inv"].get(k, 0) < v:
                    falta.append(f"{seccion}.{k}={v:g}")
            elif k not in dado[seccion]:
                falta.append(f"{seccion}.{k}")
    return falta


def validar(rol, cat, nombre=None, v1=None, escala=None):
    errores = []
    v1 = sorted(f.stem for f in DIR.glob("*.json") if not f.stem.startswith("_")) if v1 is None else v1
    escala = json.loads((DIR / "_escala.json").read_text(encoding="utf-8")) if escala is None else escala
    if rol.get("v") != 2:
        errores.append("v debe ser 2")
    if nombre and rol.get("nombre") != nombre:
        errores.append(f"nombre «{rol.get('nombre')}» no es el del archivo ({nombre})")
    if not isinstance(rol.get("identidad"), str) or not rol.get("identidad"):
        errores.append("falta identidad")
    if not isinstance(rol.get("sirve_a"), list):
        errores.append("sirve_a debe ser una lista")
    estilos = rol.get("estilos") or {}
    for k in ("madera", "noche"):
        if estilos.get(k) not in v1:
            errores.append(f"estilos.{k}: «{estilos.get(k)}» no es un perfil v1 ({', '.join(v1)})")
    pesos = rol.get("pesos") or {}
    for k in PESOS_V2:
        p = pesos.get(k)
        if not isinstance(p, (int, float)) or isinstance(p, bool):
            errores.append(f"pesos.{k}: falta o no es un número")
        elif not 0 <= p <= escala.get(k, 0):
            errores.append(f"pesos.{k}={p:g} fuera de [0, {escala.get(k, 0):g}] (_escala.json)")  # :g, como escribe los números JS
    for k in pesos:
        if k not in PESOS_V2:
            errores.append(f"pesos.{k}: peso desconocido")
    reglas = rol.get("reglas") or {}
    if reglas.get("noche") not in NOCHE:
        errores.append(f"reglas.noche: «{reglas.get('noche')}» ({', '.join(NOCHE)})")
    if not (isinstance(reglas.get("y_min"), int) and -64 <= reglas["y_min"] <= 320):
        errores.append("reglas.y_min: entero en [-64, 320]")
    if reglas.get("cofre") not in COFRE:
        errores.append(f"reglas.cofre: «{reglas.get('cofre')}» ({', '.join(COFRE)})")
    etapas, de_componer, incluidos = _componer(rol, cat)
    ids = [e.get("id") for e in etapas]
    if not ids:
        errores.append("sin etapas")
    for i in sorted({i for i in ids if ids.count(i) > 1}, key=str):
        errores.append(f"etapa {i} repetida")
    errores += de_componer
    for n in incluidos:
        sub = cat["submodos"][n]
        exige = (sub.get("exige") or {}).get("y_min")
        if isinstance(exige, int) and isinstance(reglas.get("y_min"), int) and reglas["y_min"] > exige:
            errores.append(f"submodo {n}: exige y_min ≤ {exige} y el rol tiene {reglas['y_min']}")
        if rol.get("madurez") == "aceptado" and sub.get("madurez") != "aceptado":
            errores.append(f"madurez: el rol no puede estar aceptado con {n} sin aceptar")
    dado = {"inv": {}, "memoria": set(), "hitos": set()}
    for e in resolver(rol, cat):
        donde = f"etapa {e['id']}"
        if e["id"] not in cat["etapas"]:
            errores.append(f"{donde}: no está en el catálogo")
            continue
        if e["tipo"] not in TIPOS:
            errores.append(f"{donde}: tipo «{e['tipo']}» ({', '.join(TIPOS)})")
        _condicion(e["pre"], cat, donde + " (pre)", errores)
        if not e["objetivo"]:
            errores.append(f"{donde}: sin objetivo")
        _condicion(e["objetivo"] or {}, cat, donde + " (objetivo)", errores)
        if not isinstance(e["hacer"], list) or not e["hacer"]:
            errores.append(f"{donde}: hacer debe ser una lista no vacía")
        else:
            for paso in e["hacer"]:
                accion = paso.split()[0] if isinstance(paso, str) and paso.strip() else ""
                if not accion.startswith("pendiente:") and accion not in cat["acciones"]:
                    errores.append(f"{donde}: «{paso}» no es una acción conocida (ni pendiente:)")
        if not (isinstance(e["max_s"], int) and not isinstance(e["max_s"], bool) and e["max_s"] > 0):
            errores.append(f"{donde}: max_s debe ser un entero > 0")
        if not isinstance(e["repetir"], bool):
            errores.append(f"{donde}: repetir debe ser true o false")
        if isinstance(e["pre"], dict):
            for f in _cumple(e["pre"], dado):
                errores.append(f"{donde}: pre {f} no lo da ninguna etapa anterior")
        for seccion, valores in (e["objetivo"] or {}).items():
            for k, v in valores.items():
                if seccion == "inv" and isinstance(v, (int, float)):
                    dado["inv"][k] = max(dado["inv"].get(k, 0), v)
                elif seccion in ("memoria", "hitos"):
                    dado[seccion].add(k)
    return errores


def validar_submodo(nombre, cat):
    """El manifiesto de un submodo. La cadena de `pre` se comprueba en los roles que lo incluyen, sobre su lista plana."""
    sub, errores = cat["submodos"][nombre], []
    if sub.get("v") != 2:
        errores.append("v debe ser 2")
    if sub.get("nombre") != nombre:
        errores.append(f"nombre: no es el del archivo ({nombre})")
    if not isinstance(sub.get("identidad"), str) or not sub.get("identidad"):
        errores.append("falta identidad")
    if sub.get("dueno") not in DUENOS:
        errores.append(f"dueno: debe ser {' o '.join(DUENOS)}")
    if not re.fullmatch(r"E[0-9]", str(sub.get("epica"))):
        errores.append("epica: debe ser E0-E9")
    if sub.get("madurez") not in MADUREZ:
        errores.append(f"madurez: debe ser {', '.join(MADUREZ)}")
    if not sub.get("etapas") and not sub.get("servicio"):
        errores.append("sin etapas ni servicio")
    for k in sub.get("exige") or {}:
        if k != "y_min":
            errores.append(f"exige.{k}: solo se entiende y_min")
    if "y_min" in (sub.get("exige") or {}) and not isinstance(sub["exige"]["y_min"], int):
        errores.append("exige.y_min: debe ser un entero")
    etapas, de_componer, incluidos = _componer({"etapas": [{"submodo": nombre}]}, cat)
    errores += de_componer
    for e in etapas:
        if e.get("id") not in cat["etapas"]:
            errores.append(f"etapa {e.get('id')}: no está en el catálogo")
    for n in incluidos:
        if n != nombre and sub.get("madurez") == "aceptado" and cat["submodos"][n].get("madurez") != "aceptado":
            errores.append(f"madurez: no puede estar aceptado con {n} sin aceptar")
    return errores


def todo_submodos():
    cat = catalogo()
    return {n: validar_submodo(n, cat) for n in cat["submodos"]}


def todo():
    cat = catalogo()
    return {n: {"etapas": resolver(cargar(n), cat), "errores": validar(cargar(n), cat, n)} for n in roles()}


def main():
    if "--json" in sys.argv:
        print(json.dumps(todo(), ensure_ascii=False))
        return
    if "--comprobar" not in sys.argv:
        sys.exit(__doc__)
    malos = 0
    for n, r in todo().items():
        print(f"{n}: {len(r['etapas'])} etapas, " + ("bien" if not r["errores"] else f"{len(r['errores'])} errores"))
        for e in r["errores"]:
            print("  " + e)
        malos += bool(r["errores"])
    for n, errores in todo_submodos().items():
        print(f"submodo {n}: " + ("bien" if not errores else f"{len(errores)} errores"))
        for e in errores:
            print("  " + e)
        malos += bool(errores)
    sys.exit(1 if malos else 0)


if __name__ == "__main__":
    main()
