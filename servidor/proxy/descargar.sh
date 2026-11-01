#!/bin/bash
# Primera vez del proxy del mundo del usuario (A0 del asistente, PLAN_asistente.md). Baja ViaProxy 3.4.14 (sha256 comprobado) y
# genera viaproxy.yml con estos valores:
#   escucha:  127.0.0.1:25568 (solo este PC)
#   destino:  127.0.0.1:25565, el servidor 26.3 de ../
#   versión:  26.3
#   auth:     NONE (offline)
# Soma entra por aquí hablando 26.1 (mineflayer 4.39) y ViaProxy lo traduce a 26.3. El usuario entra directo al 25565.
# Si el yml generado no tiene alguna de esas claves, falla (no adivina nombres). Luego: ./arrancar.sh
set -u
cd "$(dirname "$0")"
URL=https://github.com/ViaVersion/ViaProxy/releases/download/v3.4.14/ViaProxy-3.4.14.jar
SHA256=2894bbfb2f4342f8fde887af6c689313efd5b0e46a8006775eea0e21e2948ab5
JAVA=${IO_JAVA:-$HOME/.minecraft/runtime/java-runtime-epsilon/linux/java-runtime-epsilon/bin/java}  # Java 17 o más

if [ -f ViaProxy.jar ] && [ "$(sha256sum ViaProxy.jar | cut -d' ' -f1)" = "$SHA256" ]; then
  echo "ViaProxy 3.4.14 ya está"
else
  curl -fL --retry 3 -o ViaProxy.jar.tmp "$URL" || { echo "no se pudo bajar ViaProxy"; rm -f ViaProxy.jar.tmp; exit 1; }
  if [ "$(sha256sum ViaProxy.jar.tmp | cut -d' ' -f1)" != "$SHA256" ]; then
    echo "el sha256 de ViaProxy no coincide: lo borro"; rm -f ViaProxy.jar.tmp; exit 1
  fi
  mv ViaProxy.jar.tmp ViaProxy.jar
  echo "ViaProxy 3.4.14 bajado"
fi

[ -x "$JAVA" ] || { echo "no encuentro Java en $JAVA (IO_JAVA=… para otro)"; exit 1; }
# la primera vez ViaProxy escribe viaproxy.yml con los valores por defecto y se cierra
[ -f viaproxy.yml ] || timeout 120 "$JAVA" -jar ViaProxy.jar config viaproxy.yml > /dev/null 2>&1
[ -f viaproxy.yml ] || { echo "ViaProxy no generó viaproxy.yml"; exit 1; }
fijar() {  # fijar CLAVE VALOR: la clave tiene que existir ya en el yml
  grep -q "^$1:" viaproxy.yml || { echo "viaproxy.yml no tiene la clave «$1»: revisa la versión de ViaProxy"; exit 1; }
  sed -i "s|^$1:.*|$1: $2|" viaproxy.yml
}
fijar bind-address 127.0.0.1:25568
fijar target-address 127.0.0.1:25565
fijar target-version 26.3
fijar auth-method NONE
fijar proxy-online-mode false
echo "viaproxy.yml: 127.0.0.1:25568 → 127.0.0.1:25565 (26.3), sin autenticación"
