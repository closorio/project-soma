#!/bin/bash
# Proxy del mundo del usuario (A0 del asistente): ViaProxy en 127.0.0.1:25568 → servidor 26.3 en 25565 (../arrancar.sh antes).
# La primera vez: ./descargar.sh. Arranca en segundo plano (PID en proxy.pid, consola en logs/consola.log) y espera a que el
# puerto escuche. Se niega si ya está en marcha o si el 25568 está ocupado. Se para con ./parar.sh (por PID; nunca pkill -f).
set -u
cd "$(dirname "$0")"
JAVA=${IO_JAVA:-$HOME/.minecraft/runtime/java-runtime-epsilon/linux/java-runtime-epsilon/bin/java}
PIDF=proxy.pid

if [ -f "$PIDF" ]; then
  PID=$(cat "$PIDF")
  if kill -0 "$PID" 2>/dev/null && [ "$(readlink /proc/"$PID"/cwd)" = "$PWD" ]; then echo "ya está en marcha (PID $PID)"; exit 0; fi
  rm -f "$PIDF"
fi
[ -n "$(ss -Hltn 'sport = :25568')" ] && { echo "el puerto 25568 está ocupado por otro proceso: no arranco"; exit 1; }
[ -f ViaProxy.jar ] && [ -f viaproxy.yml ] || { echo "falta ViaProxy.jar o viaproxy.yml: lanza ./descargar.sh"; exit 1; }
[ -n "$(ss -Hltn 'sport = :25565')" ] || echo "AVISO: el servidor 26.3 (25565) no está en marcha: ../arrancar.sh"
mkdir -p logs
setsid nohup "$JAVA" -Xms128M -Xmx512M -jar ViaProxy.jar config viaproxy.yml > logs/consola.log 2>&1 < /dev/null &
echo $! > "$PIDF"
for _ in $(seq 1 30); do
  sleep 1
  kill -0 "$(cat "$PIDF")" 2>/dev/null || { echo "ViaProxy se cerró al arrancar; mira logs/consola.log"; rm -f "$PIDF"; exit 1; }
  [ -n "$(ss -Hltn 'sport = :25568')" ] && { echo "listo: 127.0.0.1:25568 → 25565 (26.3)"; exit 0; }
done
echo "no escucha en 25568 tras 30 s (sigue en marcha, PID $(cat "$PIDF")); mira logs/consola.log"; exit 1
