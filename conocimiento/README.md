# conocimiento/: el vault del equipo

Vault de Obsidian dentro del repo. Guarda lo que debe durar: **roadmap, decisiones, experimentos de los modelos y
aprendizajes**. Lo inmediato (qué hace cada uno ahora, mensajes entre agentes) va por el hub de `compartido/`. La memoria
automática de cada Claude sigue siendo personal.

Git es la sincronización: no hace falta Obsidian Sync ni ningún plugin de la comunidad.

## Instalar y abrir (cada uno, en su PC)

```bash
flatpak install flathub md.obsidian.Obsidian     # o el AppImage de obsidian.md
```

Abrir Obsidian → «Abrir carpeta como vault» → `project-soma/conocimiento`. La primera vez:

1. Notas diarias (Ajustes → Plugins del núcleo → Notas diarias): carpeta `diario/<tu-nombre>`, plantilla
   `plantillas/diario`, formato `YYYY-MM-DD`. Este ajuste es personal y no viaja por git; así cada uno escribe en su
   carpeta y no hay conflictos.
2. Comprobar que las tres tablas de `Inicio.md` cargan (roadmap, experimentos, decisiones). Usan **Bases**, del núcleo
   desde Obsidian 1.9. Si una no carga en tu versión, avisa: el formato de los `.base` se ajusta.

## Uso diario

- Antes de ponerte: `git pull`. Al terminar una nota: commit y push de esa nota.
- **Nueva decisión, aprendizaje o fase**: Ctrl+P → «Plantillas: insertar plantilla» en una nota nueva de la carpeta que toque.
- **Experimento**: no a mano. Tras medir o entrenar:
  ```bash
  python3 conocimiento/herramientas/experimento.py entrenamiento/ejecutor_medido.json --titulo "Serie 3 con el trío"
  ```
  Escribe la nota con la tabla de métricas; tú rellenas «Conclusión» y `veredicto`. Entiende las series de
  `medir_ejecutor.py` y las comparaciones de `comparar_politicas.py`. `--dry-run` la enseña sin escribirla.
- La tabla «Sin conclusión» de `bases/experimentos.base` lista lo que falta interpretar.

## Qué hay

| Carpeta | Contenido | Regla |
|---|---|---|
| `roadmap/` | una nota por fase: `estado`, `responsable`, `siguiente` | se actualiza el frontmatter |
| `decisiones/` | contexto, decisión, alternativas, consecuencias | no se reescriben: se sustituyen |
| `experimentos/` | métricas de cada medida o entrenamiento | las genera `experimento.py` |
| `aprendizajes/` | una idea con su evidencia | atómicas |
| `diario/<persona>/` | nota diaria | cada uno la suya |
| `plantillas/`, `bases/` | plantillas y tablas | |
| `herramientas/` | `experimento.py`, `resumen.py` y sus pruebas | oculta en Obsidian |

`PLAN.md` y `PLAN_F7_supervivencia.md` siguen en la raíz con el detalle técnico; las notas del roadmap los resumen.

## Los agentes

Cada sesión de Claude recibe al arrancar un resumen del vault (`herramientas/resumen.py`, hook `SessionStart`), y
`CLAUDE.md` le dice cuándo escribir en cada carpeta. Escriben Markdown normal: no necesitan Obsidian abierto.

## Opcional: Obsidian Git

Si preferís no usar la terminal, el plugin de la comunidad «Git» hace pull al abrir y commit+push con un botón. Si lo
activáis, mejor sin commits automáticos por tiempo, para no mezclarlos con los de los agentes.

## Pruebas

```bash
cd conocimiento/herramientas && python3 -m unittest test_herramientas -v
```
