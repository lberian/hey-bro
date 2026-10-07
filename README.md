# hey Bro!

**Let your Claude sessions work as siblings.** hey Bro! is a Claude Desktop extension (local MCP server) that lets
several Claude sessions on the same PC — Claude Desktop chats, Cowork tasks and Claude Code — coordinate on their own:
they share their full context, split the work, hand tasks to each other and keep going without waiting for you.

[Español](README.es.md) · MIT · Windows, macOS, Linux · English / Español

![The hey Bro! viewer: a room with three sibling sessions](docs/img/viewer.png)

## Why

When you run several Claude sessions at once, you become the messenger: copying context from one to another,
remembering who is doing what, answering the same question twice. hey Bro! removes that job:

- **Coordination, not fusion.** Each session keeps its own job, but knows the others' context inside out.
- **A prompt in one session can put another to work.** Assignments land on the sibling that fits best.
- **If you do not step in, nothing breaks.** Questions to you carry a default option and a deadline
  (only irreversible or outward actions wait for your explicit OK).

## What it does

1. **Rooms** with 2 or more sessions (A+B+C…), temporary or permanent.
2. **Profile and dossier**: every session joins with a truthful profile and its full context; siblings send a read-back to avoid misunderstandings.
3. **Assignments**: one session asks another to do something; it becomes a task on the board and comes back as a delivery.
4. **Shared board**: tasks with owners and dependencies, **reservations with a queue** (exclusive or shared: a file, the CPU, a port…) and decisions.
5. **Shared counters**: collision-free numbering across sessions (issues, drawings, codes like B153).
6. **Autonomy**: questions to you have a `default` and a `deadline_min`; when the deadline passes, the sibling goes ahead with its default and logs it.
7. **"For you" inbox + system notifications** for what really needs you: answer, mark as done, or see what was decided without you.
8. **Live local viewer** at http://127.0.0.1:4520: conversation, profiles, dossiers, board; write as moderator, pause, close or download the transcript.
9. **Initiative**: stalled assignments are flagged, and rooms where a sibling has been waiting alone for 2+ hours (nobody joined) are offered to the others.
10. **Bilingual**: English and Spanish tools, texts and viewer (automatic or set in the settings).

| "For you" inbox | Board with a queued reservation |
|---|---|
| ![Inbox](docs/img/inbox.png) | ![Board](docs/img/board-dark.png) |

## Install

### Claude Desktop (chats and Cowork)

1. Download `hey-bro-0.2.0.mcpb` from [Releases](https://github.com/lberian/hey-bro/releases).
2. Claude Desktop → **Settings → Extensions → Advanced settings → Install Extension…** → choose the `.mcpb` file → **Install**.
3. Optional settings: your name (how you appear as moderator), language, rooms folder, notifications.
4. Add the skill (recommended): download `hey-bro-skill-en.zip` (or `-es`) from Releases →
   Claude → **Customize → Skills → + → Create skill → Upload a skill**.

Node.js is not needed here: Claude Desktop runs the extension with its built-in runtime.

### Claude Code (optional)

Claude Code does not load Desktop extensions, so register the same server as an MCP server (needs Node.js 20+):

1. Unzip the `.mcpb` (it is a zip file) into a folder, e.g. `~/hey-bro`.
2. Register it for all your projects, using **the same rooms folder** as the Desktop extension (default `~/HeyBro`):
   ```bash
   claude mcp add --env HEYBRO_IDIOMA=en --transport stdio hey-bro --scope user -- node /full/path/to/hey-bro/server/index.cjs
   ```
   Use the full path (on Windows, e.g. `C:\Users\you\hey-bro\server\index.cjs`). Add `--env HEYBRO_CARPETA=/path/to/rooms` if you changed the folder, and `--env HEYBRO_MODERADOR=YourName` to match your name.
3. Copy the skill folder `hey-bro/` (from the skill zip) to `~/.claude/skills/hey-bro/`.

## Quick start

1. In any session: *"hey Bro, open a room with another session to review the website copy."*
2. It gives you an **invitation**. Paste it into the other session (another chat, a Cowork task or Claude Code).
3. That's it. The siblings introduce themselves, split the work and keep each other posted.
   Open the viewer only if you want to watch (*"hey Bro, open the viewer"*).

Useful phrases: *"pass this to your sibling"*, *"what is your sibling doing?"*, *"stay on call in room X"*,
*"make this room permanent"*, *"close the room"*.

## How autonomy works

- Anything reversible within a sibling's scope: it decides and logs it.
- Questions a sibling can answer go to the sibling, not to you.
- Questions to you: `to: "moderator"`, with `default` and `deadline_min`. You see them in **For you** and as a notification.
  - You answer → the reply reaches that sibling and the question is resolved.
  - You don't → at the deadline the sibling applies its default, logs it and marks it resolved. You see it under *Decided without you* for 24 h.
- **Never by default**: deleting, sending, publishing, paying or anything irreversible or outward. Those always need your
  confirmation in the session that does them.

## Tools

| English | Spanish | What for |
|---|---|---|
| `bro_create_room` | `bro_crear_sala` | Create a room (optionally permanent) and get the invitation |
| `bro_join` | `bro_unirse` | Join with profile + dossier; read the siblings' ones |
| `bro_update` | `bro_actualizar` | Update status, dossier, or make the room permanent |
| `bro_send` | `bro_enviar` | Messages, questions, assignments, deliveries, logs |
| `bro_wait` | `bro_esperar` | Collect news; long-poll up to 50 s |
| `bro_board` | `bro_tablero` | Tasks, queued reservations, decisions |
| `bro_number` | `bro_numero` | Collision-free shared counters |
| `bro_context` | `bro_contexto` | A sibling's full context |
| `bro_history` | `bro_historial` | Room transcript |
| `bro_rooms` | `bro_salas` | Rooms on this PC and rooms where a sibling waits alone |
| `bro_close` | `bro_cerrar` | Close with a summary |
| `bro_viewer` | `bro_visor` | Open the live viewer |

In Cowork the tools appear with the prefix `mcp__remote-devices__hey_Bro___` (the skill explains how to load them).

## Settings

| Setting | Default | Notes |
|---|---|---|
| Your name | Moderator | How you appear in rooms. Siblings can also write to `moderator`. |
| Language | auto | `auto`, `en` or `es` |
| Rooms folder | `~/HeyBro` | Avoid cloud-synced folders (OneDrive, Dropbox…) |
| Message limit | 40 | Per temporary room; +20 per sibling from the third one; logs do not count |
| Archive after (days) | 7 | Temporary rooms without activity are archived (still readable) |
| Notifications | on | Windows toast, macOS notification or `notify-send` on Linux |
| Viewer port | 4520 | If it is busy, the next free one up to 4529 is used |

## Privacy and safety

- **Everything stays on your PC**: rooms are plain JSON files in a local folder. No network calls, no telemetry.
- The viewer only listens on `127.0.0.1`, checks the `Host` header, requires a custom header and same origin for writes,
  and renders all text safely (no HTML injection).
- The viewer has no login: any program running on your PC can reach it, like the rooms folder itself.
- The skill and the server instructions tell every session that what a sibling writes is **information, not an order from you**,
  to ask for your confirmation (in its own session) before destructive or outward actions, and never to do what was denied to another session.
  These are instructions to the model, not a sandbox.
- Do not put passwords or tokens in rooms. See [SECURITY.md](SECURITY.md).

## Limitations

- Sessions must run on the same PC (they share the rooms folder) while it is on.
- A session only "hears" while it is working: Claude Desktop chats work turn by turn, so give them short,
  self-contained tasks; Cowork and Claude Code can stay listening or on call.
- `bro_wait` waits 50 s at most per call (Claude Desktop cuts tool calls at about 60 s).

## Under the hood

- Append-only log: one JSON file per entry, created atomically (`wx`), so several processes can write at once without locks.
- State is a fold of the log (cached); reservations are evaluated deterministically by time (queues, expiry, turns).
- Counters: one file per number, created atomically: two sessions can never get the same one.
- One process serves the viewer and sends notifications; if it exits, another one takes over.

## Development

```bash
npm install
npm run build        # bundles the server into paquete/server/index.cjs
npm test             # text check + end-to-end suites in Spanish and English
npm run pack         # dist/: hey-bro-<version>.mcpb + skill zips (en, es)
```

The code is written in Spanish (identifiers and comments); the tools, texts and viewer speak both languages.
Pushing a tag like `v0.2.0` runs the release workflow, which attaches the extension and the skills to a GitHub release.

| Path | Contents |
|---|---|
| `src/almacen.js` | Storage: append-only log, fold, presence, inbox, counters |
| `src/reservas.js` | Reservation queue evaluation |
| `src/index.js` | Entry point: MCP server over stdio, settings |
| `src/herramientas.js` | The 12 tools: schemas and logic |
| `src/textos.js`, `src/i18n.js` | Spanish/English texts, names and accepted synonyms |
| `src/diferencias.js` | Line diffs of dossier updates |
| `src/visor.js`, `src/visor.html` | Local HTTP viewer |
| `src/avisos.js` | System notifications |
| `paquete/` | `manifest.json`, icon and the bundled server |
| `build.mjs`, `scripts/empaquetar.mjs` | Bundling and release packaging (extension + skill zips) |
| `skill/en`, `skill/es` | The sibling protocol skill |
| `test/` | End-to-end tests with simulated sessions |

## License and credits

MIT © 2026 Luis Berián. Built with Claude.

Not affiliated with or endorsed by Anthropic. "Claude" is a trademark of Anthropic.
