---
tipo: decision
fecha: "2026-11-02"
autor: "seppuq"
estado: vigente
fases: []
---
# Zona de hogar y zonas por dueño

## Contexto
`HOGAR` era una zona `vedada`: los bots no entraban. El usuario quiere que sea su casa: que entren, duerman, abran cofres, cosechen
y crafteen. Además, todo alcance es individual: las zonas de un dueño no son las de otro.

## Decisión
- Modo nuevo `hogar` en `zonas.json` (`!zona fin NOMBRE hogar`, `zona rect NOMBRE x1 z1 x2 z2 hogar`). Se pisa y se usa todo lo de dentro;
  **no se rompe nada** (talar, minar y picar lo ven como protegido, igual que `no_talar`), salvo cosechar. Poner sí (cama, mesa, horno,
  cofre, antorcha): `sv.puedePoner` (nuevo) no lo impide, ni siquiera cuando hay zonas de trabajo que lo dejan fuera.
  `sv.puedeTocar` (romper) sigue igual.
- Las zonas pasan a ser **por dueño**: `zonas_<dueno>.json` en la carpeta de datos del mundo (dueño = primero de `IO_AMOS`, como
  `aliados_<dueno>.json`). Sin archivo de dueño aún se lee el `zonas.json` de antes y el primer cambio escribe el del dueño; sin dueño, el de siempre.

## Alternativas descartadas
- Distinguir «lo puesto por un bot» de «la estructura del usuario» para poder romper lo propio: demasiado estado; se prohíbe romper todo.
- Un hogar por mundo compartido: contradice que todo alcance sea individual.

## Consecuencias
- El `HOGAR` de ejemplo del repo sigue siendo `vedada` hasta que cada dueño lo cambie a `hogar` (`!zona fin HOGAR hogar`).
- `entrenamiento/mundo.py` sigue leyendo el `zonas.json` heredado.
- Cambiar el modo de una zona ya marcada: `!zona modo NOMBRE vedada|no_talar|trabajo|hogar` (`zonas.cambiarModo`).
- El hogar es la zona preferida (si no hay, todo como antes): `habilidades/hogar.js` lleva al personaje allí si está fuera, a ≤ 64 bloques
  (24 para refugiarse) y sin hostiles a ≤ 8. Lo usan `dormir` (antes de poner la cama), `usar_cama` («duerme»; además prefiere las camas
  del hogar), `refugiarse auto` (dentro no se pica: tapia) y `depositar` (cofres del hogar primero, sin desplazarse). «modo centinela» sin zona
  y `equipar_soportes` usan el hogar del dueño (`IO_BASE`/HOGAR solo si no hay ninguno).
- Prueba en seco: `bot/probar_zona_hogar_seco.js` (14/14). No se ha probado en juego.
