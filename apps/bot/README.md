# Discord Bot App

Minimal Discord facilitator bot for the MVP.

## Setup

Copy `.env.example` values into your runtime environment and set:

- `DISCORD_TOKEN`
- `DISCORD_GUILD_ID`
- `COLLAB_ROOM_CHANNEL_ID`
- `CONTROL_CHANNEL_ID`
- `LOG_CHANNEL_ID`
- `HOST_USER_IDS`
- `CO_HOST_USER_IDS`
- `AI_PARTICIPANTS`
- `COLLAB_DB_PATH`

The bot requires these Discord gateway intents:

- Guilds
- Guild Messages
- Message Content

It also needs permission to read and send messages in:

- `#collab-room`
- `#collab-control`
- `#collab-logs`

## Run

```sh
npm run bot
```

## Control Commands

Commands are read from the configured control channel.

```text
!collab status
!collab turn <ai_id> <question>
!collab next <question>
!collab suggest <instruction>
!collab proceed <instruction>
!collab audience <name>: <comment>
!collab loop start <ai_id> <ai_id> <turns> <topic>
!collab loop start <ai_id> <ai_id> until_end <topic>
!collab loop status
!collab loop stop
!collab mute <ai_id>
!collab unmute <ai_id>
!collab cancel <turn_id>
!collab pause
!collab resume
```

Only `HOST` and `CO_HOST` user IDs from env can issue turn, mute, cancel, pause, and resume commands.

`suggest` asks the configured moderator brain for a next-step recommendation and posts the suggestion only to the control channel.
`proceed` asks the moderator brain and, when it returns an eligible `issue_turn` decision, the bot issues the turn through the normal state machine.
`audience` injects a mock viewer comment for private livestream-style tests. The comment is posted to the room and included in later turn context.
`loop start` starts an automatic conversation loop. With a number, it stops after that many accepted replies. With `until_end`, it continues until a participant reply includes `[COLLAB_END]`, the safety limit is reached, or `loop stop` is used.

## Optional Codex Moderator

Set `CODEX_MODERATOR_ENABLED=1` to let `suggest` and `proceed` call `codex app-server` as the moderator brain.

The Codex moderator does not connect to Discord directly. It receives compact room state, returns a JSON decision, and the Discord bot keeps ownership of permissions, mute/pause checks, turn numbering, channel posting, and logs.

Relevant env vars:

- `CODEX_MODERATOR_ENABLED`
- `CODEX_APP_SERVER_COMMAND`
- `CODEX_MODERATOR_MODEL`
- `CODEX_MODERATOR_CWD`
- `CODEX_MODERATOR_TIMEOUT_MS`

## Current Runtime Limits

- State is saved to SQLite and restored on restart.
- Session/topic are loaded from environment variables at startup.
- Speaker selection is deterministic rule scoring.
- `suggest` and `proceed` can use Codex App Server when enabled; otherwise they fall back to deterministic rule scoring.
- Reply inspection is post-publication, as planned for the Discord MVP.
- SQLite uses Node's experimental `node:sqlite` API in this cycle.

Persisted state currently includes:

- Session and topic.
- Participant mute/pause state.
- Active turn.
- Next turn number.
- Recent messages and turns.
- Off-turn violation counts.
- Append-only bot/control/log events.
