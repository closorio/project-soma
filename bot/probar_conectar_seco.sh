#!/usr/bin/env bash
# Prueba seca de bot/conectar.sh --de (los «bot operator»): quién es dueño de qué personaje. No lanza ni para ningún bot: solo listados y
# peticiones de personajes ajenos (que se niegan antes de tocar nada). Usa un mundo temporal mundos/_prueba_conectar/.
set -u
RAIZ=$(cd "$(dirname "$0")/.." && pwd)
M=_prueba_conectar
mkdir -p "$RAIZ/mundos/$M"
trap 'rm -rf "$RAIZ/mundos/$M"' EXIT
cat > "$RAIZ/mundos/$M/personajes.json" <<'JSON'
{ "mundo": "_prueba_conectar", "amos": ["Count"], "externos": [],
  "personajes": [
    { "nombre": "Ana",   "puerto": 3991 },
    { "nombre": "Beto",  "puerto": 3992, "dueno": "Pepe" },
    { "nombre": "Cleo",  "puerto": 3993, "dueno": "pepe" } ] }
JSON
fallos=0; pruebas=0
ok() { pruebas=$((pruebas + 1)); if [ "$1" = "$2" ]; then :; else fallos=$((fallos + 1)); echo "  FALLO $3: esperaba [$2], salió [$1]"; fi; }
c() { IO_SERVIDOR=$M "$RAIZ/bot/conectar.sh" "$@" 2>&1 | paste -sd, -; }

ok "$(c --listar)" "Ana,Beto,Cleo" "sin --de: todos"
ok "$(c --listar --de Count)" "Ana" "los amos de la lista son dueños de los que no traen «dueno»"
ok "$(c --listar --de count)" "Ana" "sin distinguir mayúsculas"
ok "$(c --de PEPE --listar)" "Beto,Cleo" "el campo «dueno» manda, en cualquier orden de las opciones, sin mayúsculas"
ok "$(c --listar --de nadie)" "" "un jugador sin personajes no ve ninguno"
ok "$(c --de Pepe Ana)" "Ana: no es tuyo" "pedir un personaje ajeno se niega"
ok "$(c --desconectar --de Pepe Ana)" "Ana: no es tuyo" "desconectar uno ajeno también"
ok "$(c --de nadie bots)" "no tienes personajes en personajes.json (nadie)" "«bots» sin personajes propios"
ok "$(c --de Pepe Zeta)" "Zeta: no está en personajes.json (hay: Beto Cleo )" "uno que no existe, con la lista de los suyos"
echo "$([ $fallos = 0 ] && echo "$pruebas/$pruebas comprobaciones bien" || echo "$fallos de $pruebas comprobaciones FALLAN")"
exit $fallos
