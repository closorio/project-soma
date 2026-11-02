#!/usr/bin/env bash
# Consola para hablarle a un bot por su puerto de control: cada línea va como `orden TEXTO` (lenguaje sencillo, como en el
# chat del juego, sin el nombre delante). «/x» manda la orden directa x del puerto (/estado, /modo, /resumen, /para);
# «/esperar TEXTO» manda `orden_esperar` y contesta al terminar. Uso: bot/hablar.sh [PUERTO=3011]
PUERTO=${1:-3011}
quote() { python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$1"; }
pedir() { curl -s --max-time "${2:-30}" "127.0.0.1:$PUERTO/?c=$(quote "$1")" || printf '(el bot del %s no responde)' "$PUERTO"; echo; }
echo "hablando con el bot del puerto $PUERTO · «ayuda» lista las órdenes · /estado · /esperar TEXTO · Ctrl-D sale"
pedir estado 10
while IFS= read -r -e -p "> " linea; do
  [ -z "$linea" ] && continue
  history -s "$linea"
  case "$linea" in
    /esperar\ *) pedir "orden_esperar ${linea#/esperar }" 600 ;;
    /*) pedir "${linea#/}" ;;
    *) pedir "orden $linea" ;;
  esac
done
