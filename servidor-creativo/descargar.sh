#!/bin/bash
# Primera vez del mundo creativo (2026-11-02, obras del catálogo en el juego): copia el server.jar 26.1.2 de servidor-local/ o lo
# baja de Mojang (sha1 comprobado) y escribe server.properties (127.0.0.1:25573, RCON 25583 con una clave nueva, offline, creativo
# forzado, mundo plano sin estructuras, pacífico; permisos 600).
# No pisa un server.properties que ya exista (la clave RCON es la de ese mundo). Luego: ./arrancar.sh
set -u
cd "$(dirname "$0")"
URL=https://piston-data.mojang.com/v1/objects/97ccd4c0ed3f81bbb7bfacddd1090b0c56f9bc51/server.jar
SHA1=97ccd4c0ed3f81bbb7bfacddd1090b0c56f9bc51

if [ -f server.jar ] && [ "$(sha1sum server.jar | cut -d' ' -f1)" = "$SHA1" ]; then
  echo "server.jar 26.1.2 ya está"
elif [ -f ../servidor-local/server.jar ] && [ "$(sha1sum ../servidor-local/server.jar | cut -d' ' -f1)" = "$SHA1" ]; then
  cp ../servidor-local/server.jar server.jar && echo "server.jar 26.1.2 copiado de servidor-local/"
else
  curl -fL --retry 3 -o server.jar.tmp "$URL" || { echo "no se pudo bajar el jar"; rm -f server.jar.tmp; exit 1; }
  if [ "$(sha1sum server.jar.tmp | cut -d' ' -f1)" != "$SHA1" ]; then
    echo "el sha1 del jar no coincide: lo borro"; rm -f server.jar.tmp; exit 1
  fi
  mv server.jar.tmp server.jar
  echo "server.jar 26.1.2 bajado ($(du -h server.jar | cut -f1))"
fi

if [ -f server.properties ]; then
  echo "server.properties ya existe: no lo toco"
else
  umask 077
  CLAVE=$(python3 -c "import secrets; print(secrets.token_urlsafe(24))")
  cat > server.properties <<EOF
server-ip=127.0.0.1
server-port=25573
online-mode=false
enable-rcon=true
rcon.port=25583
rcon.password=$CLAVE
broadcast-rcon-to-ops=false
difficulty=peaceful
gamemode=creative
force-gamemode=true
level-type=minecraft\:flat
generate-structures=false
level-name=world
motd=project-soma: mundo creativo (obras)
max-players=8
view-distance=8
simulation-distance=8
spawn-protection=0
enable-command-block=false
pause-when-empty-seconds=0
EOF
  chmod 600 server.properties
  echo "server.properties escrito (clave RCON nueva; permisos 600)"
fi
[ -f eula.txt ] || echo "eula=true" > eula.txt
