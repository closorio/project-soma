#!/usr/bin/env bash
# Conecta personajes de mundos/<mundo>/personajes.json al server, cada uno en su proceso `node io.js` (como se lanzaron a mano:
# mismo puerto, mismo estilo, mismas variables IO_*). Lo llama el plugin /connect del Paper (plugin-connect/), pero vale a mano.
# Uso: bot/conectar.sh bots | NOMBRE [NOMBRE …]      (sin distinguir mayúsculas)
#      bot/conectar.sh --listar                      (los nombres, uno por línea)
# Un personaje ya en marcha no se toca. El PID va a servidor-supervivencia/logs/bot-NOMBRE.pid y el registro a bot-NOMBRE.log.
# Cada línea que imprime es un resultado para quien lo lanzó: «Nombre: conectando (PID …)», «Nombre: ya estaba conectado»…
set -u
RAIZ=$(cd "$(dirname "$0")/.." && pwd)
MUNDO=${IO_SERVIDOR:-companero}
JSON=$RAIZ/mundos/$MUNDO/personajes.json
LOGS=$RAIZ/servidor-supervivencia/logs
[ -f "$JSON" ] || { echo "falta $JSON"; exit 1; }

# node va por nvm/mise y quien nos llama (el Paper) no trae el PATH de la terminal
NVM_BIN=$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort | tail -n 1)
MISE_BIN=$(ls -d "$HOME"/.local/share/mise/installs/node/*/bin 2>/dev/null | sort | tail -n 1)
export PATH="$NVM_BIN:$MISE_BIN:$PATH"
command -v node > /dev/null || { echo "no encuentro node"; exit 1; }

# una línea por personaje: nombre puerto estilo modo decisor skin(o «-»), y las listas de amos y externos
datos=$(python3 - "$JSON" <<'PY'
import json, sys
d = json.load(open(sys.argv[1]))
print("AMOS", ",".join(d.get("amos", [])))
print("EXTERNOS", ",".join(d.get("externos", [])))
for p in d["personajes"]:
    print("P", p["nombre"], p["puerto"], p.get("estilo", "recolector"), p.get("modo", "ordenes"), p.get("decisor", "guion"), p.get("skin") or "-")
PY
) || { echo "personajes.json no se puede leer"; exit 1; }

AMOS=$(sed -n 's/^AMOS //p' <<< "$datos")
EXTERNOS=$(sed -n 's/^EXTERNOS //p' <<< "$datos")
mapfile -t FILAS < <(sed -n 's/^P //p' <<< "$datos")
NOMBRES=$(for f in "${FILAS[@]}"; do echo "${f%% *}"; done)

if [ "${1:-}" = "--listar" ]; then echo "$NOMBRES"; exit 0; fi
[ $# -ge 1 ] || { echo "uso: conectar.sh bots | NOMBRE [NOMBRE …]"; exit 1; }

TODOS=$(echo "$NOMBRES" | paste -sd, -)
mkdir -p "$LOGS"

conectar() {
  local nombre=$1 puerto=$2 estilo=$3 modo=$4 decisor=$5 skin=$6
  [ "$skin" = "-" ] && skin=""
  local pidf=$LOGS/bot-$nombre.pid
  # por la línea de comandos y no por el PID apuntado: los lanzados a mano no tienen archivo
  if pgrep -f "node io.js $nombre:" > /dev/null; then echo "$nombre: ya estaba conectado"; return; fi
  # los demás de la lista son «propios»: ni los echa el centinela ni se defiende de ellos
  local propios; propios=$(echo "$NOMBRES" | grep -vx "$nombre" | paste -sd, -)
  rm -f "$pidf"
  ( cd "$RAIZ/bot" && IO_SERVIDOR=$MUNDO IO_BOTS="$TODOS${EXTERNOS:+,$EXTERNOS}" IO_AMOS=$AMOS IO_PROPIOS=$propios IO_SKIN=$skin \
      setsid nohup bash -c 'echo $$ > "$0"; exec node io.js "$1"' "$pidf" "$nombre:$puerto:$estilo:$modo:$decisor" \
      > "$LOGS/bot-$nombre.log" 2>&1 < /dev/null & )
  for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$pidf" ] && break; sleep 0.2; done
  echo "$nombre: conectando (PID $(cat "$pidf" 2>/dev/null || echo '?'), puerto $puerto)"
}

pedidos=("$@")
[ "${1,,}" = "bots" ] && mapfile -t pedidos <<< "$NOMBRES"
for pedido in "${pedidos[@]}"; do
  hallado=0
  for f in "${FILAS[@]}"; do
    read -r nombre puerto estilo modo decisor skin <<< "$f"
    if [ "${nombre,,}" = "${pedido,,}" ]; then conectar "$nombre" "$puerto" "$estilo" "$modo" "$decisor" "$skin"; hallado=1; fi
  done
  [ $hallado = 1 ] || echo "$pedido: no está en personajes.json (hay: $(echo "$TODOS" | tr , ' '))"
done
