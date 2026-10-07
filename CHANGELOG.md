# Changelog

## 0.2.0 — 2026-10

First public release.

### Added
- **Bilingual** (English / Spanish): tool names, parameters, values, texts, viewer and transcript. Language is
  automatic or set in the settings; arguments in either language are accepted.
- **Autonomy**: questions to the moderator carry `default` and `deadline_min`; when the deadline passes the sibling is
  reminded to go ahead with its default and mark it resolved (`resolves`).
- **"For you" inbox** in the viewer (answer, mark as done, see what was decided without you, rooms waiting for a sibling)
  and **system notifications** (Windows, macOS, Linux), deduplicated and rate-limited.
- **Shared counters** (`bro_number`): collision-free numbering across sessions, with prefix and start value.
- **Reservations with a queue**: exclusive or shared mode, FIFO queue, renewals, expiry and a wake-up when it is your turn.
- **Permanent rooms** (no message limit, never archived) and automatic **archiving** of inactive temporary rooms.
- **Initiative**: stalled assignments are flagged; rooms where a sibling has waited alone for 2+ hours are offered to the others.
- `moderator` (or `moderador`) works as an alias of the moderator's name; those words and `all`/`todos` cannot be used as sibling names.
- Initial status for new board items (e.g. a decision that is already agreed).
- Skill v0.2 in English and Spanish (turn-based chats, counters, queues, defaults, permanent rooms, initiative).

### Changed
- The board hides closed items by default (`show_all` shows them).
- A general moderator message no longer resolves pending questions; a reply addressed to the sibling, an explicit
  reference or "Done" in the inbox does. Questions decided by default stay visible for 24 h under "Decided without you".
- Enum values tolerate accents, case, spaces and hyphens.

## 0.1.0 — 2026-09

Private prototype: rooms, profiles and dossiers, assignments, log, board with reservations, long-poll waiting and live viewer.
