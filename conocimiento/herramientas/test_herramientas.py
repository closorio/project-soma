"""Pruebas de las herramientas del vault (conocimiento/herramientas): frontmatter, resumen para el hook y notas de experimento.
Ejecutar: cd conocimiento/herramientas && python3 -m unittest test_herramientas -v"""
import contextlib, io, json, os, sys, tempfile, unittest
from pathlib import Path

import notas, resumen, experimento


def escribir(vault, ruta, frontmatter, cuerpo=""):
    p = Path(vault) / ruta
    p.parent.mkdir(parents=True, exist_ok=True)
    lineas = ["---"] + ["%s: %s" % (k, v) for k, v in frontmatter.items()] + ["---", cuerpo]
    p.write_text("\n".join(lineas), encoding="utf-8")
    return p


class PruebasFrontmatter(unittest.TestCase):
    def test_lee_claves_simples_comillas_y_listas(self):
        texto = '---\ntipo: roadmap\nfase: F7\nsiguiente: "medir: noches sobrevividas"\nfases: [F6, "F7"]\nN: 30\n---\n# Título\n'
        fm = notas.frontmatter(texto)
        self.assertEqual(fm["tipo"], "roadmap")
        self.assertEqual(fm["siguiente"], "medir: noches sobrevividas")
        self.assertEqual(fm["fases"], ["F6", "F7"])
        self.assertEqual(fm["N"], "30")

    def test_lista_en_bloque_y_wikilinks(self):
        texto = '---\nfases:\n  - "[[F6]]"\n  - "[[F7]]"\nautor: seppuq\n---\n'
        self.assertEqual(notas.frontmatter(texto), {"fases": ["[[F6]]", "[[F7]]"], "autor": "seppuq"})

    def test_sin_frontmatter_da_vacio(self):
        self.assertEqual(notas.frontmatter("# solo texto\n"), {})
        self.assertEqual(notas.frontmatter("---\nsin cerrar: x\n"), {})

    def test_ida_y_vuelta(self):
        fm = {"tipo": "experimento", "titulo": 'dice "hola": sí', "politica": ["red", "guion"], "N": 4}
        self.assertEqual(notas.frontmatter(notas.a_frontmatter(fm) + "cuerpo"),
                         {"tipo": "experimento", "titulo": 'dice "hola": sí', "politica": ["red", "guion"], "N": "4"})


class PruebasResumen(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.v = Path(self.tmp.name)

    def test_vault_vacio_no_dice_nada(self):
        self.assertEqual(resumen.resumen(self.v), "")

    def test_fases_en_curso_decisiones_y_ultimo_experimento(self):
        escribir(self.v, "roadmap/F7 Supervivencia.md", {"tipo": "roadmap", "fase": "F7", "estado": "en-curso",
                                                          "responsable": "seppuq", "siguiente": "medir noches"})
        escribir(self.v, "roadmap/F1 Validar.md", {"tipo": "roadmap", "fase": "F1", "estado": "hecho", "responsable": "seppuq"})
        for i in range(7):
            escribir(self.v, "decisiones/2026-10-%02d-d%d.md" % (10 + i, i), {"tipo": "decision", "fecha": "2026-10-%02d" % (10 + i),
                                                                              "autor": "count", "estado": "vigente"})
        escribir(self.v, "decisiones/2026-10-30-vieja.md", {"tipo": "decision", "fecha": "2026-10-30", "estado": "sustituida"})
        escribir(self.v, "experimentos/2026-10-14-1815-a.md", {"tipo": "experimento", "fecha": "2026-10-14 18:15", "valor": "551"})
        escribir(self.v, "experimentos/2026-10-15-0319-b.md", {"tipo": "experimento", "fecha": "2026-10-15 03:19", "metrica": "troncos",
                                                               "valor": "61.8", "veredicto": "igual"})
        r = resumen.resumen(self.v)
        self.assertIn("F7 Supervivencia", r); self.assertIn("seppuq", r); self.assertIn("medir noches", r)
        self.assertNotIn("F1 Validar", r)                       # lo hecho no sale
        self.assertIn("2026-10-16-d6", r); self.assertIn("2026-10-12-d2", r)
        self.assertNotIn("2026-10-11-d1", r)                    # solo las 5 últimas
        self.assertNotIn("vieja", r)                            # las sustituidas no
        self.assertIn("2026-10-15-0319-b", r); self.assertIn("61.8", r)
        self.assertNotIn("2026-10-14-1815-a", r)
        self.assertLess(len(r.splitlines()), 20)

    def test_main_nunca_falla(self):
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            self.assertEqual(resumen.main([str(self.v / "no-existe")]), 0)
        self.assertEqual(salida.getvalue(), "")


MEDIDO = {"fecha": "2026-10-15 03:19", "N": 2, "semilla": 42, "segundos": 60.0,
          "equipo": [{"nombre": "Soma", "puerto": 3001}],
          "episodios": [{"politica": "red", "perfil": "recolector", "etiqueta": "p1", "troncos": 12},
                        {"politica": "guion", "perfil": "recolector", "etiqueta": "p1", "troncos": 10},
                        {"politica": "red", "perfil": "recolector", "etiqueta": "p2", "troncos": 14},
                        {"politica": "guion", "perfil": "recolector", "etiqueta": "p2", "troncos": 9}]}

COMPARACION = {"n": 300, "bases": [100000, 200000], "fecha": "2026-10-14 18:15",
               "politicas": {"actual": {"nota": 551.04, "fidelidad_guion": {"recolector": 98.7, "cooperativo": 98.6}},
                             "rapida_s1": {"nota": 553.45, "fidelidad_guion": {"recolector": 99.5, "cooperativo": 98.9},
                                           "frente_a_referencia": {"referencia": "actual", "total_perfiles_R": [2.08, 1.277]}}}}


class PruebasExperimento(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.v = Path(self.tmp.name)

    def test_nota_de_una_serie_medida(self):
        nombre, texto = experimento.nota(MEDIDO, "entrenamiento/ejecutor_medido.json", autor="seppuq")
        self.assertEqual(nombre, "2026-10-15-0319-ejecutor-red-guion.md")
        fm = notas.frontmatter(texto)
        self.assertEqual(fm["tipo"], "experimento")
        self.assertEqual(fm["entorno"], "minecraft")
        self.assertEqual(fm["politica"], ["red", "guion"])
        self.assertEqual(fm["valor"], "13.0")        # media de la primera variante
        self.assertEqual(fm["base"], "guion")
        self.assertEqual(fm["veredicto"], "pendiente")
        self.assertEqual(fm["autor"], "seppuq")
        self.assertIn("| red · recolector | 2 | 13.0 ± 1.4 |", texto)
        self.assertIn("| guion · recolector | 2 | 9.5 ± 0.7 |", texto)
        self.assertIn("entrenamiento/ejecutor_medido.json", texto)
        self.assertIn("## Conclusión", texto)

    def test_nota_de_una_comparacion_en_el_simulador(self):
        nombre, texto = experimento.nota(COMPARACION, "entrenamiento/comparacion_politicas.json", autor="seppuq")
        self.assertEqual(nombre, "2026-10-14-1815-comparacion-politicas.md")
        fm = notas.frontmatter(texto)
        self.assertEqual(fm["entorno"], "simulador")
        self.assertEqual(fm["N"], "300")
        self.assertEqual(fm["politica"], "rapida_s1")   # la de mejor nota
        self.assertEqual(fm["valor"], "553.45")
        self.assertEqual(fm["base"], "actual")
        self.assertIn("| rapida_s1 | 553.45 | 99.2 | +2.08 ± 1.28 |", texto)
        self.assertIn("| actual | 551.04 | 98.7 | (referencia) |", texto)

    def test_formato_desconocido_falla_claro(self):
        with self.assertRaises(ValueError):
            experimento.nota({"otra": 1}, "x.json", autor="a")

    def test_main_escribe_sin_pisar_y_dry_run(self):
        fuente = self.v / "medido.json"
        fuente.write_text(json.dumps(MEDIDO))
        salida = io.StringIO()
        with contextlib.redirect_stdout(salida):
            self.assertEqual(experimento.main([str(fuente), "--vault", str(self.v), "--dry-run", "--autor", "a"]), 0)
        self.assertIn("tipo: experimento", salida.getvalue())
        self.assertFalse((self.v / "experimentos").exists())
        with contextlib.redirect_stdout(io.StringIO()):
            self.assertEqual(experimento.main([str(fuente), "--vault", str(self.v), "--autor", "a"]), 0)
            destino = self.v / "experimentos" / "2026-10-15-0319-ejecutor-red-guion.md"
            self.assertTrue(destino.exists())
            destino.write_text(destino.read_text() + "\nconclusión escrita a mano")
            self.assertEqual(experimento.main([str(fuente), "--vault", str(self.v), "--autor", "a"]), 1)  # no pisa
        self.assertIn("escrita a mano", destino.read_text())

    def test_titulo_propio(self):
        nombre, _ = experimento.nota(MEDIDO, "x.json", autor="a", titulo="Serie 2 tras arreglar recoger")
        self.assertEqual(nombre, "2026-10-15-0319-serie-2-tras-arreglar-recoger.md")


if __name__ == "__main__":
    unittest.main()
