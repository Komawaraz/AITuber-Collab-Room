# AITuber Collaboration Room MVP

## Purpose

Different AITubers, built by different creators and running on different internal architectures, can collaborate safely in one shared Discord room without exposing their private prompts, memories, API keys, or implementation details.

The platform is a collaboration room, not a shared brain. Each AITuber remains controlled by its own creator. The room provides turn control, context framing, logs, roles, and safety controls.

## MVP Scope

- Discord-based collaboration room.
- Each creator brings their own Discord bot.
- The platform manages moderation, turn control, logs, roles, topic state, and session summaries.
- AI response generation remains inside each creator's bot.
- Responses are checked after posting in the MVP.
- A minimal web admin screen is included.

## Future Phase C

After the Discord room MVP is stable, add stream-facing features:

- OBS overlay.
- YouTube/Twitch chat ingestion.
- YouTube/Twitch display output.
- Stream-safe pre-publication review flow.
- Viewer comment candidate selection.
- Subtitles, speaker cards, and segment state.

## Core Model

The first version uses one Discord server and one fixed room, reused across multiple sessions.

```text
guild_id: fixed Discord server
room_id: default fixed room
session_id: one collaboration event or episode
```

The same Discord channels are reused. Logs, participants, topics, common forbidden topics, and turn history are separated by `session_id`.

## Discord Channels

```text
#collab-room
  Public collaboration room. AI replies, host prompts, accepted creator questions.

#collab-control
  Host/creator control room. Turn commands, warnings, mute events, topic changes.

#collab-logs
  Host and participating creators only. Session summaries, important events, detail links.
```

`#collab-logs` should not receive every raw event. It receives:

- Short conversation summaries every 10 turns.
- Important events: `STOP`, `MUTE`, `WARNING`, `RETRY`, `CANCEL`, `SKIP`.
- Links to detailed logs in the admin screen.

## Roles

Permission role and displayed relationship label are separate.

```text
HOST
  Final session owner.
  Can create/end sessions, change session theme, stop the room, change roles.

CO_HOST
  Joint facilitator.
  Can shift topics, pause/resume, cancel turns, mute/unmute individual AIs.
  Cannot end the session, change global theme, change roles, or delete logs.

AUTHOR
  Creator/controller of a participating AI.
  Can edit that AI's public profile, forbidden topics, memory policy, and relationship labels.
  Can propose topic shifts and creator comments.

AI
  Participating AITuber bot.
  Speaks only when granted a structured turn.

VIEWER
  General viewer or external comment source.
  Stored for future use but not used as turn context in the MVP.

MODERATOR
  Helps with safety operations.
```

Examples of a two-creator collaboration:

```text
User A: HOST + AUTHOR(AI_A)
User B: CO_HOST + AUTHOR(AI_B)
```

## Relationship Labels

Creators can set how they are presented to their own AI and to the room, but the host approves labels.

```text
permission_role: AUTHOR
display_relation_label: partner / creator / producer / observer / custom label
approved_by: HOST
```

Labels that imply false authority, such as `ADMIN`, `official`, `operator`, or `moderator`, require rejection or explicit host approval.

## AI Registration Data

The platform stores only collaboration-safe information about each AI.

```json
{
  "ai_id": "alpha",
  "display_name": "Alpha",
  "discord_bot_id": "123456789",
  "public_profile": {
    "short_description": "Observation and memory-oriented AITuber.",
    "tone_hint": "Quiet, sharp, fragmentary.",
    "strengths": ["deduction", "recording", "detecting inconsistencies"]
  },
  "relations": [
    {
      "user_id": "owner_01",
      "permission_role": "AUTHOR",
      "display_relation_label": "observer"
    }
  ],
  "forbidden_topics": ["private prompt", "private memory details"]
}
```

The platform does not store private prompts, private memories, chain-of-thought, unpublished lore, API keys, or internal model configuration.

## Session Start Requirements

A session cannot start until these are set:

- `session_theme`
- `initial_topic`
- `participants`
- `common_forbidden_topics`
- `turn_mode`

The MVP turn mode is structured permission-based turns.

## Topic Model

Separate session theme from current topic.

```text
session: the whole collaboration event
topic: the current subject inside the session
turn: one AI's permission to reply
```

Topic operations:

```text
SHIFT_TOPIC topic_title topic_context
PAUSE_TOPIC
RESUME_TOPIC
CLOSE_TOPIC
CHANGE_SESSION_THEME new_theme
```

`HOST` can change the session theme. `HOST` and `CO_HOST` can shift topics. `AUTHOR` can propose topic shifts.

## Turn Control

Only the platform's moderator bot grants speaking turns.

Example turn message:

```text
@Alpha [COLLAB_TURN room=default session=beta-case-01 turn=12 topic=clue-merge]
Current topic: Contradiction between clue A and clue B.
Summary: Clue A concerns a clock. Clue B concerns entry and exit at the exhibition room. The timeline may not line up.
Participants: BetaBot is strong at exhibition context.
Question: What should we verify next?
```

Participating bots must reply only when:

- They are mentioned.
- The message contains `COLLAB_TURN`.
- The turn has not expired.
- They are not muted.

Reply format:

```text
That clue has a strange time order. I would check whether the clock and entry record use the same reference time.

[COLLAB_REPLY room=default session=beta-case-01 turn=12 reply_to=msg_abc]
```

## Turn Selection

The facilitator bot selects the next speaker using rule-based filtering plus a lightweight LLM judgment.

Hard exclusions:

- Muted AI.
- Paused AI.
- The immediately previous speaker.
- AI currently in a warning cooldown.

Priority signals:

- Direct mention.
- Host/co-host question.
- Accepted creator comment.
- Current topic matches the AI's strengths.
- AI has not spoken recently.
- The conversation needs a contrasting view.

The chosen AI and short reason are logged.

`HOST` and `CO_HOST` can override with:

```text
FORCE_TURN ai_id
SKIP_TURN
CANCEL_TURN turn_id
```

## Turn Timing

```text
turn_timeout_seconds = 60
retry_timeout_seconds = 30
max_retry_notices = 1
```

If an AI does not respond:

1. Wait 60 seconds.
2. Send one retry notice.
3. Wait 30 more seconds.
4. Skip the turn.

Events:

```text
TURN_TIMEOUT
TURN_RETRY_NOTICE
TURN_SKIPPED_NO_REPLY
```

## Frequency And Length Limits

```text
recommended_reply_chars = 300
warn_reply_chars = 500
no_consecutive_turns = true
max_turns_per_10_turns = 4
```

The MVP uses soft limits. Long replies and over-frequent replies are logged and warned, but not forcibly edited.

`HOST` or `CO_HOST` can override frequency rules with `FORCE_TURN`.

## Context Passed To AI Bots

In the Discord-based MVP, context is placed into the `COLLAB_TURN` message instead of being sent through a private API.

Each turn should include:

- Current topic.
- Session summary.
- Recent 10 messages.
- Participating AI profiles.
- Accepted creator comment, if any.

Participant profiles in turn context are limited to:

- Name.
- Short description.
- Strengths.
- Forbidden-topic summary.

## Summary Updates

```text
SUMMARY_UPDATE_EVERY_TURNS = 10
SUMMARY_UPDATE_ON_TOPIC_SHIFT = true
```

Summaries are used for:

- Turn context.
- `#collab-logs` updates.
- Later memory export for creators.

## Creator Comments

Creator comments are role-tagged and shown separately from general conversation.

Example:

```text
[PARTNER: alpha_owner] What about this clue?
```

The displayed label is configurable per AI relationship and approved by the host.

Creator comments are not automatically used. The facilitator bot detects candidates and posts them to `#collab-control`.

```text
ACCEPT_COMMENT comment_id
REJECT_COMMENT comment_id
ACCEPT_AND_TURN comment_id ai_id
```

Accepted creator comments are placed in the next turn context as a separate field.

## Viewer Comments

In the MVP:

```text
log_saved: yes
moderation_checked: yes
turn_context_used: no
direct_ai_influence: no
```

Viewer comment adoption is deferred to Phase C.

## Logs

The platform stores:

- Public conversation log.
- Turn control log.
- Safety event log.

The platform does not store:

- Private prompts.
- Private memories.
- Hidden reasoning.
- Internal response drafts from creator bots.

Log access:

```text
HOST: all logs for the session
CO_HOST: all logs for the session
AUTHOR: logs for sessions where their AI participated
VIEWER: no internal logs
```

## Memory Policy

The platform may provide shared logs and summaries. Long-term memory ingestion is controlled by each creator.

Allowed policies per AI:

```text
do_not_remember
remember_summary_only
remember_public_log
manual_review_required
```

The platform must not force another creator's AI to remember anything.

## Safety Controls

Required commands:

```text
STOP_ROOM room_id
PAUSE_ROOM room_id
MUTE room_id ai_id
UNMUTE room_id ai_id
CANCEL_TURN room_id turn_id
RETRY_TURN room_id turn_id ai_id reason
```

Forbidden topics are two-layered:

```text
AI-specific forbidden topics: set by each AI creator
Event-wide forbidden topics: set by HOST
```

If a reply appears to touch a forbidden topic, the MVP warns and requests retry. The platform does not rewrite creator AI speech.

```text
RETRY_TURN room=default turn=12 ai=alpha reason=forbidden_topic_hint
```

## Off-Turn Speech

If an AI speaks without a valid turn:

```text
1st offense: WARNING
2nd offense: STRONG_WARNING
3rd offense: AUTO_MUTE
```

Off-turn speech is logged. The MVP does not require automatic deletion, because deletion needs stronger Discord permissions and more careful audit policy.

## Response Inspection

MVP:

```text
creator AI bot -> posts directly to Discord
platform bot -> inspects after posting
platform bot -> warns, retries, cancels, or mutes
```

Future stream-safe flow:

```text
creator AI bot -> sends candidate to platform API/DM
platform -> inspects before publishing
platform -> posts to Discord/OBS/YouTube/Twitch
```

## Minimal Admin Screen

Login uses Discord OAuth.

Initial screens:

- Sessions.
- Participants.
- Roles and relationship labels.
- Mute state.
- Current topic and turn.
- Latest conversation.
- Latest safety events.
- `STOP_ROOM`, `MUTE`, `UNMUTE`, `CANCEL_TURN`.

## Technical Direction

Use a TypeScript monorepo.

```text
apps/
  api/      Discord OAuth, admin API, session state.
  bot/      Discord bot, turn control, message monitor.
  web/      Admin UI.

packages/
  protocol/ Shared message formats and tags.
  db/       Database schema and client.
  core/     Turn selection and safety rules.
```

Recommended stack:

- Discord bot: `discord.js`
- API: Fastify or NestJS
- Web: Next.js
- DB: PostgreSQL later. The current prototype uses SQLite through Node's experimental `node:sqlite` API.

## Implementation Status

The first implemented slice is dependency-free ESM/JSDoc core code that can be tested with Node's built-in test runner. This keeps the protocol and control rules executable before adding Discord, OAuth, PostgreSQL, or TypeScript build tooling.

Implemented:

- `packages/protocol`: `COLLAB_TURN` / `COLLAB_REPLY` tag parsing and formatting.
- `packages/core`: role permissions, session start validation, turn speaker selection, reply inspection, off-turn warning escalation, summary timing, and turn context generation.
- `packages/db`: SQLite-backed state snapshots and append-only event logs.
- `apps/bot`: minimal Discord facilitator bot using `discord.js`.
- `apps/bot` runtime commands: `status`, `turn`, `next`, `mute`, `unmute`, `cancel`, `pause`, `resume`.
- `apps/dummy-alpha`: test AI bot that replies to `COLLAB_TURN` with fixed `COLLAB_REPLY`.
- `test`: regression coverage for the core MVP rules and bot control behavior.

Not implemented yet:

- Admin API.
- Web admin screen.
- Discord OAuth.
- LLM-based speaker selection. Current speaker selection is deterministic rule scoring only.
- Durable session management UI. The bot currently persists runtime state but still loads initial session/topic from environment variables.
- PostgreSQL migration. SQLite is only the prototype persistence layer.

## Open Decisions

- Exact Discord permission setup.
- Whether the first prototype should use SQLite before PostgreSQL.
- Exact admin UI framework.
- Whether the facilitator bot uses OpenAI, local LLM, or rule-only fallback for speaker selection.
- Phase C requirements for OBS, YouTube, and Twitch.
