#!/bin/bash
# Para el servidor del mundo del usuario (26.3): guarda (save-all flush) y lo cierra por RCON (stop); si RCON no responde,
# kill PID (el servidor guarda al recibir SIGTERM). Solo toca el PID de servidor.pid y solo si es este servidor
# (java con server.jar y la carpeta de trabajo esta): nunca pkill -f ni otros servidores.
set -u
cd "$(dirname "$0")"
RCON="python3 rcon.py --servidor usuario"
PIDF=servidor.pid

[ -f "$PIDF" ] || { echo "no hay servidor.pid: no está en marcha"; exit 0; }
PID=$(cat "$PIDF")
if ! kill -0 "$PID" 2>/dev/null; then echo "no está en marcha (PID $PID ya no existe)"; rm -f "$PIDF"; exit 0; fi
if [ "$(readlink /proc/"$PID"/cwd)" != "$PWD" ] || ! tr '\0' ' ' < /proc/"$PID"/cmdline | grep -q 'server.jar'; then
  echo "el PID $PID no es este servidor: no lo toco"; exit 1
fi

if $RCON "save-all flush" > /dev/null 2>&1 && $RCON stop > /dev/null 2>&1; then
  echo "guardado; cerrando (PID $PID)…"
else
  echo "RCON no responde: kill $PID (guarda al cerrarse)"; kill "$PID"
fi
for _ in $(seq 1 60); do
  kill -0 "$PID" 2>/dev/null || { rm -f "$PIDF"; echo "parado"; exit 0; }
  sleep 1
done
echo "sigue en marcha tras 60 s (PID $PID): espera o mira logs/consola.log"; exit 1
