# project-soma · manejar a mano el server local, los bots y sus roles, las pruebas y los bancos.
# `make` (o `make help`) enseña todo. Las variables se cambian en la línea: `make casual BOTS="Soma Eco" WORLD=companero`.
# Reutiliza los scripts de siempre (servidor-local/*.sh, servidor/rcon.py, bot/io.js, entrenamiento/experimentos_roles.py):
# aquí no hay lógica nueva, solo los comandos con sus valores por defecto. Los bots se paran por PID (nunca pkill -f).

SHELL := /bin/bash
.DEFAULT_GOAL := help
RAIZ := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))

# node va por nvm y numpy por el venv: sin `source`, desde make
NVM_BIN := $(lastword $(sort $(wildcard $(HOME)/.nvm/versions/node/*/bin)))
export PATH := $(RAIZ)/entrenamiento/.venv/bin:$(NVM_BIN):$(PATH)

WORLD   ?= local        # local (servidor-local/, 26.1.2) · companero (su server 26.1 por wifi) · usuario (26.3 por ViaProxy) · supervivencia
ROLE    ?= casual       # rol v2 del capataz (perfiles/v2/): casual · speedrunner
BOTS    ?= Soma         # uno o varios nombres: "Soma Eco Iris"
PORT    ?= 3001         # puerto de control del primero; los demás, consecutivos (Soma 3001, Eco 3002…)
STYLE   ?= recolector   # perfil v1 (estilo): recolector · cooperativo · supervivencia · constructor · explorador
DECIDER ?= capataz      # quién decide en libre: red · guion · capataz
TEXT    ?= estado       # una orden en lenguaje sencillo: "tala 5 troncos", "ven", "caza 3 ovejas"
CMD     ?= list         # una orden de RCON para el server local
BASE    ?=              # banco K: JSON de una medida anterior para comparar punto a punto
ZONE    ?=              # banco K: zona sin usar para preparar los puntos fijos
DAYS    ?= 2            # banco K: días de juego
BENCHES ?= smoke-26-3 bench-k  # nightly: bancos en serie, sin Claude
HOURS   ?= 24           # report: horas hacia atrás
PHASE   ?= A1           # bench-assistant: A1 · A2 · A4 · A5 (planes/asistente/)
MODE    ?= libre        # bots: libre u ordenes al arrancar

WORLD_ := $(strip $(WORLD))
ROLE_ := $(strip $(ROLE))
LOGS := $(RAIZ)/servidor-supervivencia/logs
PID := $(LOGS)/bots-$(WORLD_).pid
LOG := $(LOGS)/bots-$(WORLD_).log
RCON := python $(RAIZ)/servidor/rcon.py --servidor local
RCON_USER := python $(RAIZ)/servidor/rcon.py --servidor usuario
# quién decide en libre al arrancar los bots (el asistente usa guion)
BOT_DECIDER ?= capataz@$(ROLE_)
# la orden al puerto de un bot, con el texto en la URL bien codificado
pedir = curl -s --max-time 30 "127.0.0.1:$(strip $(1))/?c=$$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$(2)")"; echo

.PHONY: help install install-bot install-python server-download server-start server-stop server-save server-status \
        rcon partner-ping user-server-download user-server-start user-server-stop user-server-save user-server-status \
        proxy-download proxy-start proxy-stop proxy-ping assistant smoke-26-3 report nightly verify bench-assistant bots casual speedrunner bots-stop bots-log status status-all progress role style decider free idle \
        order test validate-profiles bench-smoke bench-k bench-prepare

help:
	@echo "project-soma · make TARGET [VARIABLE=value …]"
	@echo
	@echo "Instalar (una vez):"
	@echo "  install             bot (npm ci) y entorno de Python (entrenamiento/.venv con numpy)"
	@echo "Server local (servidor-local/, Minecraft 26.1.2, 127.0.0.1:25567, RCON 25577):"
	@echo "  server-download     la primera vez: server.jar (sha1 comprobado) y server.properties"
	@echo "  server-start        en segundo plano; se niega con menos de 3 GB libres"
	@echo "  server-stop         guarda y cierra · server-save · server-status (jugadores y hora)"
	@echo "  rcon CMD=\"time set day\"   cualquier orden de consola"
	@echo "Server del compañero (26.1.x, online-mode=false; host en mundos/companero/mundo.json):"
	@echo "  partner-ping        ¿responde y habla 26.1 (protocolo 775)?"
	@echo "Mundo del usuario (servidor/, Minecraft 26.3, 127.0.0.1:25565, RCON 25575) y su proxy (ViaProxy, 25568):"
	@echo "  user-server-download · proxy-download   la primera vez: jars con su suma comprobada y la configuración"
	@echo "  user-server-start · proxy-start         en segundo plano (primero el servidor, luego el proxy)"
	@echo "  user-server-stop · proxy-stop · user-server-save · user-server-status"
	@echo "  proxy-ping          ¿el proxy responde y tiene detrás el servidor 26.3 (protocolo 777)?"
	@echo "  assistant           Soma en el mundo del usuario, en modo órdenes (bots-stop WORLD=usuario lo para)"
	@echo "  smoke-26-3          puerta A0: conexión, caminar, picar, poner, cofre, mesa y cama (≈ 15 min)"
	@echo "Bots (en segundo plano; registro en servidor-supervivencia/logs/bots-WORLD.log):"
	@echo "  casual              BOTS en modo libre con el rol casual      (= bots ROLE=casual)"
	@echo "  speedrunner         lo mismo con el rol speedrunner (sin medir: llega hasta el hierro y el cubo)"
	@echo "  bots                BOTS con ROLE en WORLD · bots-stop · bots-log (tail -f)"
	@echo "Manejo en caliente (por el puerto de un bot, PORT=…):"
	@echo "  status · progress   qué hace · etapa del rol, lo que le falta y las hechas    status-all: todos los BOTS"
	@echo "  role ROLE=…         cambia de rol (casual, speedrunner)"
	@echo "  style STYLE=…       perfil v1 (recolector, cooperativo, supervivencia, constructor, explorador)"
	@echo "  decider DECIDER=…   red · guion · capataz        free · idle: modo libre o modo órdenes"
	@echo "  order TEXT=\"…\"      \"tala 5 troncos\", \"ven\", \"caza 3 ovejas\", \"vuelve al campamento\"…"
	@echo "Pruebas y bancos:"
	@echo "  test                todas las pruebas en seco (bot/probar_*_seco.js) · validate-profiles"
	@echo "  bench-smoke         8 bots, 0,1 días, en los puntos fijos (3-4 min)"
	@echo "  bench-k [BASE=…]    banco K del Casual en los puntos fijos (≈ 45 min), comparado con BASE si se da"
	@echo "  bench-prepare ZONE=…  elige 8 puntos fijos nuevos y fotografía su terreno"
	@echo "Sin gastar Claude:"
	@echo "  report [HOURS=24]   parte de ≤ 20 líneas: éxitos, fallos, muertes, expulsiones y último experimento"
	@echo "  nightly [BENCHES=\"smoke-26-3 bench-k\"]   bancos en serie en segundo plano; luego make report"
	@echo "  verify              todo lo que se comprueba sin servidor: pruebas en seco, perfiles, herramientas del vault, Python"
	@echo "  bench-assistant PHASE=A2 [WORLD=local]   la puerta de una fase del asistente (entrenamiento/banco_asistente.py)"
	@echo
	@echo "Now: WORLD=$(WORLD_) ROLE=$(ROLE_) BOTS=\"$(strip $(BOTS))\" PORT=$(strip $(PORT))"
	@echo "Examples:  make server-start && make casual BOTS=\"Soma Eco\"   ·   make progress PORT=3002"
	@echo "           make role PORT=3002 ROLE=speedrunner   ·   make order PORT=3001 TEXT=\"vuelve al campamento\""

# --- instalar ------------------------------------------------------------------------------------------------------------------
install: install-bot install-python

install-bot:
	@test -n "$(NVM_BIN)" || command -v node >/dev/null || { echo "no encuentro node: instala nvm y node 24"; exit 1; }
	cd bot && npm ci

# en Ubuntu sin python3-venv (sin sudo): venv sin pip y pip con get-pip.py
install-python:
	@if [ ! -x entrenamiento/.venv/bin/python ]; then \
	  python3 -m venv entrenamiento/.venv 2>/dev/null || { python3 -m venv --without-pip entrenamiento/.venv && \
	  curl -sS https://bootstrap.pypa.io/get-pip.py | entrenamiento/.venv/bin/python; }; fi
	entrenamiento/.venv/bin/python -m pip install -q -r entrenamiento/requirements.txt

# --- server local ---------------------------------------------------------------------------------------------------------------
server-download:
	servidor-local/descargar.sh

server-start:
	servidor-local/arrancar.sh

server-stop:
	servidor-local/parar.sh

server-save:
	servidor-local/guardar.sh

server-status:
	@$(RCON) list
	@$(RCON) "time query day"

rcon:
	@$(RCON) "$(strip $(CMD))"

# --- server del compañero -------------------------------------------------------------------------------------------------------
# el JS va en una variable de entorno: con «\» de make dentro de las comillas, node recibía la barra y no arrancaba
partner-ping:
	@cd bot && node -e "$$PARTNER_PING"

# --- mundo del usuario en 26.3 y su proxy (A0 del asistente, PLAN_asistente.md) -------------------------------------------------
user-server-download:
	servidor/descargar.sh

user-server-start:
	servidor/arrancar.sh

user-server-stop:
	servidor/parar.sh

user-server-save:
	servidor/guardar.sh

user-server-status:
	@$(RCON_USER) list
	@$(RCON_USER) "time query day"

proxy-download:
	servidor/proxy/descargar.sh

proxy-start:
	servidor/proxy/arrancar.sh

proxy-stop:
	servidor/proxy/parar.sh

proxy-ping:
	@cd bot && node -e "$$PROXY_PING"

assistant:
	@$(MAKE) --no-print-directory bots WORLD=usuario BOTS=Soma PORT=3001 MODE=ordenes BOT_DECIDER=guion

smoke-26-3:
	python entrenamiento/humo_26_3.py

# --- sin gastar Claude: parte corto y bancos en serie (economía de tokens, 2026-10-31) ---------------------------------------
report:
	@python entrenamiento/parte.py --horas $(strip $(HOURS))

nightly:
	@setsid nohup entrenamiento/nocturno.sh "$(strip $(BENCHES))" > /dev/null 2>&1 < /dev/null & \
	  echo "nocturno en marcha: $(strip $(BENCHES)) (registro en entrenamiento/ejecuciones/nocturno-*.log; luego make report)"

# antes de cada commit (planes/asistente/README.md): sale con error si falla cualquier cosa
verify: test validate-profiles
	@cd conocimiento/herramientas && python -m unittest -q test_herramientas
	@python -m py_compile entrenamiento/*.py && echo "entrenamiento/*.py: compila"
	@echo "verify: todo bien"

bench-assistant:
	python entrenamiento/banco_asistente.py --fase $(strip $(PHASE)) --mundo $(if $(filter usuario,$(WORLD_)),usuario,local)

# --- bots -----------------------------------------------------------------------------------------------------------------------
# NOMBRE:PORT:STYLE:libre:capataz@ROLE por cada nombre de BOTS, con puertos consecutivos desde PORT
bots:
	@mkdir -p $(LOGS)
	@if [ -f $(PID) ] && kill -0 $$(cat $(PID)) 2>/dev/null; then echo "ya hay bots de $(WORLD_) en marcha (PID $$(cat $(PID))): make bots-stop"; exit 1; fi
	@rm -f $(PID)
	@# el PID lo escribe el propio proceso antes de hacerse node (exec): con «… &» y $$! quedaba el de una subshell intermedia,
	@# y bots-stop no paraba a nadie
	@p=$(strip $(PORT)); args=""; for n in $(BOTS); do args="$$args $$n:$$p:$(strip $(STYLE)):$(strip $(MODE)):$(strip $(BOT_DECIDER))"; p=$$((p + 1)); done; \
	  cd $(RAIZ)/bot; IO_SERVIDOR=$(WORLD_) IO_BOTS="$$(echo $(BOTS) | tr ' ' ,)" \
	    setsid nohup bash -c 'echo $$$$ > "$$0"; exec node io.js "$$@"' $(PID) $$args > $(LOG) 2>&1 < /dev/null & \
	  for i in 1 2 3 4 5 6 7 8 9 10; do [ -s $(PID) ] && break; sleep 0.2; done; \
	  echo "bots de $(WORLD_) (PID $$(cat $(PID))):$$args"; echo "registro: $(LOG)"
	@sleep 8; tail -n 5 $(LOG)

casual:
	@$(MAKE) --no-print-directory bots ROLE=casual

speedrunner:
	@$(MAKE) --no-print-directory bots ROLE=speedrunner

# solo el PID apuntado y solo si es node io.js (como parar.sh con el server); a todo su grupo (setsid), nunca pkill -f
bots-stop:
	@if [ ! -f $(PID) ]; then echo "no hay bots de $(WORLD_) apuntados"; exit 0; fi; \
	  p=$$(cat $(PID)); \
	  if ! kill -0 $$p 2>/dev/null; then echo "ya no están en marcha (PID $$p)"; rm -f $(PID); exit 0; fi; \
	  if ! tr '\0' ' ' < /proc/$$p/cmdline | grep -q 'io.js'; then echo "el PID $$p no es de los bots: no lo toco"; exit 1; fi; \
	  kill -TERM -- -$$p 2>/dev/null || kill -TERM $$p; \
	  for i in $$(seq 1 20); do kill -0 $$p 2>/dev/null || { rm -f $(PID); echo "bots de $(WORLD_) parados"; exit 0; }; sleep 1; done; \
	  echo "siguen en marcha tras 20 s (PID $$p)"; exit 1

bots-log:
	tail -n 30 -f $(LOG)

# --- manejo en caliente ---------------------------------------------------------------------------------------------------------
status:
	@$(call pedir,$(PORT),estado)

status-all:
	@p=$(strip $(PORT)); for n in $(BOTS); do printf "%s (%s): " $$n $$p; \
	  curl -s --max-time 10 "127.0.0.1:$$p/?c=estado" || printf "no responde"; echo; p=$$((p + 1)); done

progress:
	@curl -s --max-time 10 "127.0.0.1:$(strip $(PORT))/?c=progreso" | python3 -c "$$PROGRESO"

# progreso en tres líneas: rol y etapa, las hechas con su día y las pendientes
define PROGRESO
import json, sys
d = json.load(sys.stdin)
print(f"rol {d.get('rol')} · etapa {d.get('etapa')} · falta {', '.join(d.get('falta') or []) or '—'}")
print("hechas: " + (", ".join(f"{k} (día {v.get('dia')})" for k, v in (d.get("hechas") or {}).items()) or "ninguna"))
print("pendientes: " + (", ".join(d.get("pendientes") or []) or "ninguna"))
endef
export PROGRESO

define PARTNER_PING
const m = require("../mundos/companero/mundo.json").servidor
const host = process.env.IO_HOST || m.host, port = +(process.env.IO_PORT_SERVIDOR || m.puerto)
require("minecraft-protocol").ping({ host, port }, (e, r) => {
  if (e) return console.log(`$${host}:$${port} no responde ($${e.code || e.message}): IP, firewall o server apagado`)
  console.log(`$${host}:$${port} → $${r.version.name} (protocolo $${r.version.protocol})` + (r.version.protocol === 775 ? ": vale" : ": no es 26.1, los bots no entrarán"))
})
endef
export PARTNER_PING

define PROXY_PING
require("minecraft-protocol").ping({ host: "127.0.0.1", port: 25568, version: "26.1" }, (e, r) => {
  if (e) return console.log(`127.0.0.1:25568 no responde ($${e.code || e.message}): make user-server-start proxy-start`)
  // el ping de estado lo contesta el servidor de detrás (26.3, 777): ViaProxy traduce a 26.1 al entrar, no aquí
  console.log(`127.0.0.1:25568 responde → servidor $${r.version.name} (protocolo $${r.version.protocol})` + (r.version.protocol === 777 ? ": vale (el bot entra hablando 26.1)" : ": no es 26.3, revisa servidor/"))
})
endef
export PROXY_PING

role:
	@$(call pedir,$(PORT),decisor capataz $(ROLE_))

style:
	@$(call pedir,$(PORT),orden perfil $(strip $(STYLE)))

decider:
	@$(call pedir,$(PORT),decisor $(strip $(DECIDER)))

free:
	@$(call pedir,$(PORT),modo libre)

idle:
	@$(call pedir,$(PORT),modo ordenes)

order:
	@$(call pedir,$(PORT),orden $(strip $(TEXT)))

# --- pruebas y bancos -----------------------------------------------------------------------------------------------------------
# la parte A de probar_libre_seco pide entrenamiento/ejecuciones/ (datos sin versionar): su fallo no cuenta si es solo ese
test:
	@cd bot && mal=0; for t in probar_*_seco.js; do printf "%-32s " $$t; s=$$(node $$t 2>&1); u=$$(echo "$$s" | tail -n 1); echo "$$u"; \
	  if ! echo "$$u" | grep -qE "bien|todo bien"; then \
	    if [ $$t = probar_libre_seco.js ] && [ "$$(echo "$$s" | grep -c "^  FALLO")" = 1 ] && echo "$$s" | grep -q "decisiones registradas del mundo del usuario"; then \
	      echo "                                 (solo la parte A: faltan los registros del mundo del usuario en este PC)"; \
	    else mal=1; fi; fi; done; exit $$mal

validate-profiles:
	node bot/probar_perfiles_seco.js | tail -n 1
	python entrenamiento/perfiles_v2.py --comprobar

bench-smoke:
	IO_SERVIDOR=local python entrenamiento/experimentos_roles.py --puntos entrenamiento/puntos_k.json --dias 0.1

bench-k:
	IO_SERVIDOR=local python entrenamiento/experimentos_roles.py --puntos entrenamiento/puntos_k.json --dias $(strip $(DAYS)) \
	  $(if $(strip $(BASE)),--comparar $(strip $(BASE)))

bench-prepare:
	@test -n "$(strip $(ZONE))" || { echo "falta ZONE=… (una sin usar; las medidas hasta ahora llegan a la 77)"; exit 1; }
	IO_SERVIDOR=local python entrenamiento/experimentos_roles.py --preparar-puntos entrenamiento/puntos_k.json --zona $(strip $(ZONE))
