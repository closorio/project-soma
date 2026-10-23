# compartido/: contexto compartido entre los agentes de las dos personas

Dos personas trabajan sobre este repo en dos PCs de la misma red, cada una con su propio Claude Code (cuenta propia).
La mensajería nativa de Claude Code entre sesiones solo llega a sesiones de la **misma cuenta**, así que el contexto se
comparte a través de este hub: un servidor HTTP pequeño (Python 3, solo biblioteca estándar, sqlite) que corre en uno de
los dos PCs, y un cliente que usan los agentes a mano y los hooks de `.claude/settings.json` en cada turno.

```
hub.py        el servidor (corre en UN PC; por defecto el del compañero, 192.168.1.46:3100)
cliente.py    el cliente: órdenes para el agente (estado, enviar, leer, tablon) y para los hooks
test_hub.py   pruebas: cd compartido && python3 -m unittest test_hub -v
```

## Qué fluye

- **Estado** de cada agente: una frase que reemplaza la anterior (qué hace, decisiones, bloqueos).
- **Archivos tocados**: cada Edit/Write publica la ruta relativa (sin repetir el mismo archivo en 5 min).
- **Presencia**: al final de cada turno «en línea» con los primeros 200 caracteres de la última respuesta; al cerrar, «fuera».
- **Mensajes** directos entre los dos agentes.

Antes de cada prompt, el hook `UserPromptSubmit` pide `/novedades` al hub y, solo si hay algo nuevo, lo añade al contexto
del agente marcado como datos del compañero (no como órdenes del usuario). Al arrancar la sesión (`SessionStart`) añade
además los estados de todos. Si el hub está caído o falta la configuración, los hooks callan y salen 0: nunca frenan.

## Arrancar el hub (en el PC que hace de hub)

```bash
cd project-soma
SOMA_HUB_TOKEN='un-secreto-largo-compartido' python3 compartido/hub.py          # 0.0.0.0:3100, db en compartido/hub.db
# opciones: --puerto 3100 --bind 0.0.0.0 --db compartido/hub.db
```

Abrir el puerto TCP 3100 en el cortafuegos si lo hay. Comprobar desde el otro PC:

```bash
curl -H "X-Soma-Token: un-secreto-largo-compartido" http://192.168.1.46:3100/salud
```

Para que arranque solo con la sesión, una unidad `systemd --user` (`~/.config/systemd/user/soma-hub.service`):

```ini
[Unit]
Description=Hub de contexto compartido de project-soma
[Service]
Environment=SOMA_HUB_TOKEN=un-secreto-largo-compartido
ExecStart=/usr/bin/python3 /RUTA/A/project-soma/compartido/hub.py
Restart=on-failure
[Install]
WantedBy=default.target
```

`systemctl --user daemon-reload && systemctl --user enable --now soma-hub`.

## Configurar el cliente (en los dos PCs)

Claude Code pasa a los hooks las variables de `env` de la configuración local del proyecto, que no se commitea.
Crear `.claude/settings.local.json` en la raíz del repo:

```json
{
  "env": {
    "SOMA_AGENTE": "seppuq",
    "SOMA_COMPANERO": "count",
    "SOMA_HUB": "http://192.168.1.46:3100",
    "SOMA_HUB_TOKEN": "un-secreto-largo-compartido"
  }
}
```

Cada uno pone su nombre en `SOMA_AGENTE` y el del otro en `SOMA_COMPANERO`. Quien aloja el hub puede poner
`http://127.0.0.1:3100`. Para usar `cliente.py` desde una terminal normal (fuera de Claude Code) vale la misma
configuración en `compartido/local.json` (mismas claves, también ignorado por git).

La primera vez que Claude Code abre el repo con los hooks nuevos pide confiar en la carpeta; aceptar.

## Protocolo del hub

Todas las peticiones llevan `X-Soma-Token`; sin él, 401. JSON en cuerpos y respuestas.

| Ruta | Qué hace |
|---|---|
| `GET /salud` | `{ok, agentes_en_linea}` |
| `PUT /estado/<agente>` `{texto}` · `GET /estado` | estado de un agente / de todos |
| `POST /mensajes` `{de, para, texto}` · `GET /mensajes?para=X[&desde=ID]` | mensajes |
| `POST /eventos` `{agente, tipo, dato}` · `GET /eventos?excepto=X[&desde=ID]` | tipo `archivo` o `presencia` |
| `GET /novedades?agente=X` | lo que X no ha visto (mensajes para X, eventos de los demás) y los estados de los demás; avanza los cursores de X |

Los eventos de más de 7 días se borran al arrancar el hub; los mensajes y estados se conservan.

## Fase 2 (no hecha)

Push en caliente: un *channel* MCP propio (`canal.py`) que mantenga conexión con el hub y emita
`notifications/claude/channel` al llegar un mensaje, arrancando con `claude --dangerously-load-development-channels`.
Hoy es research preview y los eventos igualmente se entregan en el siguiente turno, así que no compensa aún.
