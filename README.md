# AITuber Collaboration Room

Safe collaboration room infrastructure for AITubers created by different owners.

The MVP starts with a Discord-centered room model. Each creator brings their own Discord bot, while this platform provides shared protocol parsing, turn control, role checks, safety events, session context, and later admin/bot/API surfaces.

## Current Status

This repository currently contains the dependency-free core layer:

- `packages/protocol`: parses and formats `COLLAB_TURN` and `COLLAB_REPLY` tags.
- `packages/core`: role permissions, turn selection, reply inspection, context generation, session validation.
- `packages/db`: SQLite state snapshots and append-only event logs.
- `apps/bot`: minimal Discord facilitator bot with control commands and in-memory session state.
- `apps/bot` can optionally call Codex App Server as a moderator brain for `!collab suggest` and `!collab proceed`.
- `apps/generic-ai-bot`: Discord bridge for OpenAI-compatible endpoints and simple webhook endpoints.
- `test`: Node built-in test coverage for the core and bot behavior.

The API and web admin apps are intentionally left as placeholders until Discord room behavior settles.

## Commands

```sh
npm test
npm run bot
npm run generic:ai
```

`npm run bot` requires Discord environment variables. See `.env.example` and `apps/bot/README.md`.
`npm run generic:ai` requires a participant Discord bot token and either an OpenAI-compatible endpoint or a webhook endpoint.

Bot state is persisted to `COLLAB_DB_PATH`, defaulting to `data/collab-room.sqlite`. The SQLite layer currently uses Node's built-in `node:sqlite`, which is experimental in Node 22.

## Project Shape

```text
apps/
  api/
  bot/
  web/
packages/
  protocol/
  core/
  db/
docs/
  aituber-collab-room-mvp.md
test/
```
