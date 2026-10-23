#!/usr/bin/env python3
"""Hub de contexto compartido de project-soma: un servidor HTTP pequeño (solo biblioteca estándar, sqlite) que corre en UN PC
de la red local y al que los agentes de Claude Code de las dos personas publican su estado, los archivos que tocan y mensajes
para el otro. Los agentes lo consultan con compartido/cliente.py (a mano y desde los hooks de .claude/settings.json).
Arranque (en el PC que hace de hub, normalmente el del compañero):
  SOMA_HUB_TOKEN=secreto python3 compartido/hub.py [--puerto 3100] [--bind 0.0.0.0] [--db compartido/hub.db]
Todas las peticiones llevan la cabecera X-Soma-Token con ese secreto; sin ella, 401. Cuerpos y respuestas en JSON.
Rutas:
  GET  /salud                          {ok, agentes_en_linea}
  PUT  /estado/<agente>  {texto}       reemplaza el estado publicado de ese agente
  GET  /estado                         [{agente, texto, hora}] de todos
  POST /mensajes  {de, para, texto}    -> {id}
  GET  /mensajes?para=X[&desde=ID]     mensajes para X con id > ID
  POST /eventos   {agente, tipo, dato} tipo: archivo | presencia (dato: en_linea | fuera)
  GET  /eventos?excepto=X[&desde=ID]   eventos de los demás con id > ID
  GET  /novedades?agente=X             lo que X aún no vio (mensajes para él, eventos de los demás) + estados de los demás;
                                       avanza los cursores de X (la segunda llamada seguida no repite nada)
Los eventos de más de 7 días se borran al arrancar; los mensajes y estados se conservan."""
import argparse, json, os, sqlite3, sys, threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import parse_qs, urlparse

AQUI = Path(__file__).resolve().parent
DB_POR_DEFECTO = AQUI / "hub.db"
PUERTO = 3100
DIAS_EVENTOS = 7

ESQUEMA = """
CREATE TABLE IF NOT EXISTS mensajes (id INTEGER PRIMARY KEY AUTOINCREMENT, de TEXT NOT NULL, para TEXT NOT NULL,
                                     texto TEXT NOT NULL, hora TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS estado   (agente TEXT PRIMARY KEY, texto TEXT NOT NULL,
                                     hora TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS eventos  (id INTEGER PRIMARY KEY AUTOINCREMENT, agente TEXT NOT NULL, tipo TEXT NOT NULL,
                                     dato TEXT NOT NULL, hora TEXT NOT NULL DEFAULT (datetime('now','localtime')));
CREATE TABLE IF NOT EXISTS cursores (lector TEXT PRIMARY KEY, ultimo_mensaje INTEGER NOT NULL DEFAULT 0,
                                     ultimo_evento INTEGER NOT NULL DEFAULT 0);
"""


class Almacen:
    """La base de datos, con un cerrojo: el servidor atiende en hilos y sqlite prefiere una conexión por hilo."""

    def __init__(self, ruta):
        self.ruta = str(ruta)
        self.cerrojo = threading.Lock()
        with self._con() as con:
            con.executescript(ESQUEMA)

    def _con(self):
        con = sqlite3.connect(self.ruta)
        con.row_factory = sqlite3.Row
        return con

    def _filas(self, con, sql, *args):
        return [dict(f) for f in con.execute(sql, args).fetchall()]

    def salud(self):
        with self.cerrojo, self._con() as con:
            # el último evento de presencia de cada agente decide si está en línea
            filas = self._filas(con, "SELECT agente, dato FROM eventos WHERE tipo='presencia' AND id IN "
                                     "(SELECT max(id) FROM eventos WHERE tipo='presencia' GROUP BY agente) ORDER BY agente")
            return {"ok": True, "agentes_en_linea": [f["agente"] for f in filas if f["dato"].startswith("en_linea")]}

    def poner_estado(self, agente, texto):
        with self.cerrojo, self._con() as con:
            con.execute("INSERT INTO estado (agente, texto) VALUES (?, ?) ON CONFLICT(agente) DO UPDATE SET texto=excluded.texto, "
                        "hora=datetime('now','localtime')", (agente, texto))

    def estados(self, excepto=None):
        with self.cerrojo, self._con() as con:
            return self._filas(con, "SELECT agente, texto, hora FROM estado WHERE agente != ? ORDER BY agente", excepto or "")

    def enviar(self, de, para, texto):
        with self.cerrojo, self._con() as con:
            return con.execute("INSERT INTO mensajes (de, para, texto) VALUES (?, ?, ?)", (de, para, texto)).lastrowid

    def mensajes(self, para, desde=0):
        with self.cerrojo, self._con() as con:
            return self._filas(con, "SELECT id, de, para, texto, hora FROM mensajes WHERE para=? AND id>? ORDER BY id", para, desde)

    def anotar_evento(self, agente, tipo, dato):
        with self.cerrojo, self._con() as con:
            return con.execute("INSERT INTO eventos (agente, tipo, dato) VALUES (?, ?, ?)", (agente, tipo, dato)).lastrowid

    def eventos(self, excepto, desde=0):
        with self.cerrojo, self._con() as con:
            return self._filas(con, "SELECT id, agente, tipo, dato, hora FROM eventos WHERE agente != ? AND id>? ORDER BY id",
                               excepto, desde)

    def novedades(self, agente):
        with self.cerrojo, self._con() as con:
            cur = con.execute("SELECT ultimo_mensaje, ultimo_evento FROM cursores WHERE lector=?", (agente,)).fetchone()
            um, ue = (cur["ultimo_mensaje"], cur["ultimo_evento"]) if cur else (0, 0)
            mensajes = self._filas(con, "SELECT id, de, para, texto, hora FROM mensajes WHERE para=? AND id>? ORDER BY id", agente, um)
            eventos = self._filas(con, "SELECT id, agente, tipo, dato, hora FROM eventos WHERE agente != ? AND id>? ORDER BY id",
                                  agente, ue)
            estados = self._filas(con, "SELECT agente, texto, hora FROM estado WHERE agente != ? ORDER BY agente", agente)
            um = max([um] + [m["id"] for m in mensajes])
            ue = max([ue] + [e["id"] for e in eventos])
            con.execute("INSERT INTO cursores (lector, ultimo_mensaje, ultimo_evento) VALUES (?, ?, ?) ON CONFLICT(lector) DO UPDATE "
                        "SET ultimo_mensaje=excluded.ultimo_mensaje, ultimo_evento=excluded.ultimo_evento", (agente, um, ue))
            return {"mensajes": mensajes, "eventos": eventos, "estados": estados}

    def limpiar_eventos_viejos(self, dias):
        with self.cerrojo, self._con() as con:
            con.execute("DELETE FROM eventos WHERE hora < datetime('now','localtime', ?)", ("-%d days" % dias,))


def limpiar_eventos_viejos(db, dias=DIAS_EVENTOS):
    Almacen(db).limpiar_eventos_viejos(dias)


class PeticionMala(Exception):
    pass


class Manejador(BaseHTTPRequestHandler):
    server_version = "SomaHub/1"

    def log_message(self, fmt, *args):  # una línea por petición, sin la fecha repetida de la clase base
        if self.server.registrar:
            sys.stderr.write("%s %s\n" % (self.address_string(), fmt % args))

    def _responder(self, codigo, cuerpo):
        datos = json.dumps(cuerpo, ensure_ascii=False).encode()
        self.send_response(codigo)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(datos)))
        self.end_headers()
        self.wfile.write(datos)

    def _cuerpo(self, *claves):
        n = int(self.headers.get("Content-Length") or 0)
        try:
            datos = json.loads(self.rfile.read(n) or b"{}")
        except ValueError:
            raise PeticionMala("el cuerpo no es JSON")
        if not isinstance(datos, dict) or any(not isinstance(datos.get(c), str) or not datos[c].strip() for c in claves):
            raise PeticionMala("faltan campos: " + ", ".join(claves))
        return datos

    def _atender(self, metodo):
        if self.headers.get("X-Soma-Token") != self.server.token:
            return self._responder(401, {"error": "token incorrecto o ausente"})
        url = urlparse(self.path)
        partes = [p for p in url.path.split("/") if p]
        q = {k: v[0] for k, v in parse_qs(url.query).items()}
        a = self.server.almacen
        try:
            desde = int(q.get("desde", 0))
            if metodo == "GET" and partes == ["salud"]:
                return self._responder(200, a.salud())
            if metodo == "GET" and partes == ["estado"]:
                return self._responder(200, a.estados())
            if metodo == "PUT" and len(partes) == 2 and partes[0] == "estado":
                a.poner_estado(partes[1], self._cuerpo("texto")["texto"])
                return self._responder(200, {"ok": True})
            if metodo == "POST" and partes == ["mensajes"]:
                d = self._cuerpo("de", "para", "texto")
                return self._responder(200, {"id": a.enviar(d["de"], d["para"], d["texto"])})
            if metodo == "GET" and partes == ["mensajes"]:
                if "para" not in q:
                    raise PeticionMala("falta ?para=")
                return self._responder(200, a.mensajes(q["para"], desde))
            if metodo == "POST" and partes == ["eventos"]:
                d = self._cuerpo("agente", "tipo", "dato")
                return self._responder(200, {"id": a.anotar_evento(d["agente"], d["tipo"], d["dato"])})
            if metodo == "GET" and partes == ["eventos"]:
                if "excepto" not in q:
                    raise PeticionMala("falta ?excepto=")
                return self._responder(200, a.eventos(q["excepto"], desde))
            if metodo == "GET" and partes == ["novedades"]:
                if "agente" not in q:
                    raise PeticionMala("falta ?agente=")
                return self._responder(200, a.novedades(q["agente"]))
        except (PeticionMala, ValueError) as e:
            return self._responder(400, {"error": str(e)})
        self._responder(404, {"error": "ruta desconocida"})

    def do_GET(self):
        self._atender("GET")

    def do_POST(self):
        self._atender("POST")

    def do_PUT(self):
        self._atender("PUT")


def crear_servidor(bind, puerto, db, token, registrar=True):
    """El servidor listo para serve_forever(); con puerto 0 el sistema elige uno (server_address[1])."""
    if not token:
        raise SystemExit("falta el token: SOMA_HUB_TOKEN=secreto python3 hub.py")
    servidor = ThreadingHTTPServer((bind, puerto), Manejador)
    servidor.daemon_threads = True
    servidor.token = token
    servidor.registrar = registrar
    servidor.almacen = Almacen(db)
    return servidor


def main(argv=None):
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--puerto", type=int, default=PUERTO)
    ap.add_argument("--bind", default="0.0.0.0")
    ap.add_argument("--db", type=Path, default=DB_POR_DEFECTO)
    a = ap.parse_args(argv)
    limpiar_eventos_viejos(a.db)
    servidor = crear_servidor(a.bind, a.puerto, a.db, os.environ.get("SOMA_HUB_TOKEN", ""))
    print("hub en http://%s:%d  (db: %s)" % (a.bind, servidor.server_address[1], a.db), flush=True)
    try:
        servidor.serve_forever()
    except KeyboardInterrupt:
        pass
    finally:
        servidor.server_close()


if __name__ == "__main__":
    main()
