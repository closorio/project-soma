#!/bin/bash
# Primera vez del mundo local (F8): baja el server.jar de Minecraft 26.1.2 de Mojang (sha1 comprobado) y escribe
# server.properties (127.0.0.1:25567, RCON 25577 con una clave nueva, offline, normal, semilla 20261024; permisos 600).
# No pisa un server.properties que ya exista (la clave RCON es la de ese mundo). Luego: ./arrancar.sh
set -u
cd "$(dirname "$0")"
URL=https://piston-data.mojang.com/v1/objects/97ccd4c0ed3f81bbb7bfacddd1090b0c56f9bc51/server.jar
SHA1=97ccd4c0ed3f81bbb7bfacddd1090b0c56f9bc51

if [ -f server.jar ] && [ "$(sha1sum server.jar | cut -d' ' -f1)" = "$SHA1" ]; then
  echo "server.jar 26.1.2 ya está"
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
server-port=25567
online-mode=false
enable-rcon=true
rcon.port=25577
rcon.password=$CLAVE
broadcast-rcon-to-ops=false
difficulty=normal
gamemode=survival
level-seed=20261024
level-name=world
motd=project-soma: mundo local F8
max-players=8
view-distance=8
simulation-distance=8
spawn-protection=0
enable-command-block=false
EOF
  chmod 600 server.properties
  echo "server.properties escrito (clave RCON nueva; permisos 600)"
fi
[ -f eula.txt ] || echo "eula=true" > eula.txt
