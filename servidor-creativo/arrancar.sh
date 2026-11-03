#!/bin/bash
# Mundo creativo (2026-11-02): servidor Minecraft 26.1.2 propio para probar en el juego las obras del catálogo (bot/estructuras/),
# aparte del mundo local de F8 (servidor-local/). Puerto 25573 y RCON 25583, solo 127.0.0.1, offline, creativo forzado, plano,
# pacífico. La primera vez: ./descargar.sh. Arranca en segundo plano (PID en servidor.pid, consola en logs/consola.log), espera a
# que esté listo y, la primera vez, prepara el mundo (preparar.py: siempre de día, sin lluvia ni bichos). Se niega si ya está en
# marcha, si el puerto 25573 está ocupado o si hay menos de 3 GB de memoria disponible (MINIMO_MB=… cambia el umbral).
# Se para con ./parar.sh (por PID; nunca pkill -f).
set -u
cd "$(dirname "$0")"
JAVA=${IO_JAVA:-$HOME/.minecraft/runtime/java-runtime-epsilon/linux/java-runtime-epsilon/bin/java}  # Java 25: lo pide 26.1.2
RCON="python3 ../servidor/rcon.py --servidor creativo"
PIDF=servidor.pid
MINIMO_MB=${MINIMO_MB:-3072}

if [ -f "$PIDF" ]; then
  PID=$(cat "$PIDF")
  if kill -0 "$PID" 2>/dev/null && [ "$(readlink /proc/"$PID"/cwd)" = "$PWD" ]; then
    echo "ya está en marcha (PID $PID)"; exit 0
  fi
  rm -f "$PIDF"
fi
if [ -n "$(ss -Hltn 'sport = :25573')" ]; then
  echo "el puerto 25573 está ocupado por otro proceso: no arranco"; exit 1
fi
LIBRE=$(awk '/^MemAvailable:/ {print int($2/1024)}' /proc/meminfo)
if [ "$LIBRE" -lt "$MINIMO_MB" ]; then
  echo "solo hay $LIBRE MB de memoria disponible (hacen falta $MINIMO_MB): no arranco"; exit 1
fi

[ -f server.jar ] && [ -f server.properties ] || { echo "falta server.jar o server.properties: lanza ./descargar.sh"; exit 1; }
[ -x "$JAVA" ] || { echo "no encuentro Java 25 en $JAVA (IO_JAVA=… para otro)"; exit 1; }
chmod 600 server.properties
mkdir -p logs
setsid nohup "$JAVA" -Xms512M -Xmx2G -jar server.jar nogui > logs/consola.log 2>&1 < /dev/null &
echo $! > "$PIDF"
echo "arrancando (PID $!; $LIBRE MB disponibles)…"

for _ in $(seq 1 120); do  # hasta 4 min: la primera vez genera el mundo
  sleep 2
  if ! kill -0 "$(cat "$PIDF")" 2>/dev/null; then
    echo "el servidor se cerró al arrancar; mira logs/consola.log"; rm -f "$PIDF"; exit 1
  fi
  if grep -q 'Done (' logs/consola.log && $RCON list > /dev/null 2>&1; then
    chmod 600 server.properties  # el servidor lo reescribe al arrancar; la clave RCON no debe quedar legible
    if [ ! -f .preparado ]; then python3 preparar.py || echo "AVISO: preparar.py falló; vuelve a lanzarlo con el servidor en marcha"; fi
    echo "listo: 127.0.0.1:25573 (RCON 25583)"; exit 0
  fi
done
echo "no terminó de arrancar en 4 min (sigue en marcha, PID $(cat "$PIDF")); mira logs/consola.log"; exit 1
