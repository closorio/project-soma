#!/bin/bash
# Bancos sin Claude (economía de tokens, 2026-10-31): lanza en serie los bancos de BENCHES con lo que cada uno necesita
# arrancado y lo para al acabar, uno cada vez (regla de RAM de F7: nunca dos servidores con el cliente abierto). Si hay menos
# de 3 GB disponibles antes de un banco, lo salta. Todo va a entrenamiento/ejecuciones/nocturno-AAAAMMDD-HHMM.log, con una
# línea «== banco: resultado» por banco; después, `make report` lo resume.
# Uso: entrenamiento/nocturno.sh "smoke-26-3 bench-k"   (o make nightly BENCHES="…", que lo deja en segundo plano)
set -u
cd "$(dirname "$0")/.."
LOG=entrenamiento/ejecuciones/nocturno-$(date +%Y%m%d-%H%M).log
mkdir -p entrenamiento/ejecuciones
libre() { awk '/^MemAvailable:/ {print int($2/1024)}' /proc/meminfo; }
{
  echo "nocturno $(date '+%F %T'): ${1:-}"
  for b in ${1:-}; do
    if [ "$(libre)" -lt 3072 ]; then echo "== $b: saltado ($(libre) MB libres)"; continue; fi
    case "$b" in
      smoke-26-3)
        make --no-print-directory user-server-start proxy-start assistant
        make --no-print-directory smoke-26-3; r=$?
        make --no-print-directory bots-stop WORLD=usuario proxy-stop user-server-stop ;;
      bench-k|bench-smoke|bench-gather)
        make --no-print-directory "$b"; r=$? ;;
      *) echo "== $b: desconocido (smoke-26-3, bench-k, bench-smoke, bench-gather)"; continue ;;
    esac
    [ "$r" = 0 ] && echo "== $b: bien" || echo "== $b: fallo (código $r)"
  done
  echo "== fin $(date '+%T')"
} > "$LOG" 2>&1
echo "$LOG"
