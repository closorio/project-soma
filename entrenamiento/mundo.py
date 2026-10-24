"""Mundo de Minecraft en el que trabajan las herramientas de entrenamiento/ (F7.0): un solo punto de resolución, como bot/mundo.js.
IO_SERVIDOR (la misma variable que servidor/rcon.py y bot/io.js): sin valor o «usuario», el mundo pacífico del usuario (25565);
«supervivencia», el mundo de pruebas aparte (../servidor-supervivencia, 25566); «companero», el server Java de un compañero por wifi
(2026-10-23; host, puerto y versión en mundos/companero/mundo.json: `servidor`; sin RCON todavía).
Datos de cada mundo en ../mundos/<nombre>/: zonas.json, cofres.json, obras.json, diario.md y, en el de supervivencia, mundo.json
(semilla, aparición y bosque de preparar.py; campamento y puntos de partida los escribe F7.5). En mundos/usuario/ son enlaces a los
archivos de siempre (../zonas.json…, ../mente/diario.md): cada ruta se resuelve al archivo real, para que escribir no rompa el enlace.
Si falta el enlace, el mundo del usuario vuelve a su archivo de siempre; el de supervivencia nunca lee ni escribe nada del usuario.
Puntos de partida: en el del usuario, alrededor del arbolado de pruebas (303, 32); en el otro, la lista «puntos» de mundo.json o,
mientras no la haya, alrededor del campamento o de la aparición."""
import json, os
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
MUNDOS = {"usuario": {"puerto_mc": 25565, "centro": (303, 32)}, "supervivencia": {"puerto_mc": 25566, "centro": None},
          "companero": {"puerto_mc": None, "centro": None}}  # puerto_mc None: el de mundo.json: servidor.puerto
HEREDADOS = {"zonas.json": RAIZ / "zonas.json", "cofres.json": RAIZ / "cofres.json", "obras.json": RAIZ / "obras.json",
             "diario.md": RAIZ / "mente" / "diario.md"}  # solo para el mundo del usuario
NOMBRE = os.environ.get("IO_SERVIDOR") or "usuario"
if NOMBRE not in MUNDOS:
    raise SystemExit(f"IO_SERVIDOR desconocido: {NOMBRE!r} (usuario, supervivencia o companero)")
CARPETA = RAIZ / "mundos" / NOMBRE
SUFIJO = "" if NOMBRE == "usuario" else "-" + NOMBRE  # el del usuario conserva los nombres de siempre (modos-AAAAMMDD.jsonl)


def ruta(archivo):
    """Ruta real de un archivo de datos de este mundo (sigue los enlaces)."""
    p = CARPETA / archivo
    if p.exists():
        return p.resolve()
    return HEREDADOS[archivo] if NOMBRE == "usuario" and archivo in HEREDADOS else p


DIARIO, ZONAS, COFRES, OBRAS = (ruta(n) for n in ("diario.md", "zonas.json", "cofres.json", "obras.json"))
MUNDO_JSON = ruta("mundo.json")  # en el de supervivencia y en el del compañero


def datos():
    """mundo.json ({} si no hay: el del usuario no tiene)."""
    try:
        return json.loads(MUNDO_JSON.read_text())
    except (OSError, ValueError):
        return {}


def _servidor():
    """Host y puerto de Minecraft: fijos en MUNDOS o, en el del compañero, el `servidor` de su mundo.json (host None si falta)."""
    sv = datos().get("servidor") or {}
    puerto = MUNDOS[NOMBRE]["puerto_mc"] or int(sv.get("puerto") or 25565)
    return (sv.get("host") or "localhost") if MUNDOS[NOMBRE]["puerto_mc"] else sv.get("host"), puerto


HOST_MC, PUERTO_MC = _servidor()


def _xz(p):
    """[x, z] o [x, y, z] → (x, z)."""
    return (round(p[0]), round(p[-1])) if p else None


def _centro():
    if MUNDOS[NOMBRE]["centro"]:
        return MUNDOS[NOMBRE]["centro"]
    d = datos()
    return _xz(d.get("campamento")) or _xz(d.get("aparicion"))


CENTRO = _centro()  # (x, z) del que salen los puntos de partida al azar; None si el mundo aún no tiene mundo.json
PUNTOS = [_xz(p) for p in datos().get("puntos", [])]  # puntos de partida fijos (F7.5); vacío: al azar alrededor de CENTRO
RECT = (CENTRO[0] - 64, CENTRO[1] - 64, CENTRO[0] + 64, CENTRO[1] + 64) if CENTRO else None  # lo que mira la foto del arbolado


def modos(dia):
    """Registro de decisiones del bot de ese día (AAAAMMDD), el que escribe bot/registro.js."""
    return Path(__file__).resolve().parent / "ejecuciones" / f"modos{SUFIJO}-{dia}.jsonl"


if __name__ == "__main__":
    print(json.dumps({"mundo": NOMBRE, "host_mc": HOST_MC, "puerto_mc": PUERTO_MC, "carpeta": str(CARPETA), "diario": str(DIARIO), "zonas": str(ZONAS),
                      "cofres": str(COFRES), "obras": str(OBRAS), "mundo_json": str(MUNDO_JSON) if MUNDO_JSON.exists() else None,
                      "centro": CENTRO, "puntos": PUNTOS, "rect": RECT}, ensure_ascii=False, indent=1))
