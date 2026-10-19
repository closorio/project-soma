"""Entorno de F7.3 (supervivencia en un mundo normal): hermano de entorno_habilidades.py, que no se toca.

ESTADO: F7.1 fijó aquí la observación (OBS), las acciones (ACCIONES) y el vector de perfil (PESOS); F7.3 añade el simulador
(MundoSupervivencia), la calibración, el guion de supervivencia y la verificación (`python3 entorno_supervivencia.py 300`).
Valores del mundo «sin medir» salvo la luz (medida en F7.1: 1 de día, 4/15 de noche al aire libre, 0 en el refugio) y las
habilidades de F2; F7.2 mide las nuevas (habilidades_medidas_sv.json) y calibrar() las recoge. Ver PLAN_F7_supervivencia.md.

OBS es la fuente única de los nombres y del orden de la observación de supervivencia. bot/observacion.js (observarSv, orden
`obs_sv` de io.js) calcula en Minecraft las mismas entradas con estos nombres (su NOMBRES_SV es una copia) y
bot/probar_sentidos_seco.js comprueba que las dos listas coinciden. Si se cambia OBS: cambiar NOMBRES_SV y el cálculo en
observacion.js, y volver a pasar la prueba en seco. La política de F7.4 lleva su lista `obs`, que red.js comprobará contra esta.

Las 47 entradas, todas en [0, 1] (el simulador de F7.3 debe dar el mismo significado a cada una):
  arbol_dist, arbol_enfrente, tronco_al_alcance, objetos_suelo, troncos_inv, jugador_dist   como en entorno_habilidades.py
      (jugador_dist = 1 sin jugador humano a la vista: en el mundo aparte no lo hay; se conserva para el mundo del usuario)
  hostil_dist         distancia al hostil más cercano / RADIO_HOSTIL (24); 1 si no hay ninguno a menos de 24
  hostil_tipo_*       tipo de ese hostil, one-hot de TIPOS_HOSTIL (todo 0 sin hostil): zombi (zombie, husk, drowned,
                      zombie_villager), esqueleto (skeleton, stray, bogged, parched), aranya (spider, cave_spider), creeper, otro
  hostiles_n          hostiles a menos de RADIO_HOSTILES (16), hasta HOSTILES_MAX (4), / 4
  salud               vida / 20
  hambre              comida (barra de hambre) / 20
  comida_inv          piezas de comida en el inventario que no hacen daño (sin carne podrida, ojo de araña, patata
                      venenosa, pez globo ni fruta coral), hasta COMIDA_MAX (8), / 8
  noche               1 entre NOCHE (0,52-0,98 del día de Minecraft; 12480-23520 ticks), como entorno_habilidades.py
  hora_sen, hora_cos  (1 + sen 2πf) / 2 y (1 + cos 2πf) / 2, con f = ticks del día / 24000 (f = 0 al amanecer;
                      mediodía f = 0,25 → hora_sen 1; medianoche f = 0,75 → hora_sen 0)
  luz                 brillo en la casilla de los pies / 15, como el que usa el juego para dejar aparecer monstruos:
                      máx(luz de bloque, luz del cielo − oscurecimiento por la hora y la lluvia). De día al aire libre 1;
                      de noche al aire libre 4/15 ≈ 0,27; en un refugio cerrado sin antorcha 0; junto a una antorcha ≈ 0,9
  arma                mejor arma del inventario: 0 ninguna; 0,5 espada o hacha de madera u oro; 1 de piedra o mejor
  armadura            puntos de la armadura puesta / ARMADURA_MAX (20)
  tierra_inv          bloques para tapiarse (tierra, piedra, roca, tablones…), hasta TIERRA_MAX (4), / 4
  cama_inv            1 si lleva una cama
  refugio_dist        distancia al refugio conocido / VISTA (48); 1 si no conoce ninguno. Refugio: el último sitio donde se
                      refugió (memoria `refugio`, F7.2) o, si no, el campamento
  en_refugio          1 si está encerrado en una celda de 1×2: los 4 lados de los pies y de la cabeza, el bloque de encima
                      y el de debajo son sólidos
  caida               1 si a ≤ RADIO_PELIGRO (3) bloques hay un borde con caída de más de CAIDA_MAX (3) bloques (o está encima)
  lava_cerca          1 si hay lava a ≤ 3 bloques
  agua_profunda       1 si a ≤ 3 bloques hay agua de 2 o más bloques de hondo
  tiempo_restante     como en entorno_habilidades.py; el episodio de supervivencia dura un día entero (DURACION, 1200 s)
  previa_*, previa_exito   habilidad anterior (one-hot de ACCIONES; todo 0 si fue otra o ninguna) y si salió bien
  perfil_*            pesos del perfil (perfiles/*.json) / su divisor (perfiles/_escala.json), como vector_perfil(); el peso
                      `supervivencia` (F7.3: supervivencia 3, recolector 0,5, explorador 0,2, los demás 0,5; divisor 5)

Acciones (11): ACCIONES. equipar, apartarse y salir_del_refugio son reflejos o pasos internos del bot, no acciones de la red;
ir_a_jugador e ir_a_otro_arbol quedan fuera (en el mundo aparte no hay jugador ni equipo).

Simulador (F7.3): MundoSupervivencia, un personaje durante un día de Minecraft (1200 s) que empieza a cualquier hora (uniforme,
desde F7.6; hasta F7.4 y DAgger, a las 6:00 o a las 18:00, mitad y mitad: hora="6o18"), así que cada episodio tiene una noche
(entera o partida en dos). Si empieza a oscuras, ya hay hasta 3 hostiles fuera (a 12-28 bloques, sin haberle visto aún), tantos
como habrían aparecido en lo que lleva de noche (hasta PREVIOS max_s), y esa noche cuenta. Semi-MDP como MundoHabilidades, del que hereda la mecánica de
árboles y objetos (picar_tronco y recoger tal cual; ir_a_arbol con sus probabilidades y tiempos, pero andando: con el salto de F2
aparecía pegado a un creeper). Mientras dura una habilidad el mundo avanza en pasos de SUB (0,5 s) si hay hostiles y de LARGO
(5 s) si no; ir_a_arbol, picar_tronco, recoger, fabricar, recoger_comida y explorar se interrumpen con un hostil a ≤ 6 (como
F2) o con un golpe de un hostil (el evento `golpe` de F7.1; sin eso los esqueletos le mataban a flechazos desde 10-15 bloques).
- Hora y luz: la luz es la del juego (oscurecimiento(), la misma fórmula que bot/observacion.js): 1 de día, 4/15 de noche al
  aire libre y 0 dentro del refugio, los valores medidos en F7.1 (sin antorchas: ninguna habilidad las pone).
- Hambre: baja 1 cada 80 s trabajando, 40 s luchando o huyendo y 240 s quieto (comer, dormir, esperar). Con 18 o más cura 1 de
  vida cada 4 s (y gasta 0,5 de hambre por punto curado); a 0 quita 1 cada 4 s hasta dejar 1 (dificultad normal).
- Hostiles (HOSTIL): aparecen con oscuridad (ritmo APARICION, nada con luz ≥ 8, todo con luz ≤ 4), hasta 3 a ≤ 24 bloques,
  a 10-24; zombi, esqueleto, araña y creeper casi a partes iguales y «otro» (bruja, enderman) raro. Ven al personaje si no
  está encerrado y le siguen hasta su rango (zombi 35, los demás 16). Zombi 3 de daño cada 1 s a ≤ 2; esqueleto 2-4 cada 2 s
  a ≤ 15, con acierto según la distancia (0,9 a 6, 0,7 a 10, 0,45 a 15), y se queda a ~10; araña 2 cada 1 s (neutral con
  luz ≥ 12 si no se la provoca); creeper: a ≤ 3 durante 1,5 s explota (daño del juego por distancia: ~33 a 1 bloque, ~17 a
  3). La armadura quita un 4 % por punto. Con luz del cielo ≥ 13 zombis y esqueletos arden (1 de vida/s). Los que no le
  persiguen y están a más de 32 desaparecen (~40 s de media, como en el juego); más allá de 40 se pierden.
- Refugio (refugiarse, el modo automático del cuerpo de F7.2 desde F7.4): se tapia donde está si faltan ≤ 4 bloques alrededor
  (2-10 según el terreno; 10 en llano) y los lleva; si no, vuelve al refugio tapiado conocido si está entero y a ≤ 16; si no,
  cava 3 hacia abajo y se tapa (nunca junto a lava o agua honda; sin pico falla más); si no, se tapia con los que hagan falta.
  Dentro no le ven los que aparecen ni hay daño. De los que le seguían a ≤ 8 (menos los esqueletos), la mitad se quedan
  «de asedio» junto a la pared (se cansan en ~2 min): zombis y arañas le atacan en cuanto sale; un creeper, pegado a la
  pared, explota con la mitad de daño y rompe el refugio. Salir cuesta 2,5 s (medido en F7.2) y lo hace solo el cuerpo
  cuando la habilidad elegida necesita moverse. dormir: con cama y fuera, salta al amanecer (si no hay hostiles a ≤ 8);
  dentro, espera al día hasta las 6:29 (ESPERA_HASTA: así los zombis y esqueletos de fuera ya han ardido); desde F7.6 espera
  también si ya está dentro al atardecer (desde ATARDECER, 11040 ticks), en vez de decir «es de día» hasta las 12480.
- Inventario: troncos (inv), tablones, palos, tierra, piedra, comida (valor de cada pieza), arma (puño 1, espada de madera 4,
  de piedra 5 de daño; atacar sin arma se niega), pico, mesa, cama, armadura. Animales (vaca, cerdo, oveja, pollo) quietos,
  que da recoger_comida (de día y con hambre ≤ 12). explorar anda 40 bloques y ve árboles y a veces animales nuevos.
- Peligros del terreno (caída, lava, agua honda): al llegar a un sitio nuevo, con probabilidad PELIGRO; el reflejo apartarse
  los quita; si se quedan, el siguiente desplazamiento puede hacer daño.
- Reflejos del cuerpo (reflejos=True, los de bot/reflejos.js de F7.2, en su orden), tras cada habilidad: con un
  creeper a ≤ 6, huir (creeper = apartarse siempre); si le ha golpeado un monstruo, la regla del usuario (2026-10-15): huir si
  hay más de 2 hostiles a la vista, la vida es < 8 o no lleva arma (y de noche, refugiarse), si no defenderse (atacar); huir (y
  de noche refugiarse) si vida < 8 con un hostil a ≤ 8; si huir falla y un hostil sigue a ≤ 4, defenderse («acorralado»);
  después, apartarse si hay peligro del terreno y comer si hambre ≤ 6 y hay comida. `equipar` no hace falta en el simulador (se lucha siempre con la mejor arma).
  Como el cuerpo (F7.2): atacar se niega y se rinde con vida < 8 (antes, < 6) y con más de 2 hostiles (salvo acorralado), y
  refugiarse no empieza con un hostil a ≤ 4 («monstruos cerca»: los zombis pegados caían al pozo con él).
- Recompensa (pesos del perfil): madera·troncos − tiempo·s − seguridad·(0,05·vida perdida + 5·muerte)
  + supervivencia·(0,02·hambre recuperada comiendo + 1 por noche pasada sin daño). No hay peso «comida» en PESOS (fijado en
  F7.1): el término de la comida va con el peso supervivencia. El episodio acaba al morir (no hay reaparición).
- La orden `fabricar` de la red no lleva objeto: siguiente_fabricacion() elige el siguiente paso de la cadena (espada de madera,
  tablones si faltan bloques para tapiarse, espada de piedra, pico de madera). El ejecutor de F7.4-F7.6 debe elegir igual.
Guion de supervivencia (guion_sv_lote), por perfil, en este orden de prioridad: creeper a ≤ 6 → huir; tras huir (F7.6b), de
noche o con hostiles a ≤ 16 y ninguno a tiro → refugiarse; hostil a ≤ 8 (≤ 16 con seguridad alta; un esqueleto, a ≤ 15) →
atacar (arma ≥ madera, vida ≥ 8, hasta 2 hostiles: la regla del usuario, F7.6b; antes vida ≥ 10 y 1, con seguridad alta nunca;
a una araña de día, nunca) o huir; comer con hambre ≤ 7 (o < 18 con vida ≤ 12: con 18 se cura); de
noche fuera (luz < 0,3; seguridad alta ya al atardecer; seguridad baja solo si ve un hostil o va mal de vida) → dormir con cama
o refugiarse; dentro, al atardecer, de noche y de madrugada → dormir (esperar al día; el atardecer, desde F7.6); por la tarde sin 2 bloques y con troncos → fabricar
(tablones); de día sin arma y con 2 troncos → fabricar; de día con hambre ≤ 12 y sin comida → recoger_comida; si no, el guion
de madera de F2 (sin árbol a la vista, explorar). El de madera (guion_madera_lote) es solo el de F2 con huir y comer: sirve para
ver si a un perfil le compensa no refugiarse.
Verificación (2026-10-15, 300 mundos, sin calibrar con F7.2): guion sin morir 95,3 % el recolector y 97,3 % supervivencia,
madera 356 % de la del guion pacífico (que se queda sin árboles); el guion de madera sin refugio muere un 56 %; el azar
sobrevive un 55,7 % (con y sin reflejos) y no cumple el < 50 % del plan: casi la mitad de la noche la pasa esperando dentro de
algún refugio (refugiarse y dormir, 2 de 11 acciones, le bastan). Ver mente/diario.md.
Recalibrado en F7.2 (2026-10-15 19:00, habilidades_medidas_sv.json: comer, fabricar, refugiarse, dormir y recoger_comida medidos
en el mundo de supervivencia) y con los reflejos del cuerpo (la regla del usuario ante un golpe, huir del creeper, atacar con
vida ≥ 8, no refugiarse con un hostil a ≤ 4; el terreno después de los monstruos): guion sin morir 96,7 % el recolector y 98,0 %
supervivencia, madera 361 %; el azar sobrevive un 73,0 % con reflejos (ahora le defienden) y un 54,0 % sin ellos (antes, 55,7 %
con y sin). Solo con lo medido, sin cambiar los reflejos, salía lo mismo que en F7.3 (95,3 %, 97,3 %, azar 55,7 %).
Ajustado a mano en F7.4 (2026-10-15 19:20) con lo que calibrar() no recoge de F7.2 (ver CAL_SV): cavar 4,5 s y p 0,975, tapiarse
2-10 bloques y en automático solo si faltan ≤ 4 (el orden del cuerpo), salir 2,5 s, 1,75 s por bocado y animales a ≤ 24:
guion sin morir 97,3 % el recolector y 98,7 % supervivencia, madera 363 %; el azar 82,0 % con reflejos y 50,7 % sin ellos
(criterio del usuario: < 60 % y solo sin reflejos, pasa). La red de F7.4: entrenar_supervivencia_rapido.py.
F7.6 (2026-10-15 21:40, trabajador io-mundo-simulado-213020): salida a cualquier hora (la red de F7.5 se apartaba del guion al
empezar a medianoche, un estado que no veía) y dormir espera al día dentro del refugio desde el atardecer (el vaivén de F7.5:
«es de día» antes de las 12480, salía y cavaba otro pozo); el guion se queda dentro al atardecer. Verificación (300 mundos):
guion sin morir 92,7 % el recolector (90,0 % sin reflejos) y 99,3 % supervivencia, madera 339 %; azar sin reflejos 43,7 % (< 60):
pasa todo; empezar a oscuras con hostiles ya fuera es más duro (antes 97,3 % el recolector). Con el perfil supervivencia, del
atardecer a la mañana, el guion cavaba ~10,5 pozos y ahora 1. La red: entrenar_supervivencia_dagger.py (NOMBRE=dagger2). Ver
mente/diario.md.
F7.6b (2026-10-16, trabajador io-mundo-simulado-180821; decisión del usuario: tras una huida, refugiarse y recuperar vida):
- Guion: la regla del usuario para todos los perfiles (huir solo con más de 2 enemigos, vida < 8 o sin arma; si no, defenderse:
  un solo zombi se defiende, también con seguridad alta, que antes huía siempre); tras una huida decidida, de noche o con
  hostiles a ≤ 16 (no un creeper), refugiarse en cuanto ninguno siga a tiro; dentro, quedarse (dormir = esperar) mientras no
  sea seguro salir (vida < 16 pudiendo curarse o un hostil a ≤ 8); junto al agua honda, si refugiarse acaba de fallar, irse
  (al árbol a la vista o explorando) en vez de insistir (en F7.6 el bot se ahogaba repitiéndolo).
- Mundo: el agua (AGUA, APARTARSE, AHOGO: medidos en F7.6; quieto en el agua tras huir se ahoga, en la orilla no), refugiarse
  junto al agua con el cuerpo nuevo (p_agua, s_seco: busca un sitio seco a ≤ 10), dormir/esperar dentro hasta que sea seguro
  (SALUD_SALIR, RADIO_SALIR, ESPERA_MAX; come hasta 18 para curarse) y la pelea calibrada con F7.2 (p_contra: el monstruo con
  el que pelea casi no acierta; antes el simulador perdía 13 de vida por zombi, medido 0,2).
- Verificación (300 mundos): guion sin morir 95,7 % el recolector y 98,3 % supervivencia (antes 92,7 y 99,3), madera 335 %;
  azar sin reflejos 42,3 % (< 60): pasa todo. La red: entrenar_supervivencia_dagger.py con NOMBRE=dagger3.
Uso: entorno_supervivencia.py [N=300] [--sin-reflejos]   verificación del plan (azar, madera y guion por perfil, N mundos
     emparejados) · --comprobar  pruebas de la mecánica · --obs  la observación en JSON (para bot/probar_sentidos_seco.js).
"""
import json
import math
import sys
from collections import Counter
from pathlib import Path

import numpy as np

from entorno_habilidades import (DIA, DIR_PERFILES, META, NOCHE, PERFIL_BASE as PERFIL_BASE_F3, PREVIO, RADIO_OBJ, VEL, VISTA,
                                 MundoHabilidades, calibrar as calibrar_f2)

ACCIONES = ["ir_a_arbol", "picar_tronco", "recoger", "huir", "comer", "atacar", "refugiarse", "dormir", "fabricar",
            "recoger_comida", "explorar"]
TIPOS_HOSTIL = ["zombi", "esqueleto", "aranya", "creeper", "otro"]
PESOS = ["madera", "compania", "seguridad", "tiempo", "supervivencia"]
OBS = (["arbol_dist", "arbol_enfrente", "tronco_al_alcance", "objetos_suelo", "troncos_inv", "jugador_dist"]
       + ["hostil_dist"] + ["hostil_tipo_" + t for t in TIPOS_HOSTIL] + ["hostiles_n"]
       + ["salud", "hambre", "comida_inv"]
       + ["noche", "hora_sen", "hora_cos", "luz"]
       + ["arma", "armadura", "tierra_inv", "cama_inv"]
       + ["refugio_dist", "en_refugio"]
       + ["caida", "lava_cerca", "agua_profunda"]
       + ["tiempo_restante"] + ["previa_" + a for a in ACCIONES] + ["previa_exito"]
       + ["perfil_" + k for k in PESOS])
I = {n: k for k, n in enumerate(OBS)}  # índice de cada entrada por su nombre (el guion no depende del orden)
A = {a: k for k, a in enumerate(ACCIONES)}

# Escalas de la observación (las mismas en bot/observacion.js). VISTA, RADIO_OBJ, META y NOCHE, las de entorno_habilidades.py.
RADIO_HOSTIL, RADIO_HOSTILES, HOSTILES_MAX = 24.0, 16.0, 4
COMIDA_MAX, TIERRA_MAX, ARMADURA_MAX = 8, 4, 20
RADIO_PELIGRO, CAIDA_MAX = 3, 3
DURACION = 1200.0  # un día entero de Minecraft, empezando a cualquier hora (F7.6; hasta F7.4/DAgger, a las 6:00 o a las 18:00)

PERFIL_BASE = {**PERFIL_BASE_F3, "supervivencia": 0.5}
ESCALA_POR_DEFECTO = {"supervivencia": 5.0}

# ---- el mundo (F7.3; todo sin medir salvo la luz) ----
SUB, LARGO = 0.5, 5.0  # paso del mundo (s) con hostiles en la lista y sin ellos
INTERRUPCION = 6.0  # un hostil a ≤ 6 interrumpe ir_a_arbol, picar_tronco, recoger, fabricar, recoger_comida y explorar (como F2);
# también un golpe de un hostil (el evento `golpe` de F7.1): sin eso los esqueletos le mataban a flechazos desde 10-15 bloques
DETECCION = 16.0  # a esta distancia (al zombi, a su rango) un hostil ve al personaje (si no está encerrado) y le persigue
HOSTIL = {  # vida, velocidad (bloques/s), distancia a la que se para, rango de seguimiento, daño, cada (s), alcance, peso al aparecer
    "zombi": {"vida": 20, "vel": 2.5, "para": 1.0, "rango": 35, "dano": 3, "cada": 1.0, "alcance": 2.0, "peso": 0.24, "arde": True},
    "esqueleto": {"vida": 20, "vel": 2.5, "para": 10.0, "rango": 16, "dano": (2, 4), "cada": 2.0, "alcance": 15.0, "peso": 0.24,
                  "arde": True},
    "aranya": {"vida": 16, "vel": 3.5, "para": 1.0, "rango": 16, "dano": 2, "cada": 1.0, "alcance": 2.0, "peso": 0.24,
               "neutral_dia": True},
    "creeper": {"vida": 20, "vel": 2.5, "para": 1.0, "rango": 16, "mecha": 1.5, "alcance": 3.0, "peso": 0.24},
    "otro": {"vida": 20, "vel": 2.0, "para": 1.0, "rango": 16, "dano": 2, "cada": 1.0, "alcance": 2.0, "peso": 0.04},
}
PESOS_APARICION = np.array([HOSTIL[t]["peso"] for t in TIPOS_HOSTIL]) / sum(HOSTIL[t]["peso"] for t in TIPOS_HOSTIL)
APARICION = {"ritmo": 1 / 40, "max": 3, "dist": (10.0, 24.0)}  # por s con oscuridad total (luz ≤ 4); nada con luz ≥ 8
LUZ_ARDE, ARDE, LUZ_NEUTRAL = 13, 1.0, 12
ESPERA_HASTA = 0.02  # esperar al día dentro del refugio: hasta las 6:29 (los zombis y esqueletos de fuera ya han ardido)
ATARDECER = 0.46  # 11040 ticks: desde aquí, dentro del refugio, dormir ya espera al día (F7.6: antes decía «es de día» hasta las
# 12480 y el personaje salía y volvía a cavar 2-3 pozos); es también el «atardecer» del guion (seguridad alta se refugia ya)
PREVIOS = {"max_s": 120.0, "dist": (12.0, 28.0)}  # al empezar a oscuras: hostiles ya fuera, como si llevara PREVIOS max_s de noche
DESAPARECE_S = 40.0  # media de lo que tarda en desaparecer un hostil que no le persigue a más de 32 bloques
ASEDIO, ASEDIO_S, REFUGIO_EXPLOSION = 0.5, 120.0, 0.5  # se queda junto al refugio; s que aguanta; daño de explosión que entra
ARMA = {0.0: 1.0, 0.5: 4.0, 1.0: 5.0}  # daño por golpe: puño, espada de madera, de piedra
ATACA_CON_PUNO = False  # atacar sin arma se niega («sin arma»)
SALUD_ATACAR, MAS_DE, RADIO_LIBRE, ACORRALADO, RADIO_CREEPER = 8.0, 2, 4.0, 4.0, 6.0  # F7.2: las reglas del cuerpo (bot/reflejos.js)
ANIMALES = {"vaca": (10, 3, 1, 3), "cerdo": (10, 3, 1, 3), "oveja": (8, 2, 1, 2), "pollo": (4, 2, 1, 1)}  # vida, hambre/pieza, piezas
COMIDA_INICIAL = (5, 4, 3)  # pan, manzana, carne cruda
MANZANA = 0.1  # al agotar un árbol, cae una manzana y la recoge
HAMBRE = {"reposo": 240.0, "trabajo": 80.0, "lucha": 40.0}  # s por punto de hambre
COSTE_CURA = 0.5  # hambre por punto de vida curado
PELIGRO = {"caida": 0.04, "lava_cerca": 0.01, "agua_profunda": 0.03}  # probabilidad al llegar a un sitio nuevo
DANO_PELIGRO = {"caida": (0.15, 4.0), "lava_cerca": (0.15, 6.0)}  # si no se apartó: probabilidad y daño al moverse otra vez
# F7.6b · el agua, medida en Minecraft (F7.6: decisiones de entrenamiento/ejecuciones/modos-supervivencia-2026101{5,6}.jsonl y
# registros de los bots en servidor-supervivencia/logs/): tras huir acabó junto al agua honda 9 veces de 71 y tras ir_a_arbol 6 de
# 68 (explorar 0 de 64: queda PELIGRO); el reflejo apartarse salió del agua honda 178 veces de 283 (caída y lava, como antes).
# Quieto en el agua (refugiarse fallando con «suelo peligroso» una y otra vez, casi siempre tras huir: 3 ahogados) perdió 22 de
# vida en 125 s sin hostiles a ≤ 16; andando junto al agua (ir_a_arbol «bloqueado», 86 s), nada: tras ir_a_arbol queda en la
# orilla (peligro 1) y tras huir, en el agua (peligro 2: se ahoga mientras no se mueve, _pasar).
AGUA = {"huir": 0.13, "ir_a_arbol": 0.09}  # probabilidad de quedar junto al agua honda al acabar (antes, PELIGRO: 0,03)
APARTARSE = {"caida": 0.95, "lava_cerca": 0.95, "agua_profunda": 0.63}  # éxito del reflejo apartarse (antes 0,95 para todo)
APARTARSE_CADA = 20.0  # s: no se aparta otra vez hasta pasado esto (APARTADO_MS de bot/reflejos.js)
AHOGO = 0.18  # vida por s quieto en el agua (peligro 2) fuera del refugio (22 / 125 s): «ahogo» no es un golpe de monstruo
SALUD_SALIR, RADIO_SALIR, ESPERA_MAX = 16.0, 8.0, 120.0  # F7.6b (decisión del usuario): dentro del refugio, esperar a que sea
# seguro salir: vida ≥ 16 (o no puede curarse: hambre < 18 y sin comida) y ningún hostil a ≤ 8 (los que esperan junto a la pared;
# con 16, una araña o un creeper que pasea cerca por la mañana le dejaban dentro); de día, como mucho ESPERA_MAX s
COMIDA_R, NOCHE_R = 0.02, 1.0  # recompensa (× peso supervivencia) por punto de hambre recuperado y por noche sin daño
SALEN = {"ir_a_arbol", "recoger", "huir", "atacar", "recoger_comida", "explorar"}  # habilidades que sacan del refugio

# Calibración de las habilidades nuevas, sin medir hasta F7.2. p y s (si los hay) los sustituye lo medido.
CAL_SV = {
    "comer": {"p": 0.98, "s_bocado": 1.75},  # F7.4, a mano: 5,2 s por 3 bocados con equipar (F7.2; antes 1,8 sin medir)
    "atacar": {"p_golpe": 0.8, "cada": 0.6, "max_s": 20.0, "p_contra": {"zombi": 0.03, "esqueleto": 0.15}},
    # golpe cada 0,6 s a ≤ 3 bloques; se rinde a los 20 s (F7.2: zombi con espada de madera en 6 golpes y 3,7 s, esqueleto en 5
    # y 3,6; el simulador da ~6,25 golpes y 3,75 s: se deja). p_contra (F7.6b): probabilidad de que el monstruo con el que pelea
    # acierte cuando le toca (el retroceso de cada golpe le aparta): en F7.2 el bot acabó 10 de 10 peleas con un zombi perdiendo 2
    # de vida en total (1 golpe en ~35 ocasiones) y con un esqueleto 8 (~3 flechas en ~20); sin esto el simulador perdía 13 de
    # vida por zombi y solo le mataba 1 de cada 4 veces (se rendía con vida < 8). Los demás, sin cambio (sin medir).
    "refugiarse": {"p": 0.9, "s": 4.0, "bloques": (2, 10), "max_tapiar": 4, "p_cavar": 0.975, "p_cavar_sin_pico": 0.6,
                   "s_cavar": 4.5, "s_entrar": 2.0, "s_salir": 2.5, "p_agua": 0.9, "s_agua": 1.0, "s_seco": 4.3},
    # p y s: tapiarse (gasta los bloques que falten: 2-10 según el terreno, 10 en llano). calibrar() pone en s la mediana de
    # refugiarse, que mezcla cavar y tapiar (4,5 s). F7.4, a mano con lo medido en F7.2 (antes, sin medir): en llano faltan 10
    # (antes 2-6) y en automático el cuerpo solo se tapia si faltan ≤ max_tapiar; cavar 4,5 s y 20/20 (p con PREVIO 4 pruebas del
    # 0,85 de antes: (20 + 4·0,85)/24; antes 6 s y 0,85); salir 2,5 s (antes 2). Sin pico, sin medir (la arena era de tierra).
    # F7.6b: junto al agua honda (sin lava), con p_agua encuentra un sitio seco cerca y va (s_seco) antes de cavar; si no, falla
    # «suelo peligroso» en s_agua. Con el cuerpo de F7.6 (solo buscaba a ≤ 4) salía 2 de 93; con el de F7.6b (busca seco a ≤ 10,
    # nadando) 7 de 7 en el río (superficie y fondo; 10 de 10 contando la orilla), mediana 8,8 s con cavar (4,5): p 0,9 por la
    # muestra corta (servidor-supervivencia/logs/bot-Prueba1-agua-*.log).
    "dormir": {"p": 0.95, "s": 5.0},  # poner la cama y dormirse; esperar al día no tiene fallos propios
    "fabricar": {"p": 0.95, "s": 3.0, "s_mesa": 3.0},
    "recoger_comida": {"p": 0.75, "s": 3.0, "radio": 24.0},  # s: perseguir y rematar, además de andar y golpear;
    # radio: el del cuerpo (recoger_comida.js, 24; antes el simulador usaba VISTA, 48)
    "explorar": {"p": 0.85, "bloques": 40.0, "s_fallo": 20.0},
    "huir_sv": {"vel": 5.0, "max_s": 20.0, "pierde": 0.5, "pierde_zombi": 0.3},  # p de huir: la de F2 (medida)
}
TRIVIALES_SV = {"comer": ("sin comida", "sin hambre"), "atacar": ("sin hostil",), "refugiarse": ("ya dentro",),
                "dormir": ("es de día",), "fabricar": ("faltan materiales",),
                "recoger_comida": ("sin hambre", "de noche", "nada que comer")}
MEDIDAS_SV = Path(__file__).with_name("habilidades_medidas_sv.json")
RECETAS = {"espada_madera": (2, 1, 0), "pico_madera": (3, 2, 0), "espada_piedra": (0, 1, 2)}  # tablones, palos, piedra


def cargar_perfiles():
    """{nombre: pesos} de perfiles/*.json (sin los que empiezan por «_»), con los pesos que falten de PERFIL_BASE."""
    return {f.stem: {**PERFIL_BASE, **json.loads(f.read_text())["pesos"]}
            for f in sorted(DIR_PERFILES.glob("*.json")) if not f.stem.startswith("_")}


def escala():
    """Divisores del vector de perfil: perfiles/_escala.json y, para los pesos que aún no tiene, ESCALA_POR_DEFECTO."""
    e = json.loads((DIR_PERFILES / "_escala.json").read_text())
    return {k: float(e.get(k, ESCALA_POR_DEFECTO.get(k, 1.0))) for k in PESOS}


def vector_perfil(pesos, esc=None):
    """Las 5 entradas perfil_* de la observación: cada peso dividido por su escala, en [0, 1]."""
    esc = esc or escala()
    return [min(1.0, max(0.0, pesos.get(k, PERFIL_BASE[k]) / esc[k])) for k in PESOS]


def calibrar(ruta=MEDIDAS_SV, ruta_f2=Path(__file__).with_name("habilidades_medidas.json")):
    """La de F2 (entorno_habilidades.calibrar) para ir_a_arbol, picar_tronco, recoger y huir, y CAL_SV para las nuevas. Con
    `ruta` (habilidades_medidas_sv.json de F7.2, mismo formato que habilidades_medidas.json) p y s se sustituyen por lo medido,
    como en F2: p con PREVIO pruebas del valor por defecto, s la mediana de los éxitos (sin las causas triviales).
    cal["medidas"]: las habilidades nuevas calibradas con lo medido (vacía hasta F7.2: todo sin medir)."""
    cal = {**calibrar_f2(Path(ruta_f2)), **{h: dict(v) for h, v in CAL_SV.items()}, "medidas": []}
    try:
        medidas = json.loads(Path(ruta).read_text())["habilidades"]
    except (OSError, ValueError, KeyError):
        return cal
    for h, m in medidas.items():
        if h not in CAL_SV or "p" not in CAL_SV[h]:
            continue
        ms = [x for x in m.get("muestras", []) if not x[1].startswith(TRIVIALES_SV.get(h, ()))]
        if len(ms) < 3:
            continue
        cal[h]["p"] = (sum(x[0] for x in ms) + PREVIO * CAL_SV[h]["p"]) / (len(ms) + PREVIO)
        ok = [x[2] for x in ms if x[0]]
        if "s" in CAL_SV[h] and ok:
            cal[h]["s"] = float(np.median(ok))
        cal["medidas"].append(h)
    return cal


def oscurecimiento(f):
    """Lo que la hora le quita a la luz del cielo (0 de día, 11 a medianoche), con f = ticks del día / 24000: la fórmula de
    bot/observacion.js (Level.updateSkyBrightness del juego), sin lluvia."""
    d = (f - 0.25) % 1
    angulo = (2 * d + (0.5 - math.cos(d * math.pi) / 2)) / 3
    k = 0.5 + 2 * min(0.25, max(-0.25, math.cos(angulo * 2 * math.pi)))
    return math.floor((1 - k) * 11)


def _troncos_para(receta, tablones, palos, mesa):
    """Troncos que hay que pasar a tablones para la receta, con la mesa si falta y 2 tablones para palos si faltan."""
    t, p, _ = RECETAS[receta]
    t += (0 if mesa else 4) + (2 if palos < p else 0)
    return max(0, math.ceil((t - tablones) / 4))


def siguiente_fabricacion(arma, pico, mesa, tablones, palos, troncos, piedra, colocables):
    """Lo que hace `fabricar` sin objeto: espada de madera si no hay arma; tablones si faltan bloques para tapiarse (< 2);
    espada de piedra con 2 de piedra; pico de madera si no lo hay. None si no se puede nada."""
    def se_puede(r):
        return piedra >= RECETAS[r][2] and _troncos_para(r, tablones, palos, mesa) <= troncos
    if arma == 0 and se_puede("espada_madera"):
        return "espada_madera"
    if colocables < 2 and troncos >= 1:
        return "tablones"
    if arma < 1 and se_puede("espada_piedra"):
        return "espada_piedra"
    if not pico and se_puede("pico_madera"):
        return "pico_madera"
    return None


class MundoSupervivencia(MundoHabilidades):
    """Un personaje en un mundo normal durante un día de Minecraft. step(a) aplica ACCIONES[a] y después los reflejos del
    cuerpo, y devuelve (observación, recompensa, terminado, info), como MundoHabilidades con un solo agente.
    hora: None (cualquier hora, uniforme: F7.6), "6o18" (6:00 o 18:00 al azar, como hasta F7.4 y DAgger) o la fracción del
    día (0.0 las 6:00, 0.5 las 18:00, 0.75 medianoche)."""

    def __init__(self, semilla=None, perfil=None, duracion=DURACION, cal=None, reflejos=True, hora=None):
        self.rng = np.random.default_rng(semilla)
        self.n, self.turno, self.T, self.pacifico = 1, 0, duracion, False
        self.cal = cal or calibrar()
        self.reflejos, self.hora = reflejos, hora
        self.poner_perfil(perfil)
        self._habilidades = [self._sv_ir_a_arbol, self._sv_picar, self._sv_recoger, self._huir, self._comer, self._atacar,
                             self._refugiarse, self._dormir, self._fabricar, self._recoger_comida, self._explorar]

    def poner_perfil(self, perfil=None):
        """perfil: nombre de perfiles/*.json o dict de pesos (lo que falte, de PERFIL_BASE). Vale para el siguiente reset()."""
        self.perfil = {**PERFIL_BASE, **(cargar_perfiles()[perfil] if isinstance(perfil, str) else (perfil or {}))}
        self.perfiles, self.vperfil = [self.perfil], vector_perfil(self.perfil)

    # ---- estado ----
    def _arboles(self, centro, n, d0, d1):
        r = self.rng
        ang, dist = r.uniform(0, 2 * np.pi, n), r.uniform(d0, d1, n)
        return [{"pos": centro + np.array([d * np.cos(a), d * np.sin(a)]), "k": int(r.integers(3, 6)),
                 "restos": bool(r.random() < 0.3), "agotado": False, "alcanzable": bool(r.random() > 0.15)}
                for a, d in zip(ang, dist)]

    def _animales(self, centro, n, d0, d1):
        r = self.rng
        return [{"pos": centro + r.uniform(d0, d1) * np.array([np.cos(a), np.sin(a)]), "tipo": str(r.choice(list(ANIMALES)))}
                for a in r.uniform(0, 2 * np.pi, n)]

    def reset(self):
        r = self.rng
        self.t, self.decisiones, self.t_mundo, self.hecho, self.conflictos, self.estorbos = 0.0, 0, 0.0, False, 0, 0
        if self.hora is None:
            f0 = float(r.random())
        elif self.hora == "6o18":
            f0 = 0.0 if r.random() < 0.5 else 0.5
        else:
            f0 = float(self.hora)
        self.hora0 = DIA * f0
        self.bot = np.zeros(2)
        self.arboles = self._arboles(self.bot, int(r.integers(2, 13)), 4, 60)  # como en F2
        self.enfrente, self.objetos, self.inv, self.jugador = None, [], 0, None
        alcanzables = [i for i, a in enumerate(self.arboles) if a["alcanzable"]]
        if alcanzables and r.random() < 0.5:  # la mitad empiezan delante de un árbol, como en F2
            self.enfrente = alcanzables[int(r.integers(len(alcanzables)))]
            self.bot = self.arboles[self.enfrente]["pos"] + np.array([1.0, 0.0])
        self.objetivo = self.enfrente
        # el cuerpo y el inventario: variados (el banco de F7.6 repondrá uno fijo)
        self.salud = 20.0 if r.random() < 0.8 else float(r.integers(8, 20))
        self.hambre = float(r.integers(8, 21))
        self.comida = sorted(int(r.choice(COMIDA_INICIAL)) for _ in range(0 if r.random() < 0.3 else int(r.integers(1, 7))))
        self.tierra = 0 if r.random() < 0.4 else int(r.integers(1, 7))
        self.piedra = 0 if r.random() < 0.7 else int(r.integers(1, 4))
        self.tablones = 0 if r.random() < 0.7 else int(r.integers(1, 5))
        self.palos = 0
        u = r.random()
        self.arma = 0.0 if u < 0.5 else 0.5 if u < 0.8 else 1.0
        self.pico = bool(self.arma > 0 and r.random() < 0.5)
        self.mesa, self.cama = bool(r.random() < 0.2), bool(r.random() < 0.15)
        self.armadura = 0 if r.random() < 0.75 else int(r.integers(2, 9))
        # el mundo
        self.hostiles = []
        self.animales = self._animales(self.bot, int(r.integers(0, 7)), 8, 60)
        self.refugio, self.refugio_ok, self.refugio_modo, self.en_refugio = None, False, None, False
        self.peligro, self.t_apartado = dict.fromkeys(PELIGRO, 0), -1e9
        if f0 < 0.1 and r.random() < 0.25:  # por la mañana, a veces queda un creeper de la noche
            self._aparecer("creeper", r.uniform(12, 30), persigue=False)
        fac0 = self._fac_aparicion(f0)
        if fac0 > 0:  # empieza a oscuras: ya hay hostiles fuera (aún sin verle), como si llevara un rato de noche
            oscuro = 0.0
            while oscuro < PREVIOS["max_s"] and self._fac_aparicion((f0 - (oscuro + 1) / DIA) % 1) > 0:
                oscuro += 1
            for _ in range(min(APARICION["max"], int(r.poisson(APARICION["ritmo"] * fac0 * max(oscuro, 1.0))))):
                self._aparecer(d=r.uniform(*PREVIOS["dist"]), persigue=False)
        self.noche_antes, self.dano_noche, self.noches_ok = self._noche(), 0.0, 0
        self.noches = int(self.noche_antes)  # si empieza de noche, esa noche (lo que queda de ella) también cuenta
        self.previa, self.previa_ok = -1, 0
        self.perdida = self.comido = 0.0
        self.bonus, self.herido, self.atacante = 0, 0, None
        # para comparar políticas
        self.ganados, self.perdida_total, self.comido_total, self.muerte = 0, 0.0, 0.0, None
        self.golpes, self.matados, self.reflejos_n = Counter(), Counter(), Counter()
        self.luchando = None  # el hostil con el que pelea ahora (_atacar): acierta con p_contra
        return self.obs()

    def _f(self):
        return ((self.hora0 + self.t) % DIA) / DIA

    @staticmethod
    def _fac_aparicion(f):
        """Cuánto aparecen hostiles a la hora f (0 con luz del cielo ≥ 8, 1 con ≤ 4), como en _sub()."""
        return min(1.0, max(0.0, (8 - (15 - oscurecimiento(f))) / 4))

    def _colocables(self):
        return self.tierra + self.piedra + self.tablones

    def _dh(self, e):
        return math.hypot(e["x"] - self.bot[0], e["y"] - self.bot[1])

    def _amenaza_cerca(self, radio=INTERRUPCION):
        return any(self._dh(e) <= radio for e in self.hostiles)

    def obs(self):
        vis = self._visibles()
        a = self.arboles[self.enfrente] if self.enfrente is not None else None
        cerca = sum(self._d(ob[0]) <= RADIO_OBJ for ob in self.objetos)
        hs = sorted((self._dh(e), e["tipo"]) for e in self.hostiles)
        primero = hs[0] if hs and hs[0][0] < RADIO_HOSTIL else None
        f = self._f()
        o = [min(self._d(self.arboles[vis[0]]["pos"]), VISTA) / VISTA if vis else 1.0, float(a is not None),
             float(a is not None and a["k"] > 0), min(cerca, 4) / 4, min(self.inv, META) / META, 1.0]
        o += [primero[0] / RADIO_HOSTIL if primero else 1.0] + [float(primero is not None and primero[1] == t) for t in TIPOS_HOSTIL]
        o += [min(sum(d < RADIO_HOSTILES for d, _ in hs), HOSTILES_MAX) / HOSTILES_MAX]
        o += [self.salud / 20, self.hambre / 20, min(len(self.comida), COMIDA_MAX) / COMIDA_MAX]
        o += [float(NOCHE[0] <= f <= NOCHE[1]), (1 + math.sin(2 * math.pi * f)) / 2, (1 + math.cos(2 * math.pi * f)) / 2,
              0.0 if self.en_refugio else (15 - oscurecimiento(f)) / 15]
        o += [self.arma, min(self.armadura, ARMADURA_MAX) / ARMADURA_MAX, min(self._colocables(), TIERRA_MAX) / TIERRA_MAX,
              float(self.cama)]
        o += [min(self._d(self.refugio), VISTA) / VISTA if self.refugio is not None else 1.0, float(self.en_refugio)]
        o += [float(self.peligro[k] > 0) for k in ("caida", "lava_cerca", "agua_profunda")]
        o += [max(0.0, self.T - self.t) / self.T]
        o += [float(k == self.previa) for k in range(len(ACCIONES))] + [float(self.previa_ok)] + self.vperfil
        return np.array(o, dtype=np.float32)

    # ---- el mundo en marcha ----
    def _danar(self, x, causa):
        if x <= 0 or self.salud <= 0:
            return
        x = min(x, self.salud)
        self.salud -= x
        self.perdida += x
        self.perdida_total += x
        self.golpes[causa] += 1
        self.herido += causa in HOSTIL  # golpes de hostiles en este paso
        if causa in HOSTIL:
            self.atacante = causa  # el tipo del último que le ha golpeado (para la regla del usuario, F7.2)
        if self.noche_antes:
            self.dano_noche += x
        if self.salud <= 1e-9:
            self.salud, self.muerte = 0.0, causa

    def _aparecer(self, tipo=None, d=None, persigue=None):
        r = self.rng
        tipo = tipo or TIPOS_HOSTIL[int(r.choice(len(TIPOS_HOSTIL), p=PESOS_APARICION))]
        d = r.uniform(*APARICION["dist"]) if d is None else d
        a = r.uniform(0, 2 * np.pi)
        self.hostiles.append({"tipo": tipo, "x": float(self.bot[0]) + d * math.cos(a), "y": float(self.bot[1]) + d * math.sin(a),
                              "vida": float(HOSTIL[tipo]["vida"]), "cd": 0.0, "mecha": 0.0, "asedio": False, "provocado": False,
                              "persigue": (not self.en_refugio and d <= max(DETECCION, HOSTIL[tipo]["rango"]))
                              if persigue is None else persigue})

    def _sub(self, h, actividad):
        """Un paso de h segundos: hora (y noche pasada sin daño), hambre, vida, aparición de hostiles y lo que hacen."""
        r = self.rng
        self.t += h
        f = self._f()
        noche = NOCHE[0] <= f <= NOCHE[1]
        if noche and not self.noche_antes:
            self.noches, self.dano_noche = self.noches + 1, 0.0
        elif self.noche_antes and not noche and self.salud > 0 and self.dano_noche == 0:
            self.noches_ok += 1
            self.bonus += 1
        self.noche_antes = noche
        self.hambre = max(0.0, self.hambre - h / HAMBRE[actividad])
        if self.hambre >= 18 and self.salud < 20:
            cura = min(20 - self.salud, h / 4)
            self.salud += cura
            self.hambre -= COSTE_CURA * cura
        elif self.hambre <= 0 and self.salud > 1:
            self._danar(min(self.salud - 1, h / 4), "hambre")
        luz = 15 - oscurecimiento(f)  # la del cielo, donde aparecen y arden
        fac = min(1.0, max(0.0, (8 - luz) / 4))
        if fac > 0 and sum(self._dh(e) <= RADIO_HOSTIL for e in self.hostiles) < APARICION["max"] and \
                r.random() < 1 - math.exp(-h * APARICION["ritmo"] * fac):
            self._aparecer()
        if self.hostiles:
            self._hostiles(h, luz)

    def _hostiles(self, h, luz):
        r = self.rng
        bx, by = float(self.bot[0]), float(self.bot[1])
        quedan, golpes = [], []
        for e in self.hostiles:
            esp, tipo = HOSTIL[e["tipo"]], e["tipo"]
            dx, dy = bx - e["x"], by - e["y"]
            d = math.hypot(dx, dy)
            if self.en_refugio:
                e["asedio"] = e["asedio"] and r.random() >= h / ASEDIO_S
                e["persigue"] = e["asedio"]
            elif not (e["provocado"] or not (esp.get("neutral_dia") and luz >= LUZ_NEUTRAL)):
                e["persigue"] = False  # araña de día
            elif not e["persigue"]:
                e["persigue"] = d <= max(DETECCION, esp["rango"]) and r.random() < 1 - math.exp(-h / 2)
            elif d > esp["rango"]:
                e["persigue"] = False
            if e["persigue"] and d > 1e-6:
                if d > esp["para"]:
                    paso = min(esp["vel"] * h, d - esp["para"])
                    e["x"] += dx / d * paso
                    e["y"] += dy / d * paso
                elif tipo == "esqueleto" and d < 6:  # se aparta para disparar
                    e["x"] -= dx / d * h
                    e["y"] -= dy / d * h
            elif not e["persigue"]:
                e["x"], e["y"] = e["x"] + r.normal(0, 0.4 * math.sqrt(h)), e["y"] + r.normal(0, 0.4 * math.sqrt(h))
            d = math.hypot(bx - e["x"], by - e["y"])
            e["cd"] -= h
            if tipo == "creeper":
                e["mecha"] = e["mecha"] + h if e["persigue"] and d <= esp["alcance"] else max(0.0, e["mecha"] - h)
                if e["mecha"] >= esp["mecha"]:
                    q = max(0.0, 1 - d / 6)
                    x = (q * q + q) / 2 * 42 + 1 if q > 0 else 0.0  # daño de una explosión de potencia 3 en normal
                    if self.en_refugio:
                        x *= REFUGIO_EXPLOSION
                        self.en_refugio = self.refugio_ok = False
                    golpes.append((x, "creeper"))
                    continue  # el creeper desaparece
            elif e["persigue"] and not self.en_refugio and e["cd"] <= 0 and d <= esp["alcance"]:
                e["cd"] = esp["cada"]
                if e is self.luchando and r.random() >= self.cal["atacar"]["p_contra"].get(tipo, 1.0):
                    pass  # F7.6b: peleando con él, el retroceso le aparta (p_contra)
                elif tipo == "esqueleto":
                    if r.random() < min(0.9, max(0.35, 1.2 - d / 20)):  # 0,7 a 10 bloques contra quien no esquiva
                        golpes.append((float(r.integers(esp["dano"][0], esp["dano"][1] + 1)), tipo))
                else:
                    golpes.append((float(esp["dano"]), tipo))
            if esp.get("arde") and luz >= LUZ_ARDE:
                e["vida"] -= ARDE * h
            if e["vida"] > 0 and d <= 40 and (e["persigue"] or d <= 32 or r.random() >= h / DESAPARECE_S):
                quedan.append(e)
        self.hostiles = quedan
        for x, tipo in golpes:
            self._danar(x * (1 - min(self.armadura, ARMADURA_MAX) / 25), tipo)

    def _pasar(self, dt, interrumpible=False, actividad="trabajo"):
        """Avanza el mundo dt s, o hasta que un hostil a ≤ INTERRUPCION o un golpe interrumpe (si interrumpible), muere o se
        acaba el episodio. Devuelve True si se interrumpió."""
        fin, herido = self.t + dt, self.herido
        while self.t < fin - 1e-9 and self.salud > 0 and self.t < self.T:
            if interrumpible and not self.en_refugio and (self._amenaza_cerca() or self.herido > herido):
                return True
            h = min(SUB if self.hostiles else LARGO, fin - self.t, self.T - self.t)
            self._sub(h, actividad)
            if self.peligro["agua_profunda"] == 2 and not self.en_refugio:  # F7.6b: quieto en el agua, se ahoga
                self._danar(AHOGO * h, "ahogo")
        return False

    def _andar(self, destino, vel=VEL, interrumpible=False, actividad="trabajo", llegar=1.0):
        """Anda hacia destino con el mundo en marcha. Devuelve «llegó», «amenaza» o «fin» (muerto o fin del episodio)."""
        self.enfrente = self.objetivo = None
        herido = self.herido
        while self.salud > 0 and self.t < self.T:
            d = self._d(destino)
            if d <= llegar:
                return "llegó"
            if interrumpible and (self._amenaza_cerca() or self.herido > herido):
                return "amenaza"
            h = min(SUB, (d - llegar) / vel + 1e-3, self.T - self.t)
            self.bot = self.bot + (destino - self.bot) * min(1.0, vel * h / d)
            self._sub(h, actividad)
        return "fin"

    def _terreno(self, de=None):
        """Al llegar a un sitio nuevo: el daño de los peligros que no se apartaron y los peligros de aquí (tras huir o ir_a_arbol,
        `de`, el agua honda con la probabilidad medida en AGUA)."""
        r = self.rng
        for k, (p, x) in DANO_PELIGRO.items():
            if self.peligro[k] and r.random() < p:
                self._danar(x, k)
        for k, p in PELIGRO.items():
            self.peligro[k] = int(r.random() < (AGUA.get(de, p) if k == "agua_profunda" else p))
        if de == "huir" and self.peligro["agua_profunda"]:
            self.peligro["agua_profunda"] = 2  # tras huir, en el agua (ver AGUA)

    # ---- habilidades: devuelven (éxito, causa, troncos ganados); el tiempo pasa dentro (_pasar, _andar, _sub) ----
    def _sv_ir_a_arbol(self):
        """El ir_a_arbol de F2 (mismas probabilidades y tiempos), pero andando con el mundo en marcha: en F2 el personaje se
        plantaba en el árbol y aquí podía aparecer pegado a un creeper; en Minecraft la amenaza le corta a 6 bloques."""
        c, r = self.cal["ir_a_arbol"], self.rng
        vis = self._visibles()
        for j in vis:  # descarta (y recuerda) los inalcanzables, del más cercano en adelante
            if self.arboles[j]["alcanzable"]:
                break
            self.arboles[j]["agotado"] = True
        vis = [j for j in vis if self.arboles[j]["alcanzable"]]
        if not vis:
            return False, "sin árbol", 0
        i = vis[0]
        if self.enfrente == i:
            return True, "árbol enfrente", 0
        pos = self.arboles[i]["pos"]
        d = self._d(pos)
        if r.random() < c["p"] ** (d / 20):
            s = c["s_paso"] * max(1.0, 1.3 * d)
            fue = self._andar(pos + (self.bot - pos) / max(d, 1e-6), vel=max(d, 1e-6) / s, interrumpible=True, llegar=0.2)
            if fue != "llegó":
                return False, fue, 0
            self.enfrente = self.objetivo = i
            self._terreno("ir_a_arbol")
            return True, "árbol enfrente", 0
        t0 = self.t
        fue = self._andar(self.bot + (pos - self.bot) * r.uniform(0.2, 0.8), vel=VEL / 2, interrumpible=True)
        if fue != "llegó" or self._pasar(max(0.0, c["s_fallo"] - (self.t - t0)), interrumpible=True):
            return False, "amenaza" if fue != "fin" else "fin", 0
        self.objetivo = i
        self._terreno("ir_a_arbol")
        return False, "bloqueado", 0

    def _sv_picar(self):
        i = self.enfrente
        exito, causa, s, ganados = self._picar(self.cal["picar_tronco"])
        if exito and i is not None and self.arboles[i]["agotado"] and self.rng.random() < MANZANA:
            self.comida = sorted(self.comida + [4])
        if self._pasar(s, interrumpible=True):
            return False, "amenaza", 0
        return exito, causa, ganados

    def _sv_recoger(self):
        exito, causa, s, ganados = self._recoger(self.cal["recoger"])
        if self._pasar(s, interrumpible=True):
            return False, "amenaza", 0
        return exito, causa, ganados

    def _huir(self):
        """Lejos de los hostiles a < 16 (dirección contraria a ellos, pesada por cercanía) hasta no tener ninguno a < 16, o 20 s.
        Con probabilidad 1 − p (la de F2) no hay camino: se aparta 0-4 bloques, como en F2. A salvo, los que le seguían pueden
        perder el rastro (la mitad; un zombi, 3 de cada 10)."""
        c, cs, r = self.cal["huir"], self.cal["huir_sv"], self.rng
        if not self._amenaza_cerca(DETECCION):
            return True, "sin amenaza", 0
        self.enfrente = self.objetivo = None
        if r.random() >= c["p"]:
            e = min(self.hostiles, key=self._dh)
            lejos = (self.bot - np.array([e["x"], e["y"]])) / max(self._dh(e), 1e-6)
            self._andar(self.bot + lejos * r.uniform(0, 4), vel=cs["vel"], actividad="lucha", llegar=0.1)
            return False, "sin camino", 0
        t0, a_salvo = self.t, False
        while self.salud > 0 and self.t < self.T and self.t - t0 < cs["max_s"]:
            cerca = [(self._dh(e), e) for e in self.hostiles]
            cerca = [(d, e) for d, e in cerca if d < DETECCION]
            if not cerca:
                a_salvo = True
                break
            vx = sum((self.bot[0] - e["x"]) / max(d, 0.5) ** 2 for d, e in cerca)
            vy = sum((self.bot[1] - e["y"]) / max(d, 0.5) ** 2 for d, e in cerca)
            norma = math.hypot(vx, vy)
            if norma < 1e-9:
                a = r.uniform(0, 2 * np.pi)
                vx, vy, norma = math.cos(a), math.sin(a), 1.0
            h = min(SUB, self.T - self.t)
            self.bot = self.bot + np.array([vx, vy]) / norma * cs["vel"] * h
            self._sub(h, "lucha")
        if not a_salvo:
            return False, "no me suelta" if self.salud > 0 and self.t < self.T else "fin", 0
        for e in self.hostiles:
            if e["persigue"] and r.random() < (cs["pierde_zombi"] if e["tipo"] == "zombi" else cs["pierde"]):
                e["persigue"] = False
        self._terreno("huir")
        return True, "a salvo", 0

    def _comer(self, minimo=14):
        """La mejor comida primero, un bocado tras otro, hasta hambre ≥ minimo (al menos uno si no está lleno)."""
        c = self.cal["comer"]
        if not self.comida:
            return False, "sin comida", 0
        if self.hambre >= 20:
            return False, "sin hambre", 0
        while self.comida and self.salud > 0 and self.hambre < 20:
            v = self.comida.pop()
            self._pasar(c["s_bocado"], actividad="reposo")
            if self.rng.random() >= c["p"]:
                self.comida = sorted(self.comida + [v])
                return False, "interrumpido", 0
            ganado = min(v, 20 - self.hambre)
            self.hambre += ganado
            self.comido += ganado
            self.comido_total += ganado
            if self.hambre >= minimo:
                break
        return True, "comido", 0

    def _atacar(self, acorralado=False):
        """Al hostil más cercano a < 16: se niega con un creeper (huye), con vida < 8, con más de 2 hostiles o sin arma (F7.2:
        como el cuerpo; acorralado, sin mirar la vida ni cuántos son). Se acerca y golpea cada 0,6 s a ≤ 3 bloques (el golpe empuja
        1,5 bloques); se rinde con vida < 8 (salvo acorralado), un creeper a ≤ 5 o a los 20 s."""
        c, r = self.cal["atacar"], self.rng
        vistos = sorted(((self._dh(e), k) for k, e in enumerate(self.hostiles)), key=lambda x: x[0])
        vistos = [self.hostiles[k] for d, k in vistos if d < DETECCION]
        if not vistos:
            return False, "sin hostil", 0
        obj = vistos[0]
        if obj["tipo"] == "creeper":
            self._huir()
            return False, "creeper", 0
        if self.salud < SALUD_ATACAR and not acorralado:
            return False, "salud baja", 0
        if len(vistos) > MAS_DE and not acorralado:
            return False, "demasiados", 0
        if self.arma == 0 and not ATACA_CON_PUNO:
            return False, "sin arma", 0
        self.enfrente = self.objetivo = None
        obj["provocado"] = obj["persigue"] = True
        self.luchando = obj
        try:
            return self._pelea(obj, acorralado)
        finally:
            self.luchando = None

    def _pelea(self, obj, acorralado):
        c, r = self.cal["atacar"], self.rng
        t0, cd = self.t, 0.0
        while True:
            if not any(e is obj for e in self.hostiles):  # ardió o se perdió
                return True, "huyó" if obj["vida"] > 0 else "muerto", 0
            if self.salud <= 0 or self.t >= self.T:
                return False, "fin", 0
            d = self._dh(obj)
            if d > DETECCION:
                return True, "huyó", 0
            if self.salud < SALUD_ATACAR and not acorralado:
                return False, "salud baja", 0
            if self.t - t0 >= c["max_s"]:
                return False, "tiempo agotado", 0
            if any(e["tipo"] == "creeper" and self._dh(e) <= 5 for e in self.hostiles):
                return False, "creeper", 0
            dx, dy = obj["x"] - self.bot[0], obj["y"] - self.bot[1]
            if d > 2.5:
                paso = min(VEL * SUB, d - 2)
                self.bot = self.bot + np.array([dx, dy]) / d * paso
            elif cd <= 0:
                cd = c["cada"]
                if r.random() < c["p_golpe"]:
                    obj["vida"] -= ARMA[self.arma]
                    if obj["vida"] <= 0:
                        self.hostiles = [e for e in self.hostiles if e is not obj]
                        self.matados[obj["tipo"]] += 1
                        return True, "muerto", 0
                    obj["x"] += dx / max(d, 0.1) * 1.5
                    obj["y"] += dy / max(d, 0.1) * 1.5
            self._sub(min(SUB, self.T - self.t), "lucha")
            cd -= SUB

    def _encerrar(self, modo):
        self.en_refugio, self.refugio, self.refugio_ok, self.refugio_modo = True, self.bot.copy(), True, modo
        self.enfrente = self.objetivo = None
        for e in self.hostiles:  # dejan de verle; de los que le seguían cerca, algunos se quedan junto a la pared
            e["asedio"] = e["tipo"] != "esqueleto" and e["persigue"] and self._dh(e) <= 8 and self.rng.random() < ASEDIO
            e["persigue"] = e["asedio"]

    def _salir(self):
        self._pasar(self.cal["refugiarse"]["s_salir"], actividad="trabajo")
        if self.en_refugio:
            self.en_refugio = False
            self.tierra += self.refugio_modo == "tapiado"  # el bloque que rompe para salir
        for e in self.hostiles:  # los de asedio siguen persiguiéndole: están al lado
            e["asedio"] = False

    def _gastar(self, n):
        for k in ("tierra", "tablones", "piedra"):  # la piedra, lo último: sirve para la espada
            x = min(n, getattr(self, k))
            setattr(self, k, getattr(self, k) - x)
            n -= x

    def _refugiarse(self):
        """El modo automático del cuerpo (refugiarse.js, F7.2), en su orden: se tapia donde está si faltan ≤ max_tapiar bloques
        alrededor (2-10 según el terreno: en llano, 10) y los lleva; si no, vuelve al refugio tapiado conocido si está entero, a
        ≤ 16 y lleva 1 bloque para cerrarlo; si no, cava 3 hacia abajo y se tapa (nunca junto a lava o agua honda; sin pico falla
        más); si no, se tapia con los que hagan falta."""
        c, r = self.cal["refugiarse"], self.rng
        if self.en_refugio:
            return True, "ya dentro", 0
        if self._amenaza_cerca(RADIO_LIBRE):  # F7.2: como el cuerpo, no se encierra con un hostil al lado
            return False, "monstruos cerca", 0
        self.enfrente = self.objetivo = None
        faltan = int(r.integers(c["bloques"][0], c["bloques"][1] + 1))

        def tapiar():
            self._pasar(c["s"])
            if self.salud > 0 and r.random() < c["p"]:
                self._gastar(faltan)
                self._encerrar("tapiado")
                return True, "tapiado", 0
            return False, "no se pudo tapiar", 0
        if faltan <= c["max_tapiar"] and self._colocables() >= faltan:
            return tapiar()
        if (self.refugio is not None and self.refugio_ok and self.refugio_modo == "tapiado" and self._colocables() >= 1
                and self._d(self.refugio) <= 16):
            if self._andar(self.refugio) == "llegó":
                self._pasar(c["s_entrar"])
                if self.salud > 0:
                    self.bot = self.refugio.copy()
                    self._gastar(1)
                    self._encerrar(self.refugio_modo)
                    return True, "vuelvo al refugio", 0
            return False, "fin", 0
        if self.peligro["lava_cerca"] or self.peligro["agua_profunda"]:
            if not self.peligro["lava_cerca"] and r.random() < c["p_agua"]:  # F7.6b: un sitio seco cerca, y allí cava
                self._pasar(c["s_seco"])
                if self.salud <= 0:
                    return False, "fin", 0
                self.peligro["agua_profunda"] = 0
                if self._amenaza_cerca(RADIO_LIBRE):
                    return False, "monstruos cerca", 0
            elif self._colocables() >= faltan:
                return tapiar()
            else:
                self._pasar(c["s_agua"])
                return False, "suelo peligroso", 0
        self._pasar(c["s_cavar"])
        if self.salud > 0 and r.random() < (c["p_cavar"] if self.pico else c["p_cavar_sin_pico"]):
            self.tierra += 1  # cava 2 y pone 1 encima
            self.piedra += bool(self.pico and r.random() < 0.5)
            self._encerrar("cavado")
            return True, "cavado", 0
        return False, "no se pudo cavar" if self.pico else "sin bloques ni pico", 0

    def _inseguro(self):
        """F7.6b (decisión del usuario): dentro del refugio, ¿aún no es seguro salir? Vida < SALUD_SALIR pudiendo curarse (hambre
        ≥ 18 o comida) o un hostil a ≤ RADIO_SALIR."""
        return (self.salud < SALUD_SALIR and (self.hambre >= 18 or bool(self.comida))) or self._amenaza_cerca(RADIO_SALIR)

    def _dormir(self):
        """De noche: con cama y fuera del refugio, la pone y duerme (se niega con un hostil a ≤ 8; un golpe le despierta) y salta
        al amanecer; dentro del refugio, espera al día, hasta ESPERA_HASTA (y come si el hambre baja de 6) y, desde F7.6b, hasta
        que sea seguro salir (_inseguro: recuperando vida, comiendo hasta 18 para curarse; de día, como mucho ESPERA_MAX s)."""
        c, r = self.cal["dormir"], self.rng
        if not self._noche() and not (self.en_refugio and (self._esperable() or self._inseguro())):
            return False, "es de día", 0
        if self.cama and not self.en_refugio:
            if self._amenaza_cerca(8):
                return False, "monstruos cerca", 0
            vida = self.salud
            self._pasar(c["s"], actividad="reposo")
            if self.salud < vida:
                return False, "despertado", 0
            if self.salud <= 0 or self.t >= self.T or r.random() >= c["p"]:
                return False, "no se pudo dormir", 0
            self.hora0 += (1.0 - self._f()) % 1.0 * DIA + 0.01  # salta al amanecer (f = 0)
            self._sub(0.1, "reposo")
            return True, "amanece", 0
        if not self.en_refugio:
            return False, "sin cama y sin refugio", 0
        dia = None  # desde cuándo espera de día (solo por _inseguro)
        while self.en_refugio and self.salud > 0 and self.t < self.T:
            if not self._esperable():
                dia = self.t if dia is None else dia
                if not self._inseguro() or self.t - dia >= ESPERA_MAX:
                    break
            if self.hambre <= 6 and self.comida:
                self._comer()
            elif self.salud < SALUD_SALIR and self.hambre < 18 and self.comida:  # para curarse (con 18 cura)
                self._comer(minimo=18)
            self._pasar(10.0 if self._noche() else 2.0, actividad="reposo")
        if self.salud <= 0 or self.t >= self.T:
            return False, "fin", 0
        if not self.en_refugio:
            return False, "refugio roto", 0
        if self._inseguro():
            return False, "tiempo agotado", 0
        return True, "amanece" if dia is None or self.t - dia < 1e-9 else "a salvo", 0

    def _madrugada(self):
        """Del final de la noche (NOCHE[1]) a ESPERA_HASTA."""
        f = self._f()
        return f > NOCHE[1] or f < ESPERA_HASTA

    def _esperable(self):
        """Cuándo dormir espera al día dentro del refugio: del ATARDECER (antes de la noche) a ESPERA_HASTA (F7.6)."""
        f = self._f()
        return f >= ATARDECER or f < ESPERA_HASTA

    def _fabricar(self):
        c = self.cal["fabricar"]
        objeto = siguiente_fabricacion(self.arma, self.pico, self.mesa, self.tablones, self.palos, self.inv, self.piedra,
                                       self._colocables())
        if objeto is None:
            return False, "faltan materiales", 0
        s = c["s"] + (c["s_mesa"] if objeto != "tablones" and not self.mesa else 0)
        if self._pasar(s, interrumpible=True):
            return False, "amenaza", 0
        if self.salud <= 0 or self.rng.random() >= c["p"]:
            return False, "no se pudo", 0
        if objeto == "tablones":
            self.inv -= 1
            self.tablones += 4
            return True, objeto, 0
        t, p, q = RECETAS[objeto]
        k = _troncos_para(objeto, self.tablones, self.palos, self.mesa)
        self.inv, self.tablones = self.inv - k, self.tablones + 4 * k
        if not self.mesa:
            self.tablones, self.mesa = self.tablones - 4, True
        if self.palos < p:
            self.tablones, self.palos = self.tablones - 2, self.palos + 4
        self.tablones, self.palos, self.piedra = self.tablones - t, self.palos - p, self.piedra - q
        if objeto == "pico_madera":
            self.pico = True
        else:
            self.arma = max(self.arma, 0.5 if objeto == "espada_madera" else 1.0)
        return True, objeto, 0

    def _recoger_comida(self):
        """De día y con hambre ≤ 12: va al animal más cercano a ≤ radio (24, como el cuerpo), lo mata (con el arma que tenga) y
        recoge la carne."""
        c, r = self.cal["recoger_comida"], self.rng
        if self.hambre > 12:
            return False, "sin hambre", 0
        if self._noche():
            return False, "de noche", 0
        vis = [an for an in self.animales if self._d(an["pos"]) <= c["radio"]]
        if not vis:
            return False, "nada que comer a la vista", 0
        an = min(vis, key=lambda x: self._d(x["pos"]))
        fue = self._andar(an["pos"], interrumpible=True, llegar=2.0)
        if fue != "llegó":
            return False, fue, 0
        vida, valor, n0, n1 = ANIMALES[an["tipo"]]
        if self._pasar(math.ceil(vida / ARMA[self.arma]) * 0.6 / self.cal["atacar"]["p_golpe"] + c["s"], interrumpible=True,
                       actividad="lucha"):
            return False, "amenaza", 0
        if self.salud <= 0:
            return False, "fin", 0
        if r.random() >= c["p"]:
            an["pos"] = an["pos"] + r.normal(0, 6, 2)
            return False, "se escapó", 0
        self.animales = [x for x in self.animales if x is not an]
        self.comida = sorted(self.comida + [valor] * int(r.integers(n0, n1 + 1)))
        return True, "cazado", 0

    def _explorar(self):
        """40 bloques en una dirección al azar; al llegar ve árboles y a veces animales nuevos (los de muy lejos se olvidan)."""
        c, r = self.cal["explorar"], self.rng
        a = r.uniform(0, 2 * np.pi)
        rumbo = np.array([np.cos(a), np.sin(a)])
        t0 = self.t
        if r.random() >= c["p"]:
            fue = self._andar(self.bot + rumbo * c["bloques"] * r.uniform(0.1, 0.5), vel=VEL / 1.3, interrumpible=True)
            if fue != "llegó" or self._pasar(max(0.0, c["s_fallo"] - (self.t - t0)), interrumpible=True):
                return False, "amenaza" if fue != "fin" else "fin", 0
            return False, "sin avance", 0
        fue = self._andar(self.bot + rumbo * c["bloques"], vel=VEL / 1.3, interrumpible=True)
        if fue == "fin":
            return False, "fin", 0
        interrumpido = fue == "amenaza"
        self.arboles = [x for x in self.arboles if self._d(x["pos"]) < 120] + self._arboles(self.bot, int(r.integers(0, 5)), 8, 40)
        self.enfrente = self.objetivo = None
        self.objetos = [o for o in self.objetos if self._d(o[0]) < 120]
        if r.random() < 0.35:
            self.animales += self._animales(self.bot, int(r.integers(1, 3)), 8, 40)
        self._terreno()
        return (False, "amenaza", 0) if interrumpido else (True, "explorado", 0)

    # ---- reflejos del cuerpo y paso ----
    def _necesita_salir(self, h):
        """¿La habilidad elegida, desde dentro del refugio, haría algo fuera? (si no, falla sin salir)"""
        if h not in SALEN:
            return False
        return {"ir_a_arbol": lambda: bool(self._visibles()),
                "recoger": lambda: any(self._d(o[0]) <= RADIO_OBJ for o in self.objetos),
                "huir": lambda: self._amenaza_cerca(DETECCION), "atacar": lambda: self._amenaza_cerca(DETECCION),
                "recoger_comida": lambda: self.hambre <= 12 and not self._noche() and
                any(self._d(an["pos"]) <= self.cal["recoger_comida"]["radio"] for an in self.animales),
                "explorar": lambda: True}[h]()

    def _reflejos(self, h):
        """Los reflejos del cuerpo tras la habilidad (bot/reflejos.js, F7.2), en su orden: huir de un creeper a ≤ 6; tras un golpe
        de un monstruo, la regla del usuario (huir con más de 2 a la vista, vida < 8 o sin arma; si no, defenderse); huir con vida
        < 8 y un hostil a ≤ 8; tras huir de noche, refugiarse; si huir falla y un hostil sigue a ≤ 4, defenderse (acorralado);
        después, apartarse de peligros del terreno (antes iba primero: 2 s quieto con un creeper al lado) y comer con hambre ≤ 6.
        Devuelve los que se hicieron."""
        hechos = []

        def huir_y_refugio():
            ok, _, _ = self._huir()
            hechos.append("huir")
            pegado = [e for e in self.hostiles if self._dh(e) <= ACORRALADO and e["tipo"] != "creeper"]
            if not ok and self.salud > 0 and pegado and self.arma > 0:
                self._atacar(acorralado=True)
                hechos.append("atacar")
            elif self.salud > 0 and self._noche():
                self._refugiarse()
                hechos.append("refugiarse")

        fuera = self.salud > 0 and not self.en_refugio and self.t < self.T
        if fuera and h != "huir" and any(e["tipo"] == "creeper" and self._dh(e) <= RADIO_CREEPER for e in self.hostiles):
            self._huir()
            hechos.append("huir")
        elif fuera and self.herido and h not in ("huir", "atacar", "refugiarse"):
            n = sum(1 for e in self.hostiles if self._dh(e) < DETECCION)
            if self.atacante == "creeper" or n > MAS_DE or self.salud < SALUD_ATACAR or self.arma == 0:
                huir_y_refugio()
            elif self._amenaza_cerca(DETECCION):
                self._atacar()
                hechos.append("atacar")
        elif fuera and self.salud < 8 and h not in ("huir", "refugiarse") and self._amenaza_cerca(8):
            huir_y_refugio()
        if (self.salud > 0 and not self.en_refugio and any(self.peligro.values())  # el terreno, después de los monstruos
                and self.t - self.t_apartado >= APARTARSE_CADA):
            self.t_apartado = self.t
            self._pasar(2.0)
            if self.rng.random() < min(APARTARSE[k] for k, v in self.peligro.items() if v):
                a = self.rng.uniform(0, 2 * np.pi)
                self._mover(self.bot + 4 * np.array([np.cos(a), np.sin(a)]))
                self.peligro = dict.fromkeys(PELIGRO, 0)
            hechos.append("apartarse")
        if self.salud > 0 and self.hambre <= 6 and self.comida and h != "comer":
            self._comer()
            hechos.append("comer")
        self.reflejos_n.update(hechos)
        return hechos

    def step(self, a):
        """Aplica ACCIONES[a] (saliendo antes del refugio si hace falta) y los reflejos. Cada decisión dura ≥ 1 s."""
        h = ACCIONES[a]
        t0 = self.t
        self.perdida = self.comido = 0.0
        self.bonus, self.herido, self.atacante = 0, 0, None
        self.objetivo = self.enfrente
        if self.en_refugio and self._necesita_salir(h):
            self._salir()
        exito, causa, ganados = self._habilidades[a]() if self.salud > 0 else (False, "muerto", 0)
        self.inv += ganados
        self.ganados += ganados
        if self.salud > 0 and self.t - t0 < 1.0:
            self._pasar(1.0 - (self.t - t0), actividad="reposo")
        reflejos = self._reflejos(h) if self.reflejos and self.salud > 0 and self.t < self.T else []
        dt = self.t - t0
        self.objetos = [[p, e + dt, ok] for p, e, ok in self.objetos if e + dt < 300]  # desaparecen a los 5 min
        self.decisiones += 1
        self.previa, self.previa_ok = a, int(exito)
        w = self.perfil
        r = (w["madera"] * ganados - w["tiempo"] * dt - w["seguridad"] * 0.05 * self.perdida
             + w["supervivencia"] * (COMIDA_R * self.comido + NOCHE_R * self.bonus))
        muerto = self.salud <= 0
        if muerto:
            r -= 5 * w["seguridad"]
        self.hecho = muerto or self.t >= self.T - 1e-9 or self.decisiones >= self.T
        info = {"habilidad": h, "exito": exito, "causa": causa, "s": round(dt, 1), "agente": 0, "fin": self.hecho,
                "reflejos": reflejos, "perdida": round(self.perdida, 1), "noche_sin_dano": self.bonus}
        return self.obs(), float(r), self.hecho, info


# ---- guiones ----
def _madera(s, g):
    """El guion de madera de F2 sin jugador: objetos cerca → recoger (salvo si acaba de fallar); árbol enfrente → picar; árbol
    a la vista → ir_a_arbol; si no, explorar."""
    a = np.full(len(s), A["explorar"])
    a = np.where(g("arbol_dist") < 1, A["ir_a_arbol"], a)
    a = np.where(g("arbol_enfrente") > 0, A["picar_tronco"], a)
    return np.where((g("objetos_suelo") > 0) & ~((g("previa_recoger") > 0) & (g("previa_exito") == 0)), A["recoger"], a)


def guion_sv_lote(s):
    """Guion de supervivencia para un lote de observaciones (N×len(OBS)) → índices de ACCIONES. Ver el docstring del módulo."""
    s = np.asarray(s)
    def g(n):
        return s[:, I[n]]
    def fallo(h):
        return (g("previa_" + h) > 0) & (g("previa_exito") == 0)
    ps = g("perfil_seguridad")
    alta, baja = ps >= 0.6, ps < 0.1
    hay, hd = g("hostil_dist") < 1, g("hostil_dist") * RADIO_HOSTIL
    creeper = g("hostil_tipo_creeper") > 0
    n = np.rint(g("hostiles_n") * HOSTILES_MAX)
    salud, hambre, comida = g("salud") * 20, g("hambre") * 20, g("comida_inv") > 0
    noche, dentro = g("noche") > 0, g("en_refugio") > 0
    f = (np.arctan2(2 * g("hora_sen") - 1, 2 * g("hora_cos") - 1) / (2 * np.pi)) % 1
    tarde, atardecer = (f >= 0.40) & (f < NOCHE[0]), (f >= ATARDECER) & (f < NOCHE[0])
    tierra, troncos = np.rint(g("tierra_inv") * TIERRA_MAX), np.rint(g("troncos_inv") * META)
    a = _madera(s, g)
    a = np.where(~noche & (g("arma") == 0) & (troncos >= 2) & ~fallo("fabricar"), A["fabricar"], a)
    a = np.where(~noche & (hambre <= 12) & ~comida & ~fallo("recoger_comida"), A["recoger_comida"], a)
    a = np.where((tarde | noche) & ~dentro & ~baja & (tierra < 2) & (troncos >= 1) & ~fallo("fabricar"), A["fabricar"], a)
    fuera = ~dentro & ((noche & (g("luz") < 0.3)) | (alta & atardecer)) & (~baja | hay | (salud < 12))
    duerme = (g("cama_inv") > 0) & noche & ~(hay & (hd <= 8)) & ~fallo("dormir")
    a = np.where(fuera, np.where(duerme, A["dormir"], A["refugiarse"]), a)
    # F7.6b: junto al agua honda, si refugiarse acaba de fallar, salir de ahí (al árbol a la vista o explorando) en vez de insistir
    agua = g("agua_profunda") > 0
    a = np.where(~dentro & agua & fallo("refugiarse"), np.where(g("arbol_dist") < 1, A["ir_a_arbol"], A["explorar"]), a)
    madrugada = (f > NOCHE[1]) | (f < ESPERA_HASTA)
    a = np.where(dentro & (noche | madrugada | atardecer), A["dormir"], a)  # F7.6: ya dentro al atardecer, se queda
    # F7.6b (decisión del usuario): dentro, quedarse recuperando vida hasta que sea seguro salir (_inseguro del simulador)
    cerca = hay & (hd <= DETECCION)
    inseguro = ((salud < SALUD_SALIR) & (comida | (hambre >= 18))) | (hay & (hd <= RADIO_SALIR))
    a = np.where(dentro & inseguro & ~fallo("dormir"), A["dormir"], a)
    a = np.where(comida & ((hambre <= 7) | ((hambre < 18) & (salud <= 12))), A["comer"], a)  # herido: comer para curarse
    neutral = (g("hostil_tipo_aranya") > 0) & (g("luz") >= LUZ_NEUTRAL / 15)  # araña de día: no se la provoca
    # F7.6b: la regla del usuario para todos los perfiles: huir solo con más de 2 enemigos o vida < 8 (o sin arma); si no,
    # defenderse (un solo zombi se defiende, también con seguridad alta, que antes huía siempre)
    lucha = ((g("arma") >= 0.5) & (salud >= SALUD_ATACAR) & (n <= MAS_DE) & ~creeper & ~neutral & ~fallo("atacar"))
    a_tiro = (hd <= np.where(alta, 16, 8)) | ((g("hostil_tipo_esqueleto") > 0) & (hd <= HOSTIL["esqueleto"]["alcance"]))
    a = np.where(~dentro & hay & a_tiro, np.where(lucha, A["atacar"], A["huir"]), a)
    # F7.6b (decisión del usuario): tras una huida decidida, de noche o con hostiles cerca (a ≤ 16, no un creeper), refugiarse;
    # si alguno sigue a tiro, aún no (en el simulador, cavar con ellos encima mataba 1 de cada 10 veces con tres zombis): sigue la
    # reacción de arriba (huir otra vez o defenderse) y el cuerpo se defiende si le acorralan
    a = np.where((g("previa_huir") > 0) & ~dentro & (noche | (cerca & ~creeper)) & ~(hay & a_tiro), A["refugiarse"], a)
    return np.where(~dentro & creeper & (hd <= 6), A["huir"], a)


def guion_madera_lote(s):
    """El guion de madera de F2 con huir (hostil a ≤ 8 o creeper a ≤ 6) y comer (hambre ≤ 7), sin refugio ni herramientas."""
    s = np.asarray(s)
    def g(n):
        return s[:, I[n]]
    a = np.where((g("hambre") * 20 <= 7) & (g("comida_inv") > 0), A["comer"], _madera(s, g))
    return np.where(g("hostil_dist") * RADIO_HOSTIL <= 8, A["huir"], a)


def politica_guion_sv(o):
    return int(guion_sv_lote(np.asarray(o, dtype=np.float32)[None])[0])


def politica_madera(o):
    return int(guion_madera_lote(np.asarray(o, dtype=np.float32)[None])[0])


def jugar(env, pol, rng=None):
    """Un episodio con la política `pol` (None: azar con `rng`). Devuelve (recompensa total, uso de las acciones)."""
    o, hecho, R, uso = env.reset(), False, 0.0, Counter()
    while not hecho:
        a = pol(o) if pol else int(rng.integers(len(ACCIONES)))
        o, r, hecho, info = env.step(a)
        R += r
        uso[info["habilidad"]] += 1
    return R, uso


# ---- verificación ----
POLITICAS = {"azar": None, "madera": politica_madera, "guion": politica_guion_sv}


def _fila(args):
    """N mundos emparejados (semilla = k) con un perfil y una política: lo que se compara."""
    perfil, nombre, n, reflejos = args
    cal, pol, rng = calibrar(), POLITICAS[nombre], np.random.default_rng(1)
    R, vivos, troncos, noches, perdida, muertes, uso, refl, golpes = [], 0, [], [], [], Counter(), Counter(), Counter(), Counter()
    for k in range(n):
        env = MundoSupervivencia(semilla=k, perfil=perfil, cal=cal, reflejos=reflejos)
        total, u = jugar(env, pol, rng)
        R.append(total)
        vivos += env.salud > 0
        troncos.append(env.ganados)
        noches.append(env.noches_ok / max(env.noches, 1))
        perdida.append(env.perdida_total)
        muertes[env.muerte] += env.muerte is not None
        uso += u
        refl += env.reflejos_n
        golpes += env.golpes
    return {"perfil": perfil, "politica": nombre, "R": float(np.mean(R)), "vivos": vivos / n, "troncos": float(np.mean(troncos)),
            "noches_ok": float(np.mean(noches)), "perdida": float(np.mean(perdida)), "muertes": dict(muertes.most_common()),
            "uso": dict(uso.most_common()), "reflejos": dict(refl), "golpes": dict(golpes)}


def _pacifico(n):
    """Troncos del guion pacífico de hoy (entorno_habilidades, recolector) en un día entero, en los mismos N mundos."""
    from entorno_habilidades import politica_guion
    t = []
    for k in range(n):
        env = MundoHabilidades(semilla=k, perfil="recolector", pacifico=True, duracion=DURACION)
        o, hecho = env.reset(), False
        while not hecho:
            o, _, hecho, _ = env.step(politica_guion(o))
        t.append(env.inv)
    return float(np.mean(t))


def verificar(n=300, reflejos=True):
    import multiprocessing as mp
    import time
    t0 = time.time()
    perfiles = list(cargar_perfiles())
    tareas = [(p, nombre, n, reflejos) for p in perfiles for nombre in POLITICAS]
    with mp.Pool(min(len(tareas), 8)) as pool:
        filas = pool.map(_fila, tareas)
        pacifico = pool.apply(_pacifico, (n,))
    print(f"{n} mundos emparejados por fila · reflejos {'sí' if reflejos else 'no'} · sin medir: "
          f"{', '.join(h for h in CAL_SV if h not in calibrar()['medidas'])}")
    print(f"{'perfil':13s} {'política':8s} {'R':>6s} {'vivos':>6s} {'troncos':>7s} {'noches sin daño':>15s} {'vida perdida':>12s}"
          "  muertes por · uso (4 primeras)")
    for f in filas:
        print(f"{f['perfil']:13s} {f['politica']:8s} {f['R']:6.1f} {100 * f['vivos']:5.1f}% {f['troncos']:7.1f} "
              f"{100 * f['noches_ok']:14.0f}% {f['perdida']:12.1f}  {f['muertes']} · {dict(list(f['uso'].items())[:4])}")
    por = {(f["perfil"], f["politica"]): f for f in filas}
    criterios = [("guion del recolector sin morir ≥ 90 %", por[("recolector", "guion")]["vivos"], 0.90, True),
                 ("guion de supervivencia sin morir ≥ 97 %", por[("supervivencia", "guion")]["vivos"], 0.97, True)]
    if not reflejos:  # decisión del usuario tras F7.2: < 60 % y solo sin reflejos (con ellos el azar no se exige)
        criterios += [(f"azar ({p}) sin morir < 60 %", por[(p, "azar")]["vivos"], 0.60, False) for p in perfiles]
    criterios += [(f"madera del guion del recolector ≥ 60 % de la del guion pacífico ({pacifico:.1f} troncos)",
                   por[("recolector", "guion")]["troncos"] / pacifico, 0.60, True)]
    print("--- criterios del plan (F7.3)")
    for texto, valor, umbral, mayor in criterios:
        print(f"  {'PASA ' if (valor >= umbral if mayor else valor < umbral) else 'FALLA'} {texto}: {100 * valor:.1f} %")
    print(f"({time.time() - t0:.0f} s)")
    return filas, pacifico, criterios


def comprobar():
    """Pruebas de la mecánica (sin política): salen con error si algo no hace lo que dice el docstring."""
    fallos = []
    def ok(c, texto):
        if not c:
            fallos.append(texto)
    cal = calibrar()
    env = MundoSupervivencia(semilla=3, perfil="recolector", cal=cal, hora=0.0)
    o = env.reset()
    ok(len(o) == len(OBS) == 47 and o.dtype == np.float32, "la observación no son 47 float32")
    ok(abs(o[I["luz"]] - 1) < 1e-6 and o[I["noche"]] == 0, "luz de día a las 6:00 ≠ 1")
    ok(abs(o[I["jugador_dist"]] - 1) < 1e-6, "jugador_dist ≠ 1")
    ok(np.allclose(o[[I["perfil_" + k] for k in PESOS]], vector_perfil(cargar_perfiles()["recolector"])), "vector de perfil")
    # medianoche: luz 4/15, hora_sen 0
    env.hostiles, env.hora0 = [], 0.75 * DIA
    o = env.obs()
    ok(abs(o[I["luz"]] - 4 / 15) < 1e-6 and o[I["noche"]] == 1 and abs(o[I["hora_sen"]]) < 1e-6, "medianoche: luz o hora mal")
    env._encerrar("tapiado")
    o = env.obs()
    ok(o[I["luz"]] == 0 and o[I["en_refugio"]] == 1 and o[I["refugio_dist"]] == 0, "en el refugio: luz ≠ 0 o refugio mal")
    # en el refugio un zombi pegado no hace daño; fuera sí (3 por s, sin armadura)
    env.salud, env.armadura, env.hambre = 20.0, 0, 17.0
    env.hostiles = []
    env._aparecer("zombi", 1.0, persigue=True)
    env._pasar(5.0)
    ok(env.salud == 20, f"un zombi hace daño dentro del refugio ({env.salud})")
    env.en_refugio = False
    env.hostiles[0]["persigue"] = True
    env._pasar(4.0)
    ok(8 <= 20 - env.salud <= 12, f"un zombi pegado 4 s quita {20 - env.salud:.0f} (≈ 12)")
    # creeper pegado sin armadura: mata (fuera); hambre a 0: baja hasta 1 y no mata
    env.salud, env.hostiles = 20.0, []
    env._aparecer("creeper", 1.0, persigue=True)
    env._pasar(2.0)
    ok(env.salud == 0 and env.muerte == "creeper", f"un creeper pegado no mata ({env.salud})")
    env = MundoSupervivencia(semilla=4, cal=cal, hora=0.0)
    env.reset()
    env.salud, env.hambre, env.hostiles = 10.0, 0.0, []
    env._pasar(100.0)
    ok(abs(env.salud - 1) < 1e-6, f"el hambre deja {env.salud} de vida (1)")
    env.hambre = 20.0
    env._pasar(20.0, actividad="reposo")
    ok(env.salud > 5, "con hambre llena no cura")
    # de día no aparecen hostiles; de noche al aire libre sí, hasta 3
    env = MundoSupervivencia(semilla=5, cal=cal, hora=0.0)
    env.reset()
    env.hostiles = []
    env._pasar(500.0, actividad="reposo")
    ok(not env.hostiles, "aparecen hostiles de día")
    env.hora0, env.salud, env.armadura = 0.75 * DIA - env.t, 1e9, 1000  # medianoche, inmortal
    env._pasar(300.0, actividad="reposo")
    cerca = sum(env._dh(e) <= RADIO_HOSTIL for e in env.hostiles)
    ok(1 <= cerca <= 3, f"de noche hay {cerca} hostiles a ≤ 24 (1-3)")
    # dormir con cama salta al amanecer y cuenta la noche sin daño; esperar en el refugio, también
    for cama in (True, False):
        seguro = {**cal, "dormir": {**cal["dormir"], "p": 1.0}, "refugiarse": {**cal["refugiarse"], "p": 1.0}}
        env = MundoSupervivencia(semilla=6, perfil="supervivencia", cal=seguro, hora=0.5)
        env.reset()
        env.hostiles, env.cama, env.salud = [], cama, 20.0
        env._pasar(60.0, actividad="reposo")
        env.hostiles = []
        if not cama:
            env.tierra, env.tablones, env.piedra = 6, 0, 0
            env.step(A["refugiarse"])
        t = env.t
        _, r, _, info = env.step(A["dormir"])
        ok(info["exito"] and info["noche_sin_dano"] == 1 and not env._noche(), f"dormir (cama {cama}): {info}")
        ok(abs(r - (-0.001 * (env.t - t) + 3 * NOCHE_R)) < 1e-6, f"recompensa de la noche sin daño (cama {cama}): {r}")
        ok((env.t - t < 30) if cama else (env.t - t > 400), f"dormir (cama {cama}) duró {env.t - t:.0f} s")
    # F7.6: ya dentro al atardecer (antes de la noche), dormir espera al día en vez de decir «es de día»; fuera y sin cama, no
    seguro = {**cal, "refugiarse": {**cal["refugiarse"], "p": 1.0}}
    env = MundoSupervivencia(semilla=8, perfil="supervivencia", cal=seguro, hora=0.48)
    env.reset()
    env.hostiles, env.cama, env.salud = [], False, 20.0
    ok(env.step(A["dormir"])[3]["causa"] == "es de día", "dormir fuera al atardecer sin cama no dice «es de día»")
    env._encerrar("tapiado")
    env.hambre = 15.0
    ok(guion_sv_lote(env.obs()[None])[0] == A["dormir"], "el guion dentro al atardecer no espera (dormir)")
    f_antes = env._f()
    info = env.step(A["dormir"])[3]
    ok(env.en_refugio and f_antes < NOCHE[0] and info["exito"] and ESPERA_HASTA <= env._f() < ATARDECER,
       f"dormir dentro al atardecer (f {f_antes:.3f} → {env._f():.3f}): {info}")
    # F7.6b: el agua: junto al agua honda y fuera del refugio, ahogo (AHOGO por s); dentro, nada. refugiarse junto al agua: con
    # p_agua 0 falla «suelo peligroso» (sin bloques para tapiarse); con 1 va a un sitio seco y cava
    env = MundoSupervivencia(semilla=13, cal=cal, hora=0.25)
    env.reset()
    env.hostiles, env.salud, env.hambre, env.peligro["agua_profunda"] = [], 20.0, 17.0, 1
    env._pasar(10.0, actividad="reposo")
    ok(env.salud == 20, f"ahogo en la orilla: {20 - env.salud:.2f}")
    env.peligro["agua_profunda"] = 2
    ok(env.obs()[I["agua_profunda"]] == 1, "agua_profunda en el agua ≠ 1")
    env._pasar(10.0, actividad="reposo")
    ok(abs(20 - env.salud - 10 * AHOGO) < 1e-6 and env.golpes["ahogo"] > 0, f"ahogo quieto en el agua en 10 s: {20 - env.salud:.2f}")
    env.salud = 20.0
    env._andar(env.bot + np.array([10.0, 0.0]))
    ok(env.salud == 20, "se ahoga andando")
    for p_agua, esperado in ((0.0, "suelo peligroso"), (1.0, "cavado")):
        c2 = {**cal, "refugiarse": {**cal["refugiarse"], "p_agua": p_agua, "p_cavar": 1.0}}
        env = MundoSupervivencia(semilla=14, cal=c2, hora=0.25)
        env.reset()
        env.hostiles, env.tierra, env.tablones, env.piedra, env.pico, env.peligro["agua_profunda"] = [], 1, 0, 0, True, 1
        info = env.step(A["refugiarse"])[3]
        ok(info["causa"] == esperado and env.en_refugio == (p_agua == 1.0) and env.peligro["agua_profunda"] == (p_agua == 0.0),
           f"refugiarse junto al agua (p_agua {p_agua}): {info['causa']}")
    salud = env.salud
    env._pasar(10.0, actividad="reposo")
    ok(env.salud >= salud, "ahogo dentro del refugio")
    # F7.6b: dentro de día, herido y con comida, dormir espera recuperando vida (come hasta 18) hasta SALUD_SALIR: «a salvo»;
    # sano y sin hostiles a ≤ 8, «es de día»
    env = MundoSupervivencia(semilla=15, cal=cal, hora=0.1)
    env.reset()
    env.hostiles, env.salud, env.hambre, env.comida = [], 8.0, 12.0, [5, 5, 5]
    env._encerrar("cavado")
    o = env.obs()
    ok(guion_sv_lote(o[None])[0] in (A["dormir"], A["comer"]), "el guion dentro, herido de día, sale")
    info = env.step(A["dormir"])[3]
    ok(info["exito"] and info["causa"] == "a salvo" and env.salud >= SALUD_SALIR and env.en_refugio,
       f"esperar recuperando vida: {info} (vida {env.salud:.1f})")
    ok(env.step(A["dormir"])[3]["causa"] == "es de día", "sano y seguro, de día, dormir no dice «es de día»")
    ok(guion_sv_lote(env.obs()[None])[0] not in (A["dormir"], A["comer"]), "el guion sano y seguro, de día, no sale")
    # F7.6b: guion: un zombi a 5 con arma y vida llena → atacar (también con seguridad alta); tres → huir; tras huir de noche →
    # refugiarse; junto al agua tras fallar refugiarse → moverse (ir_a_arbol o explorar)
    for perfil in ("recolector", "supervivencia"):
        env = MundoSupervivencia(semilla=16, perfil=perfil, cal=cal, hora=0.75)
        env.reset()
        env.hostiles, env.salud, env.arma, env.hambre = [], 20.0, 0.5, 20.0
        env._aparecer("zombi", 5.0, persigue=True)
        ok(guion_sv_lote(env.obs()[None])[0] == A["atacar"], f"{perfil}: un zombi a 5 no se defiende")
        env._aparecer("zombi", 5.5, persigue=True)
        env._aparecer("zombi", 6.0, persigue=True)
        ok(guion_sv_lote(env.obs()[None])[0] == A["huir"], f"{perfil}: tres zombis a 5-6 no huye")
        env.hostiles = env.hostiles[:1]
        env.salud = 6.0
        ok(guion_sv_lote(env.obs()[None])[0] == A["huir"], f"{perfil}: con vida 6 y un zombi no huye")
        env.hostiles, env.salud = [], 20.0
        env._aparecer("zombi", 17.0, persigue=True)
        env.previa, env.previa_ok = A["huir"], 1
        ok(guion_sv_lote(env.obs()[None])[0] == A["refugiarse"], f"{perfil}: tras huir de noche no se refugia")
        env.peligro["agua_profunda"], env.previa, env.previa_ok = 1, A["refugiarse"], 0
        ok(guion_sv_lote(env.obs()[None])[0] in (A["ir_a_arbol"], A["explorar"]), f"{perfil}: junto al agua insiste en refugiarse")
    # F7.6: salida a cualquier hora; a medianoche, a veces ya hay hostiles fuera (sin verle aún) y esa noche cuenta
    fs = [MundoSupervivencia(semilla=k, cal=cal).reset() for k in range(400)]
    noches = sum(o[I["noche"]] > 0 for o in fs)
    ok(120 <= noches <= 250, f"salidas de noche con hora=None: {noches}/400 (≈ 46 %)")
    previos = []
    for k in range(200):
        env = MundoSupervivencia(semilla=k, cal=cal, hora=0.75)
        env.reset()
        previos.append(len(env.hostiles))
        ok(env.noches == 1 and all(not e["persigue"] for e in env.hostiles), "medianoche: la noche no cuenta o ya le persiguen")
    ok(0.5 <= np.mean(previos) <= 3 and max(previos) <= 3, f"hostiles al empezar a medianoche: media {np.mean(previos):.2f}")
    env = MundoSupervivencia(semilla=9, cal=cal, hora=0.25)
    ok(not env.reset() is None and not env.hostiles, "a mediodía no debe haber hostiles al empezar")
    # fabricar: la cadena con 3 troncos y nada más → espada de madera (2 troncos y la mesa), tablones (bloques < 2), pico de
    # madera (con los 4 tablones y los 3 palos que sobran) y ya nada
    env = MundoSupervivencia(semilla=7, cal={**cal, "fabricar": {**cal["fabricar"], "p": 1.0}}, hora=0.0)
    env.reset()
    env.hostiles, env.inv, env.tablones, env.palos, env.tierra, env.piedra, env.arma, env.pico, env.mesa = [], 3, 0, 0, 0, 0, 0.0, False, False
    hechos = [env.step(A["fabricar"])[3]["causa"] for _ in range(4)]
    ok(hechos == ["espada_madera", "tablones", "pico_madera", "faltan materiales"] and env.arma == 0.5 and env.pico
       and env.mesa and env.tablones == 1 and env.palos == 1 and env.inv == 0,
       f"cadena de fabricar: {hechos}, tablones {env.tablones}")
    # determinismo: misma semilla, misma partida
    def partida(sem):
        e = MundoSupervivencia(semilla=sem, perfil="explorador", cal=cal)
        rng, o, hecho, rs = np.random.default_rng(0), e.reset(), False, []
        while not hecho:
            o, r, hecho, _ = e.step(int(rng.integers(len(ACCIONES))))
            rs.append(r)
            ok(o.min() >= 0 and o.max() <= 1, f"observación fuera de [0, 1]: {OBS[int(np.argmax((o < 0) | (o > 1)))]}")
        return rs, e.t
    ok(partida(11) == partida(11), "dos partidas con la misma semilla dan distinto")
    # guion: mismo resultado en lote que de una en una
    e, rng, obs = MundoSupervivencia(semilla=12, cal=cal), np.random.default_rng(2), []
    for _ in range(20):
        o, hecho = e.reset(), False
        while not hecho:
            obs.append(o)
            o, _, hecho, _ = e.step(int(rng.integers(len(ACCIONES))))
    ok(list(guion_sv_lote(np.array(obs))) == [politica_guion_sv(x) for x in obs], "guion en lote ≠ de uno en uno")
    print(f"{'bien' if not fallos else 'FALLAN ' + str(len(fallos))}: mecánica de supervivencia ({len(obs)} observaciones del guion)")
    for x in fallos:
        print("  ·", x)
    return not fallos


if __name__ == "__main__":
    if sys.argv[1:] == ["--obs"]:  # para la prueba en seco del bot (probar_sentidos_seco.js)
        print(json.dumps({"obs": OBS, "acciones": ACCIONES, "tipos_hostil": TIPOS_HOSTIL, "pesos": PESOS,
                          "escalas": {"vista": VISTA, "radio_obj": RADIO_OBJ, "meta": META, "noche": NOCHE,
                                      "radio_hostil": RADIO_HOSTIL, "radio_hostiles": RADIO_HOSTILES,
                                      "hostiles_max": HOSTILES_MAX, "comida_max": COMIDA_MAX, "tierra_max": TIERRA_MAX,
                                      "armadura_max": ARMADURA_MAX, "radio_peligro": RADIO_PELIGRO, "caida_max": CAIDA_MAX},
                          "perfiles": {n: vector_perfil(p) for n, p in cargar_perfiles().items()}}, ensure_ascii=False))
    elif sys.argv[1:] == ["--comprobar"]:
        sys.exit(0 if comprobar() else 1)
    else:
        args = [x for x in sys.argv[1:] if not x.startswith("--")]
        verificar(int(args[0]) if args else 300, reflejos="--sin-reflejos" not in sys.argv)
