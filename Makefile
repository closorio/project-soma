# project-soma · manejar a mano el server local, los bots y sus roles, las pruebas y los bancos.
# `make` (o `make ayuda`) enseña todo. Las variables se cambian en la línea: `make casual BOTS="Soma Eco" MUNDO=companero`.
# Reutiliza los scripts de siempre (servidor-local/*.sh, servidor/rcon.py, bot/io.js, entrenamiento/experimentos_roles.py):
# aquí no hay lógica nueva, solo los comandos con sus valores por defecto. Los bots se paran por PID (nunca pkill -f).

SHELL := /bin/bash
.DEFAULT_GOAL := ayuda
RAIZ := $(abspath $(dir $(lastword $(MAKEFILE_LIST))))

# node va por nvm y numpy por el venv: sin `source`, desde make
NVM_BIN := $(lastword $(sort $(wildcard $(HOME)/.nvm/versions/node/*/bin)))
export PATH := $(RAIZ)/entrenamiento/.venv/bin:$(NVM_BIN):$(PATH)

MUNDO   ?= local        # local (servidor-local/, 26.1.2) · companero (su server 26.1 por wifi) · usuario · supervivencia
ROL     ?= casual       # rol v2 del capataz (perfiles/v2/): casual · speedrunner
BOTS    ?= Soma         # uno o varios nombres: "Soma Eco Iris"
PUERTO  ?= 3001         # puerto de control del primero; los demás, consecutivos (Soma 3001, Eco 3002…)
ESTILO  ?= recolector   # perfil v1 (estilo): recolector · cooperativo · supervivencia · constructor · explorador
DECISOR ?= capataz      # quién decide en libre: red · guion · capataz
TEXTO   ?= estado       # una orden en lenguaje sencillo: "tala 5 troncos", "ven", "caza 3 ovejas"
CMD     ?= list         # una orden de RCON para el server local
BASE    ?=              # banco K: JSON de una medida anterior para comparar punto a punto
ZONA    ?=              # banco K: zona sin usar para preparar los puntos fijos
DIAS    ?= 2            # banco K: días de juego

MUNDO_ := $(strip $(MUNDO))
ROL_ := $(strip $(ROL))
LOGS := $(RAIZ)/servidor-supervivencia/logs
PID := $(LOGS)/bots-$(MUNDO_).pid
LOG := $(LOGS)/bots-$(MUNDO_).log
RCON := python $(RAIZ)/servidor/rcon.py --servidor local
# la orden al puerto de un bot, con el texto en la URL bien codificado
pedir = curl -s --max-time 30 "127.0.0.1:$(strip $(1))/?c=$$(python3 -c 'import sys, urllib.parse; print(urllib.parse.quote(sys.argv[1]))' "$(2)")"; echo

.PHONY: ayuda instalar instalar-bot instalar-python servidor-descargar servidor-arrancar servidor-parar servidor-guardar \
        servidor-estado rcon companero-ping bots casual speedrunner bots-parar bots-log estado estados progreso rol estilo \
        decisor libre quieto orden pruebas validar-perfiles banco-humo banco-k banco-preparar

ayuda:
	@echo "project-soma · make OBJETIVO [VARIABLE=valor …]"
	@echo
	@echo "Instalar (una vez):"
	@echo "  instalar            bot (npm ci) y entorno de Python (entrenamiento/.venv con numpy)"
	@echo "Server local (servidor-local/, Minecraft 26.1.2, 127.0.0.1:25567, RCON 25577):"
	@echo "  servidor-descargar  la primera vez: server.jar (sha1 comprobado) y server.properties"
	@echo "  servidor-arrancar   en segundo plano; se niega con menos de 3 GB libres"
	@echo "  servidor-parar      guarda y cierra · servidor-guardar · servidor-estado (jugadores y hora)"
	@echo "  rcon CMD=\"time set day\"   cualquier orden de consola"
	@echo "Server del compañero (26.1.x, online-mode=false; host en mundos/companero/mundo.json):"
	@echo "  companero-ping      ¿responde y habla 26.1 (protocolo 775)?"
	@echo "Bots (en segundo plano; registro en servidor-supervivencia/logs/bots-MUNDO.log):"
	@echo "  casual              BOTS en modo libre con el rol casual      (= bots ROL=casual)"
	@echo "  speedrunner         lo mismo con el rol speedrunner (sin medir: llega hasta el hierro y el cubo)"
	@echo "  bots                BOTS con ROL en MUNDO · bots-parar · bots-log (tail -f)"
	@echo "Manejo en caliente (por el puerto de un bot, PUERTO=…):"
	@echo "  estado · progreso   qué hace · etapa del rol, lo que le falta y las hechas    estados: todos los BOTS"
	@echo "  rol ROL=…           cambia de rol (casual, speedrunner)"
	@echo "  estilo ESTILO=…     perfil v1 (recolector, cooperativo, supervivencia, constructor, explorador)"
	@echo "  decisor DECISOR=…   red · guion · capataz        libre · quieto: modo libre o modo órdenes"
	@echo "  orden TEXTO=\"…\"     \"tala 5 troncos\", \"ven\", \"caza 3 ovejas\", \"vuelve al campamento\"…"
	@echo "Pruebas y bancos:"
	@echo "  pruebas             todas las pruebas en seco (bot/probar_*_seco.js) · validar-perfiles"
	@echo "  banco-humo          8 bots, 0,1 días, en los puntos fijos (3-4 min)"
	@echo "  banco-k [BASE=…]    banco K del Casual en los puntos fijos (≈ 45 min), comparado con BASE si se da"
	@echo "  banco-preparar ZONA=…   elige 8 puntos fijos nuevos y fotografía su terreno"
	@echo
	@echo "Ahora: MUNDO=$(MUNDO_) ROL=$(ROL_) BOTS=\"$(strip $(BOTS))\" PUERTO=$(strip $(PUERTO))"
	@echo "Ejemplos:  make servidor-arrancar && make casual BOTS=\"Soma Eco\"   ·   make progreso PUERTO=3002"
	@echo "           make rol PUERTO=3002 ROL=speedrunner   ·   make orden PUERTO=3001 TEXTO=\"vuelve al campamento\""

# --- instalar ------------------------------------------------------------------------------------------------------------------
instalar: instalar-bot instalar-python

instalar-bot:
	@test -n "$(NVM_BIN)" || command -v node >/dev/null || { echo "no encuentro node: instala nvm y node 24"; exit 1; }
	cd bot && npm ci

# en Ubuntu sin python3-venv (sin sudo): venv sin pip y pip con get-pip.py
instalar-python:
	@if [ ! -x entrenamiento/.venv/bin/python ]; then \
	  python3 -m venv entrenamiento/.venv 2>/dev/null || { python3 -m venv --without-pip entrenamiento/.venv && \
	  curl -sS https://bootstrap.pypa.io/get-pip.py | entrenamiento/.venv/bin/python; }; fi
	entrenamiento/.venv/bin/python -m pip install -q -r entrenamiento/requirements.txt

# --- server local ---------------------------------------------------------------------------------------------------------------
servidor-descargar:
	servidor-local/descargar.sh

servidor-arrancar:
	servidor-local/arrancar.sh

servidor-parar:
	servidor-local/parar.sh

servidor-guardar:
	servidor-local/guardar.sh

servidor-estado:
	@$(RCON) list
	@$(RCON) "time query day"

rcon:
	@$(RCON) "$(strip $(CMD))"

# --- server del compañero -------------------------------------------------------------------------------------------------------
companero-ping:
	@cd bot && node -e 'const m = require("../mundos/companero/mundo.json").servidor; \
	  require("minecraft-protocol").ping({ host: process.env.IO_HOST || m.host, port: +(process.env.IO_PORT_SERVIDOR || m.puerto) }, (e, r) => { \
	    if (e) return console.log(`$${m.host}:$${m.puerto} no responde (${e.code || e.message}): IP, firewall o server apagado`); \
	    console.log(`$${m.host}:$${m.puerto} → $${r.version.name} (protocolo $${r.version.protocol})` + (r.version.protocol === 775 ? ": vale" : ": no es 26.1, los bots no entrarán")) })'

# --- bots -----------------------------------------------------------------------------------------------------------------------
# NOMBRE:PUERTO:ESTILO:libre:capataz@ROL por cada nombre de BOTS, con puertos consecutivos desde PUERTO
bots:
	@mkdir -p $(LOGS)
	@if [ -f $(PID) ] && kill -0 $$(cat $(PID)) 2>/dev/null; then echo "ya hay bots de $(MUNDO_) en marcha (PID $$(cat $(PID))): make bots-parar"; exit 1; fi
	@rm -f $(PID)
	@# el PID lo escribe el propio proceso antes de hacerse node (exec): con «… &» y $$! quedaba el de una subshell intermedia,
	@# y bots-parar no paraba a nadie
	@p=$(strip $(PUERTO)); args=""; for n in $(BOTS); do args="$$args $$n:$$p:$(strip $(ESTILO)):libre:capataz@$(ROL_)"; p=$$((p + 1)); done; \
	  cd $(RAIZ)/bot; IO_SERVIDOR=$(MUNDO_) IO_BOTS="$$(echo $(BOTS) | tr ' ' ,)" \
	    setsid nohup bash -c 'echo $$$$ > "$$0"; exec node io.js "$$@"' $(PID) $$args > $(LOG) 2>&1 < /dev/null & \
	  for i in 1 2 3 4 5 6 7 8 9 10; do [ -s $(PID) ] && break; sleep 0.2; done; \
	  echo "bots de $(MUNDO_) (PID $$(cat $(PID))):$$args"; echo "registro: $(LOG)"
	@sleep 8; tail -n 5 $(LOG)

casual:
	@$(MAKE) --no-print-directory bots ROL=casual

speedrunner:
	@$(MAKE) --no-print-directory bots ROL=speedrunner

# solo el PID apuntado y solo si es node io.js (como parar.sh con el server); a todo su grupo (setsid), nunca pkill -f
bots-parar:
	@if [ ! -f $(PID) ]; then echo "no hay bots de $(MUNDO_) apuntados"; exit 0; fi; \
	  p=$$(cat $(PID)); \
	  if ! kill -0 $$p 2>/dev/null; then echo "ya no están en marcha (PID $$p)"; rm -f $(PID); exit 0; fi; \
	  if ! tr '\0' ' ' < /proc/$$p/cmdline | grep -q 'io.js'; then echo "el PID $$p no es de los bots: no lo toco"; exit 1; fi; \
	  kill -TERM -- -$$p 2>/dev/null || kill -TERM $$p; \
	  for i in $$(seq 1 20); do kill -0 $$p 2>/dev/null || { rm -f $(PID); echo "bots de $(MUNDO_) parados"; exit 0; }; sleep 1; done; \
	  echo "siguen en marcha tras 20 s (PID $$p)"; exit 1

bots-log:
	tail -n 30 -f $(LOG)

# --- manejo en caliente ---------------------------------------------------------------------------------------------------------
estado:
	@$(call pedir,$(PUERTO),estado)

estados:
	@p=$(strip $(PUERTO)); for n in $(BOTS); do printf "%s (%s): " $$n $$p; \
	  curl -s --max-time 10 "127.0.0.1:$$p/?c=estado" || printf "no responde"; echo; p=$$((p + 1)); done

progreso:
	@curl -s --max-time 10 "127.0.0.1:$(strip $(PUERTO))/?c=progreso" | python3 -c "$$PROGRESO"

# progreso en tres líneas: rol y etapa, las hechas con su día y las pendientes
define PROGRESO
import json, sys
d = json.load(sys.stdin)
print(f"rol {d.get('rol')} · etapa {d.get('etapa')} · falta {', '.join(d.get('falta') or []) or '—'}")
print("hechas: " + (", ".join(f"{k} (día {v.get('dia')})" for k, v in (d.get("hechas") or {}).items()) or "ninguna"))
print("pendientes: " + (", ".join(d.get("pendientes") or []) or "ninguna"))
endef
export PROGRESO

rol:
	@$(call pedir,$(PUERTO),decisor capataz $(ROL_))

estilo:
	@$(call pedir,$(PUERTO),orden perfil $(strip $(ESTILO)))

decisor:
	@$(call pedir,$(PUERTO),decisor $(strip $(DECISOR)))

libre:
	@$(call pedir,$(PUERTO),modo libre)

quieto:
	@$(call pedir,$(PUERTO),modo ordenes)

orden:
	@$(call pedir,$(PUERTO),orden $(strip $(TEXTO)))

# --- pruebas y bancos -----------------------------------------------------------------------------------------------------------
# la parte A de probar_libre_seco pide entrenamiento/ejecuciones/ (datos sin versionar): su fallo no cuenta si es solo ese
pruebas:
	@cd bot && mal=0; for t in probar_*_seco.js; do printf "%-32s " $$t; s=$$(node $$t 2>&1); u=$$(echo "$$s" | tail -n 1); echo "$$u"; \
	  if ! echo "$$u" | grep -qE "bien|todo bien"; then \
	    if [ $$t = probar_libre_seco.js ] && [ "$$(echo "$$s" | grep -c "^  FALLO")" = 1 ] && echo "$$s" | grep -q "decisiones registradas del mundo del usuario"; then \
	      echo "                                 (solo la parte A: faltan los registros del mundo del usuario en este PC)"; \
	    else mal=1; fi; fi; done; exit $$mal

validar-perfiles:
	node bot/probar_perfiles_seco.js | tail -n 1
	python entrenamiento/perfiles_v2.py --comprobar

banco-humo:
	IO_SERVIDOR=local python entrenamiento/experimentos_roles.py --puntos entrenamiento/puntos_k.json --dias 0.1

banco-k:
	IO_SERVIDOR=local python entrenamiento/experimentos_roles.py --puntos entrenamiento/puntos_k.json --dias $(strip $(DIAS)) \
	  $(if $(strip $(BASE)),--comparar $(strip $(BASE)))

banco-preparar:
	@test -n "$(strip $(ZONA))" || { echo "falta ZONA=… (una sin usar; las medidas hasta ahora llegan a la 77)"; exit 1; }
	IO_SERVIDOR=local python entrenamiento/experimentos_roles.py --preparar-puntos entrenamiento/puntos_k.json --zona $(strip $(ZONA))
