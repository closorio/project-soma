#!/bin/bash
# Para el proxy del mundo del usuario: solo el PID de proxy.pid y solo si es ViaProxy con la carpeta de trabajo esta.
set -u
cd "$(dirname "$0")"
PIDF=proxy.pid
[ -f "$PIDF" ] || { echo "no hay proxy.pid: no está en marcha"; exit 0; }
PID=$(cat "$PIDF")
kill -0 "$PID" 2>/dev/null || { echo "no está en marcha (PID $PID ya no existe)"; rm -f "$PIDF"; exit 0; }
if [ "$(readlink /proc/"$PID"/cwd)" != "$PWD" ] || ! tr '\0' ' ' < /proc/"$PID"/cmdline | grep -q 'ViaProxy.jar'; then
  echo "el PID $PID no es este proxy: no lo toco"; exit 1
fi
kill "$PID"
for _ in $(seq 1 20); do kill -0 "$PID" 2>/dev/null || { rm -f "$PIDF"; echo "proxy parado"; exit 0; }; sleep 1; done
echo "sigue en marcha tras 20 s (PID $PID)"; exit 1
