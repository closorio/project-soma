#!/usr/bin/env bash
# Versionado (semver, etiquetas vMAYOR.MENOR.PARCHE) a partir de los commits convencionales (feat/fix/chore…), sin ficheros de versión que
# mantener ni conflictos: la versión es la última etiqueta vX.Y.Z alcanzable desde la rama que se mira (por defecto upstream/develop).
#   herramientas/version.sh actual                  última versión y cuántos commits lleva encima
#   herramientas/version.sh siguiente               qué versión toca y el registro de cambios desde la última
#   herramientas/version.sh publicar [major|minor|parche] [--hacer]
#                                                   etiqueta la versión (por defecto la que toca) y la sube a tu fork (origin); si es MAJOR,
#                                                   además abre la PR de esa versión hacia el main de tu fork. Sin --hacer solo enseña qué haría.
# Reglas: MAJOR = commit con «!» (feat(bot)!: …) o «BREAKING CHANGE» en el cuerpo, o `major` a mano · MINOR = hay algún feat ·
# PARCHE = el resto (fix, chore, docs, merge de fases…). Los merges no cuentan. La rama de la PR es release/vX.Y.Z (en tu fork).
# Variables: VERSION_REF (rama a versionar, por defecto upstream/develop) · FORK (por defecto el dueño de «origin», p. ej. Count-I/project-soma).
set -eu
cd "$(dirname "$0")/.."
REF=${VERSION_REF:-upstream/develop}
git rev-parse --verify -q "$REF" > /dev/null || { echo "no existe $REF (git fetch upstream)"; exit 1; }
FORK=${FORK:-$(git remote get-url origin | sed -E 's#(git@github.com:|https://github.com/)##; s#\.git$##')}

ultima=$(git describe --tags --abbrev=0 --match 'v[0-9]*' "$REF" 2>/dev/null || true)
rango=${ultima:+$ultima..}$REF
mapfile -t asuntos < <(git log --no-merges --format=%s "$rango")
cuerpos=$(git log --no-merges --format=%b "$rango")

# qué tipo de subida piden los commits: major | minor | parche | ninguna
tipo=ninguna
if [ ${#asuntos[@]} -gt 0 ]; then
  tipo=parche
  for s in "${asuntos[@]}"; do [[ $s =~ ^feat(\(.*\))?!?: ]] && tipo=minor; done
  for s in "${asuntos[@]}"; do [[ $s =~ ^[a-z]+(\(.*\))?!: ]] && tipo=major; done
  grep -q 'BREAKING CHANGE' <<< "$cuerpos" && tipo=major
fi

subir() { # subir VERSION TIPO
  local v=${1#v} t=$2 M m p
  IFS=. read -r M m p <<< "$v"
  case $t in major) echo "v$((M + 1)).0.0" ;; minor) echo "v$M.$((m + 1)).0" ;; parche) echo "v$M.$m.$((p + 1))" ;; esac
}

registro() { # los commits agrupados por tipo
  local grupo etiqueta s
  for par in "feat:Novedades" "fix:Arreglos" "docs:Documentación" "chore:Mantenimiento" "refactor:Refactor" "test:Pruebas"; do
    grupo=${par%%:*}; etiqueta=${par#*:}
    local lineas=()
    for s in "${asuntos[@]}"; do [[ $s =~ ^$grupo(\(.*\))?!?:\ (.*)$ ]] && lineas+=("- ${BASH_REMATCH[2]}${BASH_REMATCH[1]:+ ${BASH_REMATCH[1]}}"); done
    [ ${#lineas[@]} -gt 0 ] && { echo "### $etiqueta"; printf '%s\n' "${lineas[@]}"; echo; }
  done
  local otros=()
  for s in "${asuntos[@]}"; do [[ $s =~ ^(feat|fix|docs|chore|refactor|test)(\(.*\))?!?: ]] || otros+=("- $s"); done
  [ ${#otros[@]} -gt 0 ] && { echo "### Otros"; printf '%s\n' "${otros[@]}"; echo; }
  return 0
}

base=${ultima:-v0.0.0}
case "${1:-actual}" in
  actual)
    echo "versión: ${ultima:-ninguna (aún sin etiquetar)} · $REF lleva ${#asuntos[@]} commits encima (sin merges)" ;;
  siguiente)
    if [ "$tipo" = ninguna ]; then echo "nada nuevo desde ${ultima:-el principio}: sigue en ${ultima:-ninguna}"; exit 0; fi
    echo "$base → $(subir "$base" "$tipo")  (sube $tipo)"; echo; registro ;;
  publicar)
    pedido=${2:-}; [ "${pedido:-}" = --hacer ] && pedido=""
    [ -n "$pedido" ] && tipo=$pedido
    case $tipo in major|minor|parche) ;; ninguna) echo "no hay commits nuevos desde ${ultima:-el principio}: nada que publicar"; exit 0 ;; *) echo "tipo no válido: $tipo (major, minor o parche)"; exit 1 ;; esac
    nueva=$(subir "$base" "$tipo"); sha=$(git rev-parse "$REF")
    cuerpo=$(registro)
    echo "$base → $nueva  (sube $tipo) en $REF (${sha:0:9})"
    echo "  · etiqueta anotada $nueva y subida a origin"
    [ "$tipo" = major ] && echo "  · rama release/$nueva en origin y PR hacia $FORK:main"
    if [[ " $* " != *" --hacer "* ]]; then echo "(no hecho: añade --hacer)"; exit 0; fi
    git tag -a "$nueva" "$sha" -m "$nueva" -m "$cuerpo"
    git push origin "$nueva"
    if [ "$tipo" = major ]; then
      git push origin "$sha:refs/heads/release/$nueva"
      gh pr create --repo "$FORK" --base main --head "release/$nueva" --title "release: $nueva" --body "$cuerpo"
    fi ;;
  *) sed -n '2,12p' "$0"; exit 1 ;;
esac
