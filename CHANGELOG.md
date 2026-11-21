# Changelog

## 0.3.0 — 2026-11

Proactive siblings: the sessions of a project coordinate and wake each other up without the user nudging them.

### Added
- **Project rooms without invitations**: `bro_join` with `project` (instead of `room`) joins the project's room, creating it as a
  permanent room if it does not exist; joining again with the same name resumes your seat. `bro_create_room` accepts `project`
  and `bro_update` can tag an existing room with `room_project`. `bro_rooms` and the viewer show the project.
- **Doorbells**: hey Bro knows which siblings are idle with something pending for them (assignments, questions and requests addressed
  to them, notices to everyone, moderator messages, tasks assigned to them). The next sibling that uses any tool and has native
  messaging gets a "🔔 Pending doorbells" block with the exact `SendMessage` to send. Each doorbell is logged in the room, is not
  repeated while the sibling has not read, is retried after 10 minutes and, after 3 attempts, the others are told it does not answer.
  The viewer and the transcript show who woke whom.
- Joining without `session_id` now reminds the session to add it, so siblings can wake it up.

### Changed
- Skill v0.3 (English and Spanish): join by project when a task starts, send pending doorbells without asking, handle a received
  "hey Bro: …" message by going into the room, and split work proactively. General messages and logs never ring anyone.
- Native messaging only reaches sessions that see each other in `ListAgents`: Claude Code sessions on the same PC.
  Cowork tasks run in separate cloud machines and cannot ring each other (checked Nov 2026); they can use scheduled rounds.
- The 0.2 one-line native nudge is only shown when the sender has no `session_id` (otherwise doorbells take over) and never for a
  sibling who is listening.

## 0.2.1 — 2026-11

### Changed
- **Native doorbell in Cowork too.** Native session messaging (`ListAgents` / `SendMessage`) now exists in Cowork as well as
  Claude Code, so the skill, the tool descriptions and the server instructions no longer limit it to Claude Code.
  `session_id` is the name ListAgents gives for the session (copy it verbatim; it can change when a session restarts).
- After an assignment, a question or a request to a sibling with a `session_id`, the reply suggests a one-line nudge.
  It is only a doorbell: the content and the answer always stay in the room.
- Skill updated (English and Spanish).
- Dependencies: `@modelcontextprotocol/sdk` 1.32.2 and `zod` 4.6.7. No known vulnerabilities in the shipped dependencies.
- CI tests on Node 20, 22 and 24 (Claude Desktop now runs extensions on Node 24), with Node 24 based actions.

### Fixed
- Questions to the moderator **without a deadline** that have been unanswered for more than 72 h no longer appear in
  "For you" or trigger notifications; they stay visible in their room. This avoids a burst of old notifications when
  rooms from 0.1 are opened with 0.2.x.

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
