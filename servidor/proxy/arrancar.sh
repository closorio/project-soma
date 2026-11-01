#!/bin/bash
# Proxy del mundo del usuario (A0 del asistente): ViaProxy en 127.0.0.1:25568 → servidor 26.3 en 25565 (../arrancar.sh antes).
# La primera vez: ./descargar.sh. Arranca en segundo plano (PID en proxy.pid, consola en logs/consola.log) y espera a que el
# puerto escuche. Se niega si ya está en marcha o si el 25568 está ocupado. Se para con ./parar.sh (por PID; nunca pkill -f).
# Con «companero» (2026-10-31): el proxy del server 26.3 del compañero, en 25569, con viaproxy-companero.yml (lo escribe
# `make partner-proxy-start` con el destino de mundos/companero/mundo.json), su propio PID y su consola.
set -u
cd "$(dirname "$0")"
JAVA=${IO_JAVA:-$HOME/.minecraft/runtime/java-runtime-epsilon/linux/java-runtime-epsilon/bin/java}
# Con «paper» (2026-11-01): el del Paper local (servidor-paper/), en 25571, igual.
case "${1:-}" in
  companero|paper) PIDF=proxy-$1.pid; CONF=viaproxy-$1.yml; LOG=logs/consola-$1.log
                   PUERTO=$([ "$1" = companero ] && echo 25569 || echo 25571) ;;
  *) PIDF=proxy.pid; CONF=viaproxy.yml; PUERTO=25568; LOG=logs/consola.log ;;
esac

if [ -f "$PIDF" ]; then
  PID=$(cat "$PIDF")
  if kill -0 "$PID" 2>/dev/null && [ "$(readlink /proc/"$PID"/cwd)" = "$PWD" ]; then echo "ya está en marcha (PID $PID)"; exit 0; fi
  rm -f "$PIDF"
fi
[ -n "$(ss -Hltn "sport = :$PUERTO")" ] && { echo "el puerto $PUERTO está ocupado por otro proceso: no arranco"; exit 1; }
[ -f ViaProxy.jar ] && [ -f "$CONF" ] || { echo "falta ViaProxy.jar o $CONF: lanza ./descargar.sh (o make partner-proxy-start)"; exit 1; }
[ "$PUERTO" != 25568 ] || [ -n "$(ss -Hltn 'sport = :25565')" ] || echo "AVISO: el servidor 26.3 (25565) no está en marcha: ../arrancar.sh"
mkdir -p logs
setsid nohup "$JAVA" -Xms128M -Xmx512M -jar ViaProxy.jar config "$CONF" > "$LOG" 2>&1 < /dev/null &
echo $! > "$PIDF"
for _ in $(seq 1 30); do
  sleep 1
  kill -0 "$(cat "$PIDF")" 2>/dev/null || { echo "ViaProxy se cerró al arrancar; mira servidor/proxy/$LOG"; rm -f "$PIDF"; exit 1; }
  [ -n "$(ss -Hltn "sport = :$PUERTO")" ] && { echo "listo: 127.0.0.1:$PUERTO → $(sed -n 's/^target-address: //p' "$CONF") (26.3)"; exit 0; }
done
echo "no escucha en $PUERTO tras 30 s (sigue en marcha, PID $(cat "$PIDF")); mira servidor/proxy/$LOG"; exit 1
