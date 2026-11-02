#!/bin/bash
# Compila SomaConnect.jar contra el paper-api del propio servidor. Uso: ./build.sh [carpeta del servidor, por defecto ~/server-mc]
set -eu
cd "$(dirname "$0")"
SRV=${1:-$HOME/server-mc}
API=$(ls "$SRV"/libraries/io/papermc/paper/paper-api/*/paper-api-*.jar | tail -n 1)
CP="$API:$(find "$SRV/libraries" -name '*.jar' | tr '\n' ':')"
rm -rf build && mkdir -p build/clases
javac --release 21 -cp "$CP" -d build/clases src/soma/connect/*.java
cp recursos/* build/clases/
jar --create --file build/SomaConnect.jar -C build/clases .
echo "build/SomaConnect.jar listo; cópialo a $SRV/plugins/ y reinicia (o /reload no: usa reinicio)"
