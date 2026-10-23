"""Pruebas del hub (compartido/hub.py) y del cliente (compartido/cliente.py): el hub arranca en un hilo en un puerto libre con
una base de datos temporal; el cliente se invoca por main([...]) con las variables de entorno apuntando a ese hub.
Ejecutar: python3 -m unittest compartido/test_hub.py -v"""
import json, os, tempfile, threading, unittest, urllib.error, urllib.request
from pathlib import Path

import hub

TOKEN = "secreto-de-prueba"


class HubEnMarcha:
    """Levanta el hub en un hilo con una db temporal; .url es la base, .pedir hace peticiones JSON."""

    def __init__(self, token=TOKEN):
        self.tmp = tempfile.TemporaryDirectory()
        self.db = Path(self.tmp.name) / "hub.db"
        self.servidor = hub.crear_servidor("127.0.0.1", 0, self.db, token, registrar=False)
        self.url = "http://127.0.0.1:%d" % self.servidor.server_address[1]
        self.hilo = threading.Thread(target=self.servidor.serve_forever, kwargs={"poll_interval": 0.05}, daemon=True)
        self.hilo.start()

    def cerrar(self):
        self.servidor.shutdown()
        self.servidor.server_close()
        self.tmp.cleanup()

    def pedir(self, metodo, ruta, cuerpo=None, token=TOKEN):
        datos = json.dumps(cuerpo).encode() if cuerpo is not None else None
        req = urllib.request.Request(self.url + ruta, data=datos, method=metodo)
        if token is not None:
            req.add_header("X-Soma-Token", token)
        if datos is not None:
            req.add_header("Content-Type", "application/json")
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                return r.status, json.loads(r.read() or b"null")
        except urllib.error.HTTPError as e:
            return e.code, json.loads(e.read() or b"null")


class PruebasHub(unittest.TestCase):
    def setUp(self):
        self.h = HubEnMarcha()
        self.addCleanup(self.h.cerrar)

    def test_sin_token_responde_401(self):
        estado, _ = self.h.pedir("GET", "/salud", token=None)
        self.assertEqual(estado, 401)
        estado, _ = self.h.pedir("GET", "/salud", token="otro")
        self.assertEqual(estado, 401)

    def test_salud_con_token(self):
        estado, cuerpo = self.h.pedir("GET", "/salud")
        self.assertEqual(estado, 200)
        self.assertTrue(cuerpo["ok"])
        self.assertEqual(cuerpo["agentes_en_linea"], [])

    def test_ruta_desconocida_404(self):
        estado, _ = self.h.pedir("GET", "/nada")
        self.assertEqual(estado, 404)

    def test_estado_se_publica_y_se_reemplaza(self):
        self.h.pedir("PUT", "/estado/seppuq", {"texto": "arreglando bot/io.js"})
        self.h.pedir("PUT", "/estado/count", {"texto": "entrenando"})
        self.h.pedir("PUT", "/estado/seppuq", {"texto": "terminé bot/io.js"})
        estado, cuerpo = self.h.pedir("GET", "/estado")
        self.assertEqual(estado, 200)
        por_agente = {e["agente"]: e for e in cuerpo}
        self.assertEqual(set(por_agente), {"seppuq", "count"})
        self.assertEqual(por_agente["seppuq"]["texto"], "terminé bot/io.js")
        self.assertIn("hora", por_agente["seppuq"])

    def test_mensajes_se_envian_y_se_leen_por_destinatario(self):
        estado, cuerpo = self.h.pedir("POST", "/mensajes", {"de": "seppuq", "para": "count", "texto": "hola"})
        self.assertEqual(estado, 200)
        self.assertEqual(cuerpo["id"], 1)
        self.h.pedir("POST", "/mensajes", {"de": "count", "para": "seppuq", "texto": "qué tal"})
        _, para_count = self.h.pedir("GET", "/mensajes?para=count")
        self.assertEqual([m["texto"] for m in para_count], ["hola"])
        self.assertEqual(para_count[0]["de"], "seppuq")
        _, desde = self.h.pedir("GET", "/mensajes?para=count&desde=1")
        self.assertEqual(desde, [])

    def test_mensaje_incompleto_400(self):
        estado, _ = self.h.pedir("POST", "/mensajes", {"de": "seppuq", "texto": "sin destinatario"})
        self.assertEqual(estado, 400)

    def test_eventos_del_otro(self):
        self.h.pedir("POST", "/eventos", {"agente": "seppuq", "tipo": "archivo", "dato": "bot/io.js"})
        self.h.pedir("POST", "/eventos", {"agente": "count", "tipo": "archivo", "dato": "entrenamiento/mundo.py"})
        _, ev = self.h.pedir("GET", "/eventos?excepto=count")
        self.assertEqual([(e["agente"], e["dato"]) for e in ev], [("seppuq", "bot/io.js")])

    def test_novedades_devuelve_lo_nuevo_y_avanza_cursores(self):
        self.h.pedir("PUT", "/estado/seppuq", {"texto": "tocando el bot"})
        self.h.pedir("PUT", "/estado/count", {"texto": "mi propio estado"})
        self.h.pedir("POST", "/mensajes", {"de": "seppuq", "para": "count", "texto": "hola"})
        self.h.pedir("POST", "/mensajes", {"de": "count", "para": "seppuq", "texto": "no es para mí"})
        self.h.pedir("POST", "/eventos", {"agente": "seppuq", "tipo": "archivo", "dato": "bot/io.js"})
        self.h.pedir("POST", "/eventos", {"agente": "count", "tipo": "archivo", "dato": "mío.py"})
        estado, n = self.h.pedir("GET", "/novedades?agente=count")
        self.assertEqual(estado, 200)
        self.assertEqual([m["texto"] for m in n["mensajes"]], ["hola"])
        self.assertEqual([e["dato"] for e in n["eventos"]], ["bot/io.js"])
        self.assertEqual([e["agente"] for e in n["estados"]], ["seppuq"])  # los estados de los demás, no el mío
        _, otra = self.h.pedir("GET", "/novedades?agente=count")
        self.assertEqual(otra["mensajes"], [])
        self.assertEqual(otra["eventos"], [])
        self.assertEqual([e["agente"] for e in otra["estados"]], ["seppuq"])  # los estados siempre se devuelven
        self.h.pedir("POST", "/mensajes", {"de": "seppuq", "para": "count", "texto": "segundo"})
        _, tercera = self.h.pedir("GET", "/novedades?agente=count")
        self.assertEqual([m["texto"] for m in tercera["mensajes"]], ["segundo"])

    def test_novedades_sin_agente_400(self):
        estado, _ = self.h.pedir("GET", "/novedades")
        self.assertEqual(estado, 400)

    def test_presencia_sale_en_salud(self):
        self.h.pedir("POST", "/eventos", {"agente": "seppuq", "tipo": "presencia", "dato": "en_linea"})
        self.h.pedir("POST", "/eventos", {"agente": "count", "tipo": "presencia", "dato": "en_linea"})
        self.h.pedir("POST", "/eventos", {"agente": "count", "tipo": "presencia", "dato": "fuera"})
        _, salud = self.h.pedir("GET", "/salud")
        self.assertEqual(salud["agentes_en_linea"], ["seppuq"])

    def test_eventos_viejos_se_borran_al_arrancar(self):
        self.h.pedir("POST", "/eventos", {"agente": "seppuq", "tipo": "archivo", "dato": "viejo.py"})
        self.h.pedir("POST", "/eventos", {"agente": "seppuq", "tipo": "archivo", "dato": "nuevo.py"})
        import sqlite3
        con = sqlite3.connect(self.h.db)
        con.execute("UPDATE eventos SET hora = datetime('now', '-8 days') WHERE dato = 'viejo.py'")
        con.commit(); con.close()
        hub.limpiar_eventos_viejos(self.h.db, dias=7)
        _, ev = self.h.pedir("GET", "/eventos?excepto=nadie")
        self.assertEqual([e["dato"] for e in ev], ["nuevo.py"])


import contextlib, io, sys, time
from unittest import mock

import cliente


class PruebasCliente(unittest.TestCase):
    """cliente.main([...]) contra un hub real en marcha, con el entorno de un agente llamado «seppuq»."""

    def setUp(self):
        self.h = HubEnMarcha()
        self.addCleanup(self.h.cerrar)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.repo = Path(self.tmp.name) / "repo"
        (self.repo / "bot").mkdir(parents=True)
        self.entorno = {"SOMA_AGENTE": "seppuq", "SOMA_HUB": self.h.url, "SOMA_HUB_TOKEN": TOKEN, "SOMA_COMPANERO": "count"}
        self.addCleanup(mock.patch.stopall)
        mock.patch.dict(os.environ, self.entorno).start()
        mock.patch.object(cliente, "DIR_LOCAL", Path(self.tmp.name)).start()  # cursores y local.json fuera del repo real

    def correr(self, argv, stdin=None, entorno=None):
        """(código de salida, stdout) de main(argv) con ese stdin (dict -> JSON) y, opcionalmente, otro entorno."""
        salida = io.StringIO()
        entrada = io.StringIO(json.dumps(stdin) if isinstance(stdin, dict) else (stdin or ""))
        with contextlib.redirect_stdout(salida), mock.patch.object(sys, "stdin", entrada), \
             mock.patch.dict(os.environ, entorno if entorno is not None else {}, clear=entorno is not None):
            try:
                codigo = cliente.main(argv) or 0
            except SystemExit as e:
                codigo = e.code if isinstance(e.code, int) else 1
        return codigo, salida.getvalue()

    def como(self, agente, argv, stdin=None):
        return self.correr(argv, stdin, dict(self.entorno, SOMA_AGENTE=agente, SOMA_COMPANERO="seppuq" if agente != "seppuq" else "count"))

    # --- órdenes del agente ---

    def test_estado_y_tablon(self):
        self.assertEqual(self.correr(["estado", "arreglando bot/io.js"])[0], 0)
        self.assertEqual(self.como("count", ["estado", "entrenando la red"])[0], 0)
        codigo, salida = self.correr(["tablon"])
        self.assertEqual(codigo, 0)
        self.assertIn("seppuq", salida); self.assertIn("arreglando bot/io.js", salida)
        self.assertIn("count", salida); self.assertIn("entrenando la red", salida)

    def test_enviar_y_leer_marca_leido(self):
        codigo, salida = self.correr(["enviar", "ya está el endpoint"])  # --para por defecto: SOMA_COMPANERO
        self.assertEqual(codigo, 0)
        codigo, salida = self.como("count", ["leer"])
        self.assertEqual(codigo, 0)
        self.assertIn("ya está el endpoint", salida); self.assertIn("seppuq", salida)
        codigo, salida = self.como("count", ["leer"])
        self.assertNotIn("ya está el endpoint", salida)

    def test_enviar_sin_destinatario_conocido_falla(self):
        entorno = dict(self.entorno); del entorno["SOMA_COMPANERO"]
        codigo, salida = self.correr(["enviar", "hola"], entorno=entorno)
        self.assertEqual(codigo, 1)
        self.assertIn("--para", salida)

    def test_enviar_con_hub_caido_avisa(self):
        codigo, salida = self.correr(["enviar", "hola"], entorno=dict(self.entorno, SOMA_HUB="http://127.0.0.1:9"))
        self.assertEqual(codigo, 1)
        self.assertIn("ERROR", salida)

    def test_sin_configuracion_explica(self):
        codigo, salida = self.correr(["tablon"], entorno={})
        self.assertEqual(codigo, 1)
        self.assertIn("SOMA_AGENTE", salida)

    def test_local_json_sirve_de_respaldo(self):
        (Path(self.tmp.name) / "local.json").write_text(json.dumps(self.entorno))
        codigo, salida = self.correr(["estado", "desde local.json"], entorno={})
        self.assertEqual(codigo, 0)
        self.assertIn("desde local.json", self.correr(["tablon"])[1])

    # --- hooks ---

    def test_hook_novedades_sin_nada_calla(self):
        codigo, salida = self.correr(["hook-novedades"], {"hook_event_name": "UserPromptSubmit", "prompt": "hola"})
        self.assertEqual(codigo, 0)
        self.assertEqual(salida, "")

    def test_hook_novedades_inyecta_mensajes_y_archivos_como_datos(self):
        self.como("count", ["enviar", "cuidado con bot/io.js"])
        self.como("count", ["estado", "tocando el bot"])
        self.como("count", ["hook-archivo"], {"hook_event_name": "PostToolUse", "cwd": str(self.repo),
                                               "tool_input": {"file_path": str(self.repo / "bot" / "io.js")}})
        codigo, salida = self.correr(["hook-novedades"], {"hook_event_name": "UserPromptSubmit", "prompt": "sigue"})
        self.assertEqual(codigo, 0)
        datos = json.loads(salida)
        self.assertEqual(datos["hookSpecificOutput"]["hookEventName"], "UserPromptSubmit")
        ctx = datos["hookSpecificOutput"]["additionalContext"]
        self.assertIn("DATOS", ctx)
        self.assertIn('<mensaje-companero de="count"', ctx); self.assertIn("cuidado con bot/io.js", ctx)
        self.assertIn("tocando el bot", ctx)
        self.assertIn("bot/io.js", ctx)
        codigo, salida = self.correr(["hook-novedades"], {"hook_event_name": "UserPromptSubmit", "prompt": "otra"})
        self.assertEqual(salida, "")  # ya consumido

    def test_hook_novedades_en_session_start_trae_el_tablon(self):
        self.como("count", ["estado", "entrenando"])
        self.correr(["hook-novedades"], {"hook_event_name": "UserPromptSubmit", "prompt": "x"})  # consume lo nuevo
        codigo, salida = self.correr(["hook-novedades"], {"hook_event_name": "SessionStart", "source": "startup"})
        datos = json.loads(salida)
        self.assertEqual(datos["hookSpecificOutput"]["hookEventName"], "SessionStart")
        self.assertIn("entrenando", datos["hookSpecificOutput"]["additionalContext"])

    def test_hook_archivo_relativiza_filtra_y_deduplica(self):
        ev = lambda ruta: self.correr(["hook-archivo"], {"hook_event_name": "PostToolUse", "cwd": str(self.repo),
                                                           "tool_input": {"file_path": ruta}})
        self.assertEqual(ev(str(self.repo / "bot" / "io.js")), (0, ""))
        ev(str(self.repo / "bot" / "io.js"))                 # repetido: no se publica
        ev("/etc/hosts")                                     # fuera del repo: no
        ev(str(self.repo / "compartido" / "hub.db"))         # la base del hub: no
        ev(str(self.repo / ".cursor-seppuq.json"))           # archivos ocultos: no
        _, eventos = self.h.pedir("GET", "/eventos?excepto=nadie")
        self.assertEqual([(e["agente"], e["tipo"], e["dato"]) for e in eventos], [("seppuq", "archivo", "bot/io.js")])

    def test_hook_presencia(self):
        self.correr(["hook-presencia", "en_linea"], {"hook_event_name": "Stop", "last_assistant_message": "He terminado el bot. " * 30})
        self.assertEqual(self.h.pedir("GET", "/salud")[1]["agentes_en_linea"], ["seppuq"])
        _, eventos = self.h.pedir("GET", "/eventos?excepto=nadie")
        self.assertLessEqual(len(eventos[-1]["dato"]), 230)
        self.assertIn("He terminado el bot", eventos[-1]["dato"])
        self.correr(["hook-presencia", "fuera"], {"hook_event_name": "SessionEnd", "reason": "other"})
        self.assertEqual(self.h.pedir("GET", "/salud")[1]["agentes_en_linea"], [])

    def test_hooks_con_hub_caido_o_sin_config_callan(self):
        caido = dict(self.entorno, SOMA_HUB="http://127.0.0.1:9")
        for argv, stdin in [(["hook-novedades"], {"hook_event_name": "UserPromptSubmit"}),
                            (["hook-archivo"], {"hook_event_name": "PostToolUse", "cwd": str(self.repo),
                                                "tool_input": {"file_path": str(self.repo / "bot" / "io.js")}}),
                            (["hook-presencia", "en_linea"], {"hook_event_name": "Stop"})]:
            self.assertEqual(self.correr(argv, stdin, caido), (0, ""), argv)
            self.assertEqual(self.correr(argv, stdin, {}), (0, ""), argv)

    def test_hook_con_stdin_roto_calla(self):
        self.assertEqual(self.correr(["hook-novedades"], "esto no es json"), (0, ""))


if __name__ == "__main__":
    unittest.main()
