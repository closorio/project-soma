#!/bin/bash
# Primera vez del Paper local (2026-11-01): baja Paper 26.3 (build estable de la API oficial, sha256 comprobado) y escribe
# server.properties (127.0.0.1:25570, RCON 25580 con clave nueva, offline, sin lista blanca, normal, sin pausa; permisos 600).
# Sirve para reproducir lo que pasa en el server Paper del compañero (los bots no avanzan) y leer su consola. Luego: ./arrancar.sh
set -u
cd "$(dirname "$0")"
URL=https://fill-data.papermc.io/v1/objects/4ebaf5c9da98c654bb8f17245799943dfb05a285830be4307bfdf7bc9ca024bf/paper-26.3-235.jar
SHA256=4ebaf5c9da98c654bb8f17245799943dfb05a285830be4307bfdf7bc9ca024bf

if [ -f server.jar ] && [ "$(sha256sum server.jar | cut -d' ' -f1)" = "$SHA256" ]; then
  echo "server.jar (Paper 26.3-235) ya está"
else
  curl -fL --retry 3 -o server.jar.tmp "$URL" || { echo "no se pudo bajar el jar"; rm -f server.jar.tmp; exit 1; }
  if [ "$(sha256sum server.jar.tmp | cut -d' ' -f1)" != "$SHA256" ]; then
    echo "el sha256 del jar no coincide: lo borro"; rm -f server.jar.tmp; exit 1
  fi
  mv server.jar.tmp server.jar
  echo "server.jar (Paper 26.3-235) bajado ($(du -h server.jar | cut -f1))"
fi

if [ -f server.properties ]; then
  echo "server.properties ya existe: no lo toco"
else
  umask 077
  CLAVE=$(python3 -c "import secrets; print(secrets.token_urlsafe(24))")
  cat > server.properties <<FIN
server-ip=127.0.0.1
server-port=25570
online-mode=false
white-list=false
enforce-whitelist=false
enable-rcon=true
rcon.port=25580
rcon.password=$CLAVE
broadcast-rcon-to-ops=false
difficulty=normal
gamemode=survival
level-name=world
motd=project-soma: Paper local
max-players=8
view-distance=8
simulation-distance=8
spawn-protection=0
enable-command-block=false
pause-when-empty-seconds=0
FIN
  chmod 600 server.properties
  echo "server.properties escrito (clave RCON nueva; permisos 600)"
fi
[ -f eula.txt ] || echo "eula=true" > eula.txt
