#!/bin/bash
# Guarda el mundo de supervivencia: ./guardar.sh  (save-all flush por RCON)
# Con copia: ./guardar.sh --copia [ETIQUETA]  → copias/mundo-AAAAMMDD-HHMM[-ETIQUETA].tar.gz (con el servidor en marcha,
# pausa el guardado automático mientras copia; parado, copia sin más). F7.5: la copia lleva el mundo y los datos del mundo
# (mundos/supervivencia/: mundo.json, zonas, cofres, obras y diario), con rutas desde la carpeta del proyecto:
# servidor-supervivencia/world/… y mundos/supervivencia/…. Restaurar (con el servidor parado), desde esta carpeta:
#   tar xzf copias/mundo-….tar.gz -C ..      (pisa world/ y mundos/supervivencia/ con lo de la copia)
set -u
cd "$(dirname "$0")"
RCON="python3 ../servidor/rcon.py --servidor supervivencia"
PIDF=servidor.pid
EN_MARCHA=0
[ -f "$PIDF" ] && kill -0 "$(cat "$PIDF")" 2>/dev/null && EN_MARCHA=1

if [ "$EN_MARCHA" = 1 ]; then
  $RCON "save-all flush" > /dev/null || { echo "RCON no responde: no se pudo guardar"; exit 1; }
  echo "guardado"
else
  echo "el servidor está parado (el mundo ya está guardado)"
fi
[ "${1:-}" = "--copia" ] || exit 0
[ -d world ] || { echo "aún no hay mundo (arráncalo una vez con ./arrancar.sh)"; exit 1; }
mkdir -p copias
COPIA="copias/mundo-$(date +%Y%m%d-%H%M)${2:+-$2}.tar.gz"
[ "$EN_MARCHA" = 1 ] && $RCON save-off > /dev/null
tar czf "$COPIA" -C .. servidor-supervivencia/world mundos/supervivencia
[ "$EN_MARCHA" = 1 ] && $RCON save-on > /dev/null
echo "copia: $COPIA ($(du -h "$COPIA" | cut -f1); $(tar tzf "$COPIA" | grep -c '^mundos/supervivencia/.') archivos de mundos/supervivencia)"
