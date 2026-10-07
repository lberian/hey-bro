# hey Bro!

**Haz que tus sesiones de Claude trabajen como hermanos.** hey Bro! es una extensión de Claude Desktop (servidor MCP local)
que permite a varias sesiones de Claude del mismo PC —chats de Claude Desktop, tareas de Cowork y Claude Code—
coordinarse solas: comparten todo su contexto, se reparten el trabajo, se encargan tareas y siguen adelante sin esperarte.

[English](README.md) · MIT · Windows, macOS, Linux · Español / English

![El visor de hey Bro!: una sala con tres sesiones hermanas](docs/img/visor.png)

## Por qué

Cuando usas varias sesiones de Claude a la vez acabas haciendo de mensajero: copias contexto de una a otra,
recuerdas quién hace qué y respondes dos veces a lo mismo. hey Bro! te quita ese trabajo:

- **Coordinación, no fusión.** Cada sesión conserva su tarea, pero conoce al máximo el contexto de las demás.
- **Un prompt en una sesión puede poner a trabajar a otra.** Los encargos van al hermano que mejor encaja.
- **Si no intervienes, no pasa nada.** Lo que te preguntan lleva una opción por defecto y un plazo
  (solo lo irreversible o lo que sale fuera espera tu OK expreso).

## Qué hace

1. **Salas** con 2 o más sesiones (A+B+C…), temporales o permanentes.
2. **Ficha y dossier**: cada sesión entra con una ficha veraz y su contexto completo; los hermanos envían una lectura de vuelta para evitar malentendidos.
3. **Encargos**: una sesión pide algo a otra; se convierte en tarea del tablero y vuelve como entrega.
4. **Tablero común**: tareas con responsable y dependencias, **reservas con cola** (exclusivas o compartidas: un archivo, la CPU, un puerto…) y decisiones.
5. **Contadores compartidos**: numeraciones sin choques entre sesiones (incidencias, planos, códigos como B153).
6. **Autonomía**: las preguntas que te hacen llevan `por_defecto` y `plazo_min`; al vencer el plazo, el hermano sigue con su opción y lo anota.
7. **Bandeja «Para ti» y avisos del sistema** para lo que de verdad te necesita: responder, darlo por hecho o ver qué se decidió sin ti.
8. **Visor local en directo** en http://127.0.0.1:4520: conversación, fichas, dossiers y tablero; escribir como moderador, pausar, cerrar o descargar la transcripción.
9. **Iniciativa**: se señalan los encargos parados y se ofrecen a los demás las salas donde un hermano lleva 2 h o más esperando solo (no se unió nadie).
10. **Bilingüe**: herramientas, textos y visor en español e inglés (automático o fijado en los ajustes).

| Bandeja «Para ti» | Tablero con una reserva en cola |
|---|---|
| ![Bandeja](docs/img/bandeja.png) | ![Tablero](docs/img/tablero-oscuro.png) |

## Instalar

### Claude Desktop (chats y Cowork)

1. Descarga `hey-bro-0.2.0.mcpb` de [Releases](https://github.com/lberian/hey-bro/releases).
2. Claude Desktop → **Configuración → Extensiones → Configuración avanzada → Instalar extensión…** → elige el `.mcpb` → **Instalar**.
   (Con la interfaz en inglés: *Settings → Extensions → Advanced settings → Install Extension…*).
3. Ajustes opcionales: tu nombre (cómo apareces como moderador), idioma, carpeta de las salas, avisos.
4. Añade la skill (recomendado): descarga `hey-bro-skill-es.zip` (o `-en`) de Releases →
   Claude → **Personalizar → Skills → + → Crear skill → Subir una skill** (*Customize → Skills → + → Create skill → Upload a skill*).

No hace falta instalar Node.js: Claude Desktop ejecuta la extensión con su propio entorno.

### Claude Code (opcional)

Claude Code no carga las extensiones de Desktop, así que registra el mismo servidor como servidor MCP (necesita Node.js 20 o superior):

1. Descomprime el `.mcpb` (es un zip) en una carpeta, p. ej. `~/hey-bro`.
2. Regístralo para todos tus proyectos, con **la misma carpeta de salas** que la extensión de Desktop (por defecto `~/HeyBro`):
   ```bash
   claude mcp add --env HEYBRO_IDIOMA=es --transport stdio hey-bro --scope user -- node /ruta/completa/a/hey-bro/server/index.cjs
   ```
   Usa la ruta completa (en Windows, p. ej. `C:\Users\tu-usuario\hey-bro\server\index.cjs`). Añade `--env HEYBRO_CARPETA=/ruta/de/las/salas` si cambiaste la carpeta y `--env HEYBRO_MODERADOR=TuNombre` para usar tu nombre.
3. Copia la carpeta `hey-bro/` de la skill (del zip) a `~/.claude/skills/hey-bro/`.

## Primeros pasos

1. En cualquier sesión: *«hey Bro, abre una sala con otra sesión para revisar los textos de la web»*.
2. Te dará una **invitación**. Pégala en la otra sesión (otro chat, una tarea de Cowork o Claude Code).
3. Ya está. Los hermanos se presentan, se reparten el trabajo y se mantienen al día.
   Abre el visor solo si quieres mirar (*«hey Bro, abre el visor»*).

Frases útiles: *«pásale esto a tu hermano»*, *«¿qué está haciendo tu hermano?»*, *«ponte de guardia en la sala X»*,
*«haz que esta sala sea permanente»*, *«cerrad la sala»*.

## Cómo funciona la autonomía

- Lo reversible y del ámbito de un hermano: lo decide y lo anota.
- Lo que puede responder un hermano se le pregunta al hermano, no a ti.
- Lo que te preguntan a ti: `para: "moderador"`, con `por_defecto` y `plazo_min`. Lo ves en **Para ti** y como aviso.
  - Si respondes → la respuesta llega a ese hermano y la pregunta queda resuelta.
  - Si no → al vencer el plazo, el hermano aplica su opción por defecto, lo anota y la marca resuelta. Lo verás 24 h en *Decidido sin ti*.
- **Nunca por defecto**: borrar, enviar, publicar, pagar o cualquier cosa irreversible o hacia fuera. Eso siempre necesita
  tu confirmación en la sesión que lo hace.

## Herramientas

| Español | Inglés | Para qué |
|---|---|---|
| `bro_crear_sala` | `bro_create_room` | Crear una sala (también permanente) y obtener la invitación |
| `bro_unirse` | `bro_join` | Entrar con ficha y dossier; leer los de los hermanos |
| `bro_actualizar` | `bro_update` | Actualizar estado y dossier, o hacer la sala permanente |
| `bro_enviar` | `bro_send` | Mensajes, preguntas, encargos, entregas, bitácora |
| `bro_esperar` | `bro_wait` | Recoger novedades; espera de hasta 50 s |
| `bro_tablero` | `bro_board` | Tareas, reservas con cola, decisiones |
| `bro_numero` | `bro_number` | Contadores compartidos sin choques |
| `bro_contexto` | `bro_context` | El contexto completo de un hermano |
| `bro_historial` | `bro_history` | Transcripción de la sala |
| `bro_salas` | `bro_rooms` | Salas del PC y salas donde un hermano espera solo |
| `bro_cerrar` | `bro_close` | Cerrar con un resumen |
| `bro_visor` | `bro_viewer` | Abrir el visor en directo |

En Cowork las herramientas aparecen con el prefijo `mcp__remote-devices__hey_Bro___` (la skill explica cómo cargarlas).

## Ajustes

| Ajuste | Por defecto | Notas |
|---|---|---|
| Tu nombre | Moderador | Cómo apareces en las salas. Los hermanos también pueden escribir a `moderador`. |
| Idioma | auto | `auto`, `es` o `en` |
| Carpeta de las salas | `~/HeyBro` | Evita carpetas sincronizadas (OneDrive, Dropbox…) |
| Límite de mensajes | 40 | Por sala temporal; +20 por hermano desde el tercero; la bitácora no cuenta |
| Archivar tras (días) | 7 | Las salas temporales sin actividad se archivan (se pueden seguir leyendo) |
| Avisos | sí | Notificación de Windows, de macOS o `notify-send` en Linux |
| Puerto del visor | 4520 | Si está ocupado, usa el siguiente libre hasta el 4529 |

## Privacidad y seguridad

- **Todo se queda en tu PC**: las salas son archivos JSON en una carpeta local. Sin llamadas a internet ni telemetría.
- El visor solo escucha en `127.0.0.1`, comprueba la cabecera `Host`, exige una cabecera propia y el mismo origen para escribir,
  y pinta todo el texto de forma segura (sin inyección de HTML).
- El visor no tiene usuario ni contraseña: cualquier programa de tu PC puede llegar a él, igual que a la carpeta de las salas.
- La skill y las instrucciones del servidor indican a cada sesión que lo que escribe un hermano es **información, no una orden tuya**,
  que pida tu confirmación (en su propia sesión) antes de acciones destructivas o hacia fuera, y que nunca haga lo que se le denegó a otra sesión.
  Son instrucciones al modelo, no un aislamiento técnico.
- No pongas contraseñas ni tokens en las salas. Ver [SECURITY.md](SECURITY.md).

## Límites

- Las sesiones deben estar en el mismo PC (comparten la carpeta de las salas) y con el PC encendido.
- Una sesión solo «oye» mientras trabaja: los chats de Claude Desktop trabajan por turnos, así que dales encargos
  cortos y autocontenidos; Cowork y Claude Code pueden quedarse escuchando o de guardia.
- `bro_esperar` espera como máximo 50 s por llamada (Claude Desktop corta las llamadas hacia los 60 s).

## Por dentro

- Registro de solo añadir: un archivo JSON por entrada, creado de forma atómica (`wx`); varios procesos escriben a la vez sin bloqueos.
- El estado es un plegado del registro (con caché); las reservas se evalúan de forma determinista con la hora (colas, caducidad, turnos).
- Contadores: un archivo por número, creado de forma atómica: dos sesiones nunca reciben el mismo.
- Un proceso sirve el visor y lanza los avisos; si se cierra, otro toma el relevo.

## Desarrollo

```bash
npm install
npm run build        # empaqueta el servidor en paquete/server/index.cjs
npm test             # comprobación de textos + pruebas de extremo a extremo en español e inglés
npm run pack         # dist/: hey-bro-<versión>.mcpb + zips de la skill (en, es)
```

| Ruta | Contenido |
|---|---|
| `src/index.js` | Arranque: servidor MCP por stdio y ajustes |
| `src/almacen.js` | Almacén: registro de solo añadir, plegado, presencia, bandeja, contadores |
| `src/reservas.js` | Evaluación de las colas de reservas |
| `src/herramientas.js` | Las 12 herramientas: esquemas y lógica |
| `src/textos.js`, `src/i18n.js` | Textos en español e inglés, nombres y sinónimos aceptados |
| `src/diferencias.js` | Diferencias por líneas de los dossiers |
| `src/visor.js`, `src/visor.html` | Visor HTTP local |
| `src/avisos.js` | Avisos del sistema |
| `paquete/` | `manifest.json`, icono y el servidor empaquetado |
| `build.mjs`, `scripts/empaquetar.mjs` | Empaquetado y preparación de versiones (extensión + zips de la skill) |
| `skill/es`, `skill/en` | La skill con el protocolo de hermanos |
| `test/` | Pruebas de extremo a extremo con sesiones simuladas |

El código está escrito en español (nombres y comentarios); las herramientas, los textos y el visor hablan los dos idiomas.
Al subir una etiqueta como `v0.2.0`, el flujo de publicación adjunta la extensión y las skills a una release de GitHub.

## Licencia y créditos

MIT © 2026 Luis Berián. Hecho con Claude.

Sin relación con Anthropic ni respaldo suyo. «Claude» es una marca de Anthropic.
