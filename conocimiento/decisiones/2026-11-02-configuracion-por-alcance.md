---
tipo: decision
fecha: "2026-11-02"
autor: "seppuq"
estado: vigente
fases: [F8]
---
# Configuración por alcance: servidor, jugador y cliente

## Contexto
En el mundo compartido, `personajes.json` y `zonas.json` mezclaban lo que necesita el servidor (qué bots son de quién), lo de cada
jugador (sus zonas) y lo de cada cliente (cómo lanza sus bots), y chocaban en cada pull. Además `/connect` solo podía lanzar bots en
el PC del servidor. Completa [[2026-11-02-datos-de-mundo-en-copias-local]], que sigue valiendo para cofres, obras y diario.

## Decisión
- **Jugador** (en git, cada uno escribe solo el suyo): `mundos/<mundo>/jugadores/<jugador>.json` con `bots`, `zonas`, `arboles`,
  `base` y `lanzador` (`bot/plantel.js`). Los bots respetan vedadas, no talar y árboles de todos; las de trabajo, solo las de su
  dueño. `!zona` escribe en el propio; `make share WORLD=companero` lo sube.
- **Cliente** (sin versionar): `local.mk` (quién soy, base, `SOMA_LANZADOR_CLAVE`), `personajes.local.json` (puerto, estilo, modo de
  mis bots) y los `.local` de cofres, obras y diario.
- **Servidor**: `mundo.json` en git; en el PC del server, `plugins/SomaConnect/config.yml` con la ruta y las claves de lanzador.
- `/connect` lanza cada bot en el PC de su dueño: con `lanzador` y clave, el plugin se lo pide a `bot/lanzador.js` de ese PC
  (`make launcher-start`); sin ellos, `conectar.sh` en el server como siempre.
- Migración: `jugadores/seppuq.json` (Oqva, Soma, Iris; TALLER, CASASOMA, BOSQUE; lanzador 192.168.1.33:3150) y
  `jugadores/__Count.json` (Trivino, Nico, Lola, Teo; HOGAR), sacados de lo que había. `personajes.json` y `zonas.json` de companero
  salen de git.

## Para Count
1. Pull. Revisa `mundos/companero/jugadores/__Count.json` (tus bots y tu HOGAR): es tuyo; cámbialo si hace falta y `make share`.
   Tus bots se lanzan igual (puertos 3011-3014 por orden; otros, en `personajes.local.json`).
2. Pon `export IO_DUENOS = __Count` en tu `local.mk`.
3. Recompila el plugin (`plugin-connect/build.sh`), instálalo y añade a `plugins/SomaConnect/config.yml`
   `claves: { seppuq: "<la clave que te pase seppuq>" }`. Deja `/bo seppuq` para que pueda usar `/connect` con sus bots.

## Alternativas descartadas
- Que el server lance todos los bots: los de seppuq correrían con el código y la CPU de otro PC.
- Zonas locales de cada uno: los bots de uno no verían la base del otro.

## Consecuencias
La IP del lanzador es la de la wifi (DHCP): si cambia, hay que actualizar `lanzador` y hacer `make share`.
