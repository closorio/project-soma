#!/bin/bash
# Primera vez del mundo del usuario en 26.3 (A0 del asistente, PLAN_asistente.md). Baja el server.jar de Minecraft 26.3 de
# Mojang (sha1 comprobado) y escribe server.properties. Valores: 127.0.0.1:25565, RCON 25575 con una clave nueva, offline
# (TLauncher), normal, semilla aleatoria, sin pausa al quedarse vacío, sin lista blanca, permisos 600. La lista blanca
# viene activada en 26.3 y con offline no sirve: «whitelist add» guarda el UUID de la cuenta oficial, no el offline que usa
# el bot, y el servidor solo escucha en 127.0.0.1. El bot no entra aquí directo: entra por
# ViaProxy (proxy/, 25568). No pisa un server.properties que ya exista (la clave RCON es la de ese mundo). Luego: ./arrancar.sh
set -u
cd "$(dirname "$0")"
URL=https://piston-data.mojang.com/v1/objects/33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c/server.jar
SHA1=33680f5f2ac32864d6d7cf5e56a705fdb3e05f4c

if [ -f server.jar ] && [ "$(sha1sum server.jar | cut -d' ' -f1)" = "$SHA1" ]; then
  echo "server.jar 26.3 ya está"
else
  [ -f server.jar ] && { echo "hay un server.jar que no es el 26.3: lo dejo como server.jar.viejo"; mv server.jar server.jar.viejo; }
  curl -fL --retry 3 -o server.jar.tmp "$URL" || { echo "no se pudo bajar el jar"; rm -f server.jar.tmp; exit 1; }
  if [ "$(sha1sum server.jar.tmp | cut -d' ' -f1)" != "$SHA1" ]; then
    echo "el sha1 del jar no coincide: lo borro"; rm -f server.jar.tmp; exit 1
  fi
  mv server.jar.tmp server.jar
  echo "server.jar 26.3 bajado ($(du -h server.jar | cut -f1))"
fi

if [ -f server.properties ]; then
  echo "server.properties ya existe: no lo toco"
else
  umask 077
  CLAVE=$(python3 -c "import secrets; print(secrets.token_urlsafe(24))")
  cat > server.properties <<EOP
server-ip=127.0.0.1
server-port=25565
online-mode=false
enable-rcon=true
rcon.port=25575
rcon.password=$CLAVE
broadcast-rcon-to-ops=false
difficulty=normal
gamemode=survival
level-name=world
motd=project-soma: mundo del usuario 26.3
max-players=4
view-distance=10
simulation-distance=8
spawn-protection=0
enable-command-block=false
pause-when-empty-seconds=0
white-list=false
EOP
  chmod 600 server.properties
  echo "server.properties escrito (semilla aleatoria; clave RCON nueva; permisos 600)"
fi
[ -f eula.txt ] || echo "eula=true" > eula.txt
