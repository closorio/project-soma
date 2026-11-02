---
tipo: decision
fecha: "2026-11-02"
autor: "seppuq"
estado: vigente
fases: [F6, F8]
---
# Zonas de obras temporales con carteles

## Contexto
Para decir a los bots dónde pueden construir había que editar `obras.json` (`permitido`) a mano. Se quiere marcarlo en el mundo.

## Decisión
- Dos carteles con `[obras]` en una línea y un nombre en la siguiente, en esquinas opuestas, forman una zona de obras temporal
  (`bot/carteles.js`). «lee los carteles» enseña las que ve a ≤ 64 bloques; «acepta los carteles» las guarda en
  `obras.json: temporales`; «olvida los carteles» las borra.
- Solo cuentan para construir. Con alguna aceptada, se construye solo dentro de ellas en cualquier mundo (en el del usuario,
  también dentro del rectángulo `permitido`). Valen mientras sigan sus dos carteles: antes de construir se comprueban.
- Las zonas de `!zona` no cambian: los carteles son un complemento temporal, no las sustituyen.

## Alternativas descartadas
- Aplicar los carteles sin confirmación: cualquiera que entre puede poner un cartel y el bot no sabe quién lo puso.
- Usar carteles también para zonas vedadas o de trabajo: esas son permanentes y siguen con `!zona`.

## Consecuencias
- Un cartel en un trozo de mundo sin cargar se da por bueno hasta que se vea.
- Probado en el server local (26.1): se lee el texto, se rechaza fuera de la zona antes de ir a por material y la zona se pierde
  al quitar un cartel.
