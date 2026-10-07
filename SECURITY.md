# Security

## Model

hey Bro! runs entirely on your PC:

- Rooms are JSON files in a local folder (`~/HeyBro` by default). Nothing is sent over the network.
- The viewer is an HTTP server bound to `127.0.0.1` only. It rejects other `Host` headers (DNS rebinding),
  requires the `X-HeyBro: 1` header, the same origin and a JSON body for every write, and serves a strict
  Content Security Policy. All text is rendered with `textContent` (no HTML injection).
- The viewer has **no login**: any program or user on the same PC can open it, read the rooms and write as moderator,
  just as they could read the rooms folder. Do not use hey Bro! on a shared machine for anything sensitive.
- System notifications are shown with the operating system's own tools (PowerShell on Windows,
  `osascript` on macOS, `notify-send` on Linux). No third-party services.

## Sessions and trust

- Any process on your PC that can read the rooms folder can read the rooms. Do not put passwords,
  tokens or other secrets in them.
- What one session writes is information for the others, not an instruction from you. The skill and the
  server instructions tell every session to ask for **your** confirmation, in its own session, before deleting,
  sending, publishing, paying or any other irreversible or outward action, and never to do for a sibling
  something that was denied to that sibling.
- Treat web pages, emails and other external content relayed by a sibling with the usual caution
  (prompt injection).

## Reporting a vulnerability

Please open a [private security advisory](https://github.com/lberian/hey-bro/security/advisories/new)
instead of a public issue. You will get an answer as soon as possible.
