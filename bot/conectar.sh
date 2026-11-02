#!/usr/bin/env bash
# Conecta personajes de mundos/<mundo>/personajes.json al server, cada uno en su proceso `node io.js` (como se lanzaron a mano:
# mismo puerto, mismo estilo, mismas variables IO_*). Lo llama el plugin /connect del Paper (plugin-connect/), pero vale a mano.
# Uso: bot/conectar.sh bots | NOMBRE [NOMBRE …]      (sin distinguir mayúsculas)
#      bot/conectar.sh --desconectar bots | NOMBRE …  (SIGTERM al proceso: guarda su memoria y sale; sirve también para los lanzados a mano)
#      bot/conectar.sh --listar                      (los nombres, uno por línea)
#      --de JUGADOR (en cualquiera de los tres, 2026-11-02): solo los personajes de ese jugador, para los «bot operator» del plugin (/bo): un
#      personaje es suyo si su entrada de personajes.json trae "dueno": "JUGADOR"; sin «dueno», es de los «amos» de la lista. Pedir uno ajeno
#      dice «no es tuyo» y no toca nada.
# Los lanzados aquí llevan IO_RECONECTAR=0: si los echan o el server cae no vuelven solos; entran solo con /connect.
# Un personaje ya en marcha no se toca. El PID va a servidor-supervivencia/logs/bot-NOMBRE.pid y el registro a bot-NOMBRE.log.
# Cada línea que imprime es un resultado para quien lo lanzó: «Nombre: conectando (PID …)», «Nombre: ya estaba conectado»…
set -u
RAIZ=$(cd "$(dirname "$0")/.." && pwd)
MUNDO=${IO_SERVIDOR:-companero}
# 2026-11-02: los personajes son de cada persona: personajes.local.json (no se versiona, como un .env), hecho de personajes.json si falta
JSON=$RAIZ/mundos/$MUNDO/personajes.local.json
# 2026-11-02: en un mundo compartido, los personajes son los del plantel (mundos/<mundo>/jugadores/<jugador>.json, en git; bot/plantel.js)
# y personajes.local.json solo dice cómo lanzo los míos (puerto, estilo, modo, decisor). Los de un jugador con «lanzador» (otro PC) no
# se lanzan aquí: el plugin /connect se los pide a su PC (bot/lanzador.js). Quién soy: IO_DUENOS, o el de local.mk.
JUG=$RAIZ/mundos/$MUNDO/jugadores
YO=${IO_DUENOS:-$(sed -n 's/^export IO_DUENOS *= *//p' "$RAIZ/local.mk" 2>/dev/null | head -n 1)}; YO=${YO%%,*}
if [ ! -d "$JUG" ]; then
  [ -f "$JSON" ] || { [ -f "$RAIZ/mundos/$MUNDO/personajes.json" ] && cp "$RAIZ/mundos/$MUNDO/personajes.json" "$JSON"; }
  [ -f "$JSON" ] || { echo "falta $JSON: copia mundos/companero/personajes.ejemplo.json a mundos/$MUNDO/personajes.local.json y pon tus amos y tus bots"; exit 1; }
fi
LOGS=$RAIZ/servidor-supervivencia/logs

# ajustes de esta máquina, sin versionar (local.env, p. ej. SOMA_OLLAMA_MODELO=qwen3:4b para el respaldo con LLM de interprete_llm.js)
[ -f "$RAIZ/local.env" ] && { set -a; . "$RAIZ/local.env"; set +a; }

# node va por nvm/mise y quien nos llama (el Paper) no trae el PATH de la terminal
NVM_BIN=$(ls -d "$HOME"/.nvm/versions/node/*/bin 2>/dev/null | sort | tail -n 1)
MISE_BIN=$(ls -d "$HOME"/.local/share/mise/installs/node/*/bin 2>/dev/null | sort | tail -n 1)
export PATH="$NVM_BIN:$MISE_BIN:$PATH"
command -v node > /dev/null || { echo "no encuentro node"; exit 1; }

# una línea por personaje: nombre puerto estilo modo decisor skin(o «-») dueno(o «-») donde(aqui|remoto), y las listas de amos y externos
datos=$(python3 - "$JSON" "$JUG" "$YO" <<'PY'
import glob, json, os, sys
personajes, jug, yo = sys.argv[1], sys.argv[2], sys.argv[3].lower()
if os.path.isdir(jug):  # mundo compartido: el plantel, con mis ajustes de lanzamiento
    try:
        ajustes = {p["nombre"].lower(): p for p in json.load(open(personajes)).get("personajes", [])}
    except (OSError, ValueError):
        ajustes = {}
    print("AMOS ")
    print("EXTERNOS ")
    botsde, filas, puerto = [], [], 3011
    for f in sorted(glob.glob(os.path.join(jug, "*.json"))):
        j = os.path.basename(f)[:-5]
        if j.lower() == "ejemplo":
            continue
        d = json.load(open(f))
        remoto = bool(d.get("lanzador")) and j.lower() != yo
        bots = d.get("bots", [])
        botsde.append(j + "=" + ",".join(b["nombre"] for b in bots))
        for b in bots:
            a = ajustes.get(b["nombre"].lower(), {})
            filas.append(["P", b["nombre"], a.get("puerto", b.get("puerto", puerto)), a.get("estilo", "recolector"), a.get("modo", "ordenes"),
                          a.get("decisor", "guion"), b.get("skin") or a.get("skin") or "-", j, "remoto" if remoto else "aqui"])
            puerto += 1
    print("BOTSDE", ";".join(botsde))
    for f in filas:
        print(" ".join(map(str, f)))
else:
    d = json.load(open(personajes))
    print("AMOS", ",".join(d.get("amos", [])))
    print("EXTERNOS", ",".join(d.get("externos", [])))
    print("BOTSDE", ";".join(j + "=" + ",".join(b) for j, b in d.get("bots_de", {}).items()))
    for p in d["personajes"]:
        print("P", p["nombre"], p["puerto"], p.get("estilo", "recolector"), p.get("modo", "ordenes"), p.get("decisor", "guion"), p.get("skin") or "-", p.get("dueno") or "-", "aqui")
PY
) || { echo "personajes.json no se puede leer"; exit 1; }

AMOS=$(sed -n 's/^AMOS //p' <<< "$datos")
EXTERNOS=$(sed -n 's/^EXTERNOS //p' <<< "$datos")
BOTSDE=$(sed -n 's/^BOTSDE //p' <<< "$datos")
mapfile -t FILAS < <(sed -n 's/^P //p' <<< "$datos")

# opciones, en cualquier orden: --listar, --desconectar, --de JUGADOR
LISTAR=0; DESCONECTAR=0; DE=""
while [ $# -gt 0 ]; do
  case "$1" in
    --listar) LISTAR=1; shift ;;
    --desconectar) DESCONECTAR=1; shift ;;
    --de) [ $# -ge 2 ] || { echo "falta el jugador de --de"; exit 1; }; DE=$2; shift 2 ;;
    *) break ;;
  esac
done

# ¿es de JUGADOR este personaje (su campo «dueno», o «-» = los amos de la lista)?
es_de() { # es_de DUENO_DE_LA_FILA JUGADOR
  local d=${1,,} j=${2,,}
  if [ "$d" != "-" ]; then [ "$d" = "$j" ]; else [[ ",${AMOS,,}," == *",$j,"* ]]; fi
}
TODAS=("${FILAS[@]}")
if [ -n "$DE" ]; then
  FILAS=()
  for f in "${TODAS[@]}"; do read -r _ _ _ _ _ _ dueno _ <<< "$f"; es_de "$dueno" "$DE" && FILAS+=("$f"); done
fi
NOMBRES=$(for f in "${FILAS[@]}"; do echo "${f%% *}"; done)
NOMBRES_TODOS=$(for f in "${TODAS[@]}"; do echo "${f%% *}"; done)

if [ $LISTAR = 1 ]; then echo "$NOMBRES"; exit 0; fi
[ $# -ge 1 ] || { echo "uso: conectar.sh [--desconectar] [--de JUGADOR] bots | NOMBRE [NOMBRE …]"; exit 1; }

TODOS=$(echo "$NOMBRES_TODOS" | paste -sd, -)
mkdir -p "$LOGS"

conectar() {
  local nombre=$1 puerto=$2 estilo=$3 modo=$4 decisor=$5 skin=$6 dueno=${7:--} donde=${8:-aqui}
  [ "$donde" = "remoto" ] && { echo "$nombre: es de $dueno y se lanza en su PC (su lanzador: make launcher-start allí)"; return; }
  [ "$skin" = "-" ] && skin=""
  # su dueño: el de su entrada, o los amos de la lista; los «propios» son los demás personajes del mismo dueño
  local amos=$AMOS; [ "$dueno" != "-" ] && amos=$dueno
  local pidf=$LOGS/bot-$nombre.pid
  # por la línea de comandos y no por el PID apuntado: los lanzados a mano no tienen archivo
  if pgrep -f "node io.js $nombre:" > /dev/null; then echo "$nombre: ya estaba conectado"; return; fi
  # los demás de la lista son «propios»: ni los echa el centinela ni se defiende de ellos
  local propios; propios=$(for f in "${TODAS[@]}"; do read -r n _ _ _ _ _ d _ <<< "$f"; [ "$n" != "$nombre" ] && [ "$d" = "$dueno" ] && echo "$n"; done | paste -sd, -)
  rm -f "$pidf"
  ( cd "$RAIZ/bot" && IO_SERVIDOR=$MUNDO IO_BOTS="$TODOS${EXTERNOS:+,$EXTERNOS}" IO_AMOS=$amos IO_BOTS_DE=$BOTSDE IO_PROPIOS=$propios IO_SKIN=$skin IO_RECONECTAR=0 \
      setsid nohup bash -c 'echo $$ > "$0"; exec node io.js "$1"' "$pidf" "$nombre:$puerto:$estilo:$modo:$decisor" \
      > "$LOGS/bot-$nombre.log" 2>&1 < /dev/null & )
  for _ in 1 2 3 4 5 6 7 8 9 10; do [ -s "$pidf" ] && break; sleep 0.2; done
  echo "$nombre: conectando (PID $(cat "$pidf" 2>/dev/null || echo '?'), puerto $puerto)"
}

desconectar() {
  local nombre=$1
  local pids; pids=$(pgrep -f "node io.js $nombre:")
  if [ -z "$pids" ]; then echo "$nombre: no estaba conectado"; rm -f "$LOGS/bot-$nombre.pid"; return; fi
  # SIGTERM: io.js apunta el tramo en el diario, guarda su memoria y sale (a cada PID que coincida, por su línea exacta, nunca pkill -f)
  for p in $pids; do kill -TERM "$p" 2>/dev/null; done
  for _ in $(seq 1 20); do pgrep -f "node io.js $nombre:" > /dev/null || break; sleep 0.5; done
  if pgrep -f "node io.js $nombre:" > /dev/null; then echo "$nombre: sigue en marcha tras 10 s"; else echo "$nombre: desconectado"; rm -f "$LOGS/bot-$nombre.pid"; fi
}

pedidos=("$@")
[ "${1,,}" = "bots" ] && mapfile -t pedidos <<< "$NOMBRES"
[ "${1,,}" = "bots" ] && [ -z "$NOMBRES" ] && { echo "no tienes personajes en la lista${DE:+ ($DE)}"; exit 0; }
for pedido in "${pedidos[@]}"; do
  hallado=0
  for f in "${FILAS[@]}"; do
    read -r nombre puerto estilo modo decisor skin dueno donde <<< "$f"
    if [ "${nombre,,}" = "${pedido,,}" ]; then
      if [ $DESCONECTAR = 1 ]; then desconectar "$nombre"; else conectar "$nombre" "$puerto" "$estilo" "$modo" "$decisor" "$skin" "$dueno" "$donde"; fi
      hallado=1
    fi
  done
  if [ $hallado = 0 ]; then
    if [ -n "$DE" ] && grep -qix "$pedido" <<< "$NOMBRES_TODOS"; then echo "$pedido: no es tuyo"
    else hay=$NOMBRES_TODOS; [ -n "$DE" ] && hay=$NOMBRES; echo "$pedido: no está en la lista de personajes (hay: $(echo "$hay" | tr '\n' ' '))"; fi
  fi
done
