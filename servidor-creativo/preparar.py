#!/usr/bin/env python3
"""Preparación del mundo creativo (26.1.2; una vez, con el servidor en marcha; la lanza arrancar.sh la primera vez).

Para mirar las obras del catálogo sin estorbos: siempre de día, sin lluvia, sin bichos, sin pvp y pacífico. Deja la marca
.preparado. Uso: python3 preparar.py [--forzar]   (--forzar: aunque ya exista .preparado)
"""
import sys, time
from pathlib import Path

AQUI = Path(__file__).resolve().parent
sys.path.insert(0, str(AQUI.parent / "servidor"))
from rcon import rcon

def main():
    if (AQUI / ".preparado").exists() and "--forzar" not in sys.argv:
        print("ya preparado (--forzar para repetir)"); return
    for cmd in ("gamerule advance_time false", "gamerule advance_weather false", "gamerule spawn_mobs false",
                "gamerule spawn_monsters false", "gamerule pvp false", "time set day", "weather clear", "difficulty peaceful"):
        print(cmd, "→", rcon(cmd, servidor="creativo").strip()[:80])
    (AQUI / ".preparado").write_text(time.strftime("%Y-%m-%d %H:%M") + "\n")

if __name__ == "__main__":
    main()
