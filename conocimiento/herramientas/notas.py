"""Lectura y escritura del frontmatter de las notas del vault (un subconjunto de YAML: claves simples, cadenas con o sin
comillas, listas en línea [a, b] o en bloque con «- ». Sin dependencias: lo usan el hook y los agentes en cualquier PC)."""
import json, re, unicodedata

ESPECIALES = re.compile(r'[:#\[\]{},"\'&*!|>%@`]|^\s|\s$|^-')


def _valor(texto):
    texto = texto.strip()
    if texto.startswith('"') and texto.endswith('"') and len(texto) >= 2:
        try:
            return json.loads(texto)
        except ValueError:
            return texto[1:-1]
    if texto.startswith("'") and texto.endswith("'") and len(texto) >= 2:
        return texto[1:-1].replace("''", "'")
    if texto.startswith("[") and texto.endswith("]"):
        return [_valor(x) for x in _partir(texto[1:-1]) if x.strip()]
    return texto


def _partir(texto):
    """Separa por comas fuera de comillas."""
    partes, actual, comilla = [], "", None
    for c in texto:
        if comilla:
            actual += c
            if c == comilla:
                comilla = None
        elif c in "\"'":
            comilla = c
            actual += c
        elif c == ",":
            partes.append(actual)
            actual = ""
        else:
            actual += c
    partes.append(actual)
    return partes


def frontmatter(texto):
    """Diccionario del bloque --- … --- del principio; vacío si no lo hay o no se cierra."""
    lineas = texto.splitlines()
    if not lineas or lineas[0].strip() != "---":
        return {}
    try:
        fin = next(i for i, l in enumerate(lineas[1:], 1) if l.strip() == "---")
    except StopIteration:
        return {}
    datos, clave = {}, None
    for l in lineas[1:fin]:
        if not l.strip() or l.lstrip().startswith("#"):
            continue
        m = re.match(r"^\s+-\s*(.*)$", l)
        if m and clave is not None:
            if not isinstance(datos.get(clave), list):
                datos[clave] = []
            datos[clave].append(_valor(m.group(1)))
            continue
        m = re.match(r"^([A-Za-z0-9_áéíóúñÁÉÍÓÚÑ.-]+)\s*:\s?(.*)$", l)
        if m:
            clave = m.group(1)
            datos[clave] = _valor(m.group(2)) if m.group(2).strip() else []
    return {k: ("" if v == [] else v) for k, v in datos.items()}


def _escalar(v):
    v = str(v)
    return json.dumps(v, ensure_ascii=False) if (not v or ESPECIALES.search(v)) else v


def a_frontmatter(datos):
    """El bloque --- … --- (con salto final) para ese diccionario; listas en línea."""
    L = ["---"]
    for k, v in datos.items():
        L.append("%s: %s" % (k, "[%s]" % ", ".join(_escalar(x) for x in v) if isinstance(v, (list, tuple)) else _escalar(v)))
    return "\n".join(L + ["---", ""])


def babosa(texto, maximo=60):
    """Nombre de archivo: minúsculas, sin tildes, guiones."""
    t = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode().lower()
    return re.sub(r"[^a-z0-9]+", "-", t).strip("-")[:maximo].strip("-") or "nota"


def notas_de(vault, carpeta):
    """[(ruta, frontmatter)] de los .md de una carpeta del vault, ordenadas por nombre."""
    d = vault / carpeta
    if not d.is_dir():
        return []
    salida = []
    for p in sorted(d.glob("*.md")):
        try:
            salida.append((p, frontmatter(p.read_text(encoding="utf-8"))))
        except (OSError, UnicodeDecodeError):
            pass
    return salida
