"""Genera catalogo/comandos_construccion.pdf: la chuleta de comandos para construir estructuras con los bots (2026-11-02).
Necesita reportlab (no es dependencia del proyecto: pip install --target <carpeta> reportlab y PYTHONPATH=<carpeta>).
Uso: python3 herramientas/comandos_construccion_pdf.py
El contenido detallado está en catalogo/LEEME.md: si cambian las órdenes, cambia las dos cosas.
"""
from pathlib import Path

from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

RAIZ = Path(__file__).resolve().parent.parent
SALIDA = RAIZ / "catalogo" / "comandos_construccion.pdf"
FUENTES = Path("/usr/share/fonts/truetype/dejavu")
pdfmetrics.registerFont(TTFont("DV", str(FUENTES / "DejaVuSans.ttf")))
pdfmetrics.registerFont(TTFont("DVB", str(FUENTES / "DejaVuSans-Bold.ttf")))
pdfmetrics.registerFont(TTFont("DVM", str(FUENTES / "DejaVuSansMono.ttf")))
pdfmetrics.registerFontFamily("DV", normal="DV", bold="DVB", italic="DV", boldItalic="DVB")  # para <b> en las celdas

AZUL = colors.HexColor("#1f4e79")
GRIS = colors.HexColor("#eef2f7")
titulo = ParagraphStyle("t", fontName="DVB", fontSize=16, leading=20, textColor=AZUL, spaceAfter=3)
sub = ParagraphStyle("s", fontName="DV", fontSize=8.5, textColor=colors.HexColor("#555555"), spaceAfter=6)
seccion = ParagraphStyle("h", fontName="DVB", fontSize=10.5, textColor=AZUL, spaceBefore=7, spaceAfter=3)
celda = ParagraphStyle("c", fontName="DV", fontSize=7.8, leading=9.6)
cmd = ParagraphStyle("m", fontName="DVM", fontSize=7.4, leading=9.4)
nota = ParagraphStyle("n", fontName="DV", fontSize=7.6, leading=9.6, textColor=colors.HexColor("#333333"))


def tabla(filas, anchos):
    datos = [[Paragraph(a, cmd), Paragraph(b, celda)] for a, b in filas]
    t = Table(datos, colWidths=anchos)
    t.setStyle(TableStyle([
        ("VALIGN", (0, 0), (-1, -1), "TOP"),
        ("ROWBACKGROUNDS", (0, 0), (-1, -1), [colors.white, GRIS]),
        ("LINEBELOW", (0, 0), (-1, -1), 0.25, colors.HexColor("#c8d2de")),
        ("LEFTPADDING", (0, 0), (-1, -1), 4), ("RIGHTPADDING", (0, 0), (-1, -1), 4),
        ("TOPPADDING", (0, 0), (-1, -1), 2.5), ("BOTTOMPADDING", (0, 0), (-1, -1), 2.5),
    ]))
    return t


ANCHO = A4[0] - 30 * mm
A = [ANCHO * 0.47, ANCHO * 0.53]

SECCIONES = [
    ("1. Preparar la plantilla (terminal, en la raíz del proyecto)", [
        ("cp casa.schem catalogo/", "Copia la plantilla a <b>catalogo/</b> (puedes usar subcarpetas). Vale <b>.litematic</b> (Litematica), <b>.schem</b> "
         "(WorldEdit) o <b>.nbt</b> (bloque de estructura). El catálogo es <b>local</b>: no va a git; pásale el archivo al otro y que lo importe."),
        ("make import-structure FILE=catalogo/casa.litematic NAME=casa ALIAS=\"casa de roble\"", "La importa al catálogo: id <b>casa</b> (minúsculas, números y _), con un alias para el chat."),
        ("make import-structure FILE=catalogo/torre.nbt NAME=torre FRONT=sur", "<b>FRONT</b>: lado de la entrada si no se deduce bien de la puerta (norte, sur, este, oeste). "
         "<b>FORCE=1</b> pisa una lista de materiales hecha a mano."),
        ("make structures", "La lista del catálogo: id, tamaño, bloques, materiales y lo que no se consigue. Mira los bloques: si trae terreno "
         "(más de cien mil), recórtalo antes en Litematica o WorldEdit."),
    ]),
    ("2. Zona de obras con carteles (en el juego)", [
        ("Cartel:  [obras]  /  norte", "Dos carteles en esquinas opuestas: primera línea <b>[obras]</b>, segunda el mismo nombre en los dos."),
        ("Oqva, lee los carteles", "Dice las zonas que ve a menos de 64 bloques (y los carteles sin pareja)."),
        ("Oqva, acepta los carteles", "Desde ahora solo construye dentro de ellas (dentro manda el cartel, aunque sea tu base vedada). "
         "Vale mientras sigan los dos carteles."),
        ("Oqva, olvida los carteles", "Borra todas las zonas de carteles."),
        ("!zona inicio · !zona fin NOMBRE [vedada|no_talar|trabajo|hogar] · !zona lista · !zona borrar NOMBRE · !zona modo NOMBRE MODO",
         "Las zonas de siempre (bases, zonas de trabajo, hogar). En el mundo compartido van a tu jugadores/&lt;tú&gt;.json: "
         "<b>make share WORLD=companero</b> las comparte."),
    ]),
    ("3. Materiales", [
        ("Oqva, lista de estructuras", "El catálogo, numerado: 1. casita_prueba (5×5×5, 99 bloques) · 2. …"),
        ("Oqva, recursos de la 2   ·   Oqva, qué necesito para casa", "Recursos primarios partiendo de cero (troncos de cualquier madera, adoquín, arena, carbón…) "
         "y las piezas ya hechas que también valen (tablones, losas, escaleras…)."),
        ("Oqva, qué falta para casa", "Lo que falta mirando su mochila y los cofres de tu base."),
        ("Oqva, solo de los cofres", "Solo usa lo que dejes en los cofres de tu base (saca, fabrica, funde y construye); lo que falte te lo pide. "
         "Fijo: <b>export IO_ABASTO = cofres</b> en local.mk."),
        ("Oqva, consigue tú los materiales", "Además tala, mina, funde y caza lo que falte."),
    ]),
    ("4. Construir", [
        ("Oqva, construye casa en 300 64 -20", "x y z = esquina noroeste (x y z más pequeños) y la y del primer piso (la de tus pies en el suelo, F3)."),
        ("Oqva, construye casa en 300 64 -20 mirando al este", "Gira la plantilla para que su entrada dé al este. También «con la entrada al norte», «con la puerta al sur»."),
        ("Oqva, construye casa en 300 64 -20 girada 90", "La gira 90, 180 o 270 grados a la derecha (visto desde arriba). La caja gira con ella."),
        ("Oqva, construye la casa de roble aquí", "La esquina queda a 2 bloques de tus pies, hacia el sureste. Se puede combinar con «mirando al …»."),
        ("Oqva, para   ·   Oqva, continúa", "Corta la obra / la retoma en el mismo sitio y con el mismo giro. Tras una pelea la retoma sola."),
        ("Oqva, deshaz casa", "Quita los bloques que puso él (y el andamio si quedó)."),
    ]),
    ("5. Lanzar los bots", [
        ("/connect bots   ·   /connect Oqva   ·   /disconnect Oqva", "Desde el juego. Tus bots arrancan en tu PC (tu lanzador) si el servidor tiene tu clave."),
        ("make launcher-start WORLD=companero", "Tu lanzador (para /connect). Clave: SOMA_LANZADOR_CLAVE en local.mk; la misma en el config.yml del plugin del servidor."),
        ("make partner-proxy-start", "El proxy local hacia el servidor 26.3 del compañero (si el bot dice ECONNREFUSED 127.0.0.1:25569)."),
        ("make bots WORLD=companero BOTS=Oqva MODE=ordenes BOT_DECIDER=guion   ·   make bots-stop WORLD=companero", "A mano, sin /connect (puerto 3001)."),
    ]),
    ("6. Si algo falla", [
        ("fuera de las zonas de obras de los carteles", "La caja (ya girada) se sale de la zona: muévela o agranda la zona."),
        ("ocupado: N bloques (x,y,z…)", "Hay bloques dentro de la caja: quítalos o elige otro sitio (no excava; hierba y flores sí las quita)."),
        ("necesito que me traigas …", "Déjalo en un cofre de tu base y di «continúa»."),
        ("no pude colocar en x,y,z: sin apoyo", "Ese bloque flota (no se apoya en nada ni en la plantilla ni en el mundo)."),
        ("Tu lanzador dice: clave mala", "La clave del config.yml del servidor no es la de tu local.mk."),
    ]),
    ("Webs para descargar estructuras (busca .litematic o .nbt)", [
        ('<link href="https://www.planetminecraft.com/" color="#1f4e79"><u>planetminecraft.com</u></link>', "La mayor comunidad: proyectos con descarga de esquemas, muchos en .litematic. Gratis."),
        ('<link href="https://www.minecraftmaps.com/schematics" color="#1f4e79"><u>minecraftmaps.com/schematics</u></link>', "Esquemas en .litematic, .schem y .nbt (y .mcstructure, que no sirve), con vista 3D y lista de materiales. Gratis."),
        ('<link href="https://www.donut.build/" color="#1f4e79"><u>donut.build</u></link>', "Construcciones en .litematic."),
        ('<link href="https://store.abfielder.com/" color="#1f4e79"><u>store.abfielder.com</u></link>', "Granjas y construcciones en .litematic (de pago)."),
        ("data/minecraft/structure/ del jar del servidor", "Las del propio juego en .nbt (casas de aldea, etc.): unzip -p server.jar data/minecraft/structure/village/plains/houses/plains_small_house_1.nbt &gt; catalogo/casa.nbt"),
    ]),
]


def construir():
    doc = SimpleDocTemplate(str(SALIDA), pagesize=A4, leftMargin=15 * mm, rightMargin=15 * mm, topMargin=12 * mm, bottomMargin=12 * mm,
                            title="Comandos de construcción", author="project-soma")
    historia = [Paragraph("Construir estructuras con los bots", titulo),
                Paragraph("Chuleta de comandos de project-soma. Las órdenes del juego empiezan por el nombre del bot (aquí, Oqva). "
                          "Guía completa: catalogo/LEEME.md.", sub)]
    for nombre, filas in SECCIONES:
        historia += [Paragraph(nombre, seccion), tabla(filas, A)]
    historia += [Spacer(1, 6), Paragraph("La madera de la plantilla da igual (vale cualquiera). Si la obra pasa de 4 de alto, deja también unos 10 de tierra "
                                         "para el andamio. La caja tiene que estar vacía.", nota)]
    doc.build(historia)
    print(f"escrito {SALIDA}")


if __name__ == "__main__":
    construir()
