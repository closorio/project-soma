---
tipo: aprendizaje
fecha: 2026-10-24
autor: seppuq
fuente: "medida en el PC de seppuq (GTX 1650 4 GB, 8 núcleos, torch 2.14.1+cu126, numpy 2.5.4, OPENBLAS 2 hilos)"
---
# CUDA frente a numpy en redes pequeñas

Con la receta de DAgger de F7.4 (lotes de 512, red de 64 de ancho), **la GPU no acelera nada**: numpy hace un paso en 0,6 ms y torch en CUDA en 1,1 ms, porque con tan pocos datos lo que cuesta es lanzar las operaciones, no calcularlas. CUDA solo gana con lotes grandes o con una red más ancha.

## Evidencia
Paso del aprendiz (entropía cruzada + Adam) en ms por lote; entre paréntesis, segundos por época sobre 1 446 162 estados (el agregado de `politica_supervivencia_dagger3.json`). En torch, el agregado entero vive en el dispositivo y no se cuenta la copia.

| red | lote | numpy | torch CPU | torch CUDA |
|---|---|---|---|---|
| F7 47→64→64→11 | 512 | **0,61 (1,7)** | 1,23 (3,5) | 1,12 (3,2) |
| F7 47→64→64→11 | 8192 | 8,2 (1,5) | 6,8 (1,2) | **1,1 (0,2)** |
| F8 57→64→64→17 | 512 | **0,60 (1,7)** | 1,09 (3,1) | 1,12 (3,2) |
| F8 57→64→64→17 | 2048 | 2,1 (1,5) | 2,5 (1,8) | **1,4 (1,0)** |
| F8 57→64→64→17 | 8192 | 9,9 (1,7) | 8,3 (1,5) | **1,3 (0,2)** |
| 57→256→256→17 | 512 | 3,3 (9,3) | 3,3 (9,3) | **1,1 (3,1)** |
| 57→256→256→17 | 8192 | 48 (8,5) | 41 (7,3) | **3,8 (0,7)** |

En la GPU el tiempo por lote apenas cambia entre 512 y 8192 (~1,1-1,3 ms): es un coste fijo por paso.

Además, el aprendiz no es lo que más tarda. DAgger3 entrenó en 267 s por semilla, y las épocas (20 + 7 × 8 sobre un agregado que crece) suman del orden de un minuto en numpy. El resto es jugar en el simulador, que va en CPU. Aunque la GPU fuera infinitamente rápida, el ahorro no llegaría a un cuarto del total.

## Qué hacer con ello
- En F8.G, con la red 57→64→64→17 y lotes de 512, el aprendiz se queda en numpy (`red_numpy.py`).
- La GPU solo vale la pena si (a) la red pasa a 256 de ancho o más (3× más rápida con lote 512) o (b) se suben los lotes a ≥ 2048. Con (b) cambia la receta: hay menos pasos por época y habría que reajustar el lr y volver a comprobar la fidelidad ≥ 95 %.
- Para acelerar de verdad el entrenamiento, hay que paralelizar la recogida en el simulador (más procesos evaluadores), no el aprendiz.
- Método: aprendiz copiado de `gradiente_ce` + `Adam` de `entrenar_supervivencia_dagger.py`, frente a `nn.Sequential` + `CrossEntropyLoss` + `Adam` de torch, 5 pasos de calentamiento, datos al azar del tamaño real y `torch.cuda.synchronize()` antes y después. torch se instaló aparte (`pip install --target … torch --index-url https://download.pytorch.org/whl/cu126`), no en `entrenamiento/.venv`.
