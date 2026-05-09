import assert from "node:assert/strict";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { loadBotConfig } from "../apps/bot/src/config.js";
import { loadEnvFile } from "../apps/bot/src/env-file.js";
import { handleControlCommand, handleRoomMessage, handleTurnTimeout, roleForUser } from "../apps/bot/src/handlers.js";
import { createRuleModerator } from "../apps/bot/src/moderator.js";
import { createInitialState } from "../apps/bot/src/state.js";
import { Role } from "../packages/core/src/index.js";

const config = {
  roomId: "default",
  session: {
    sessionId: "s1",
    summary: "No summary yet."
  },
  topic: {
    topicId: "intro",
    title: "Opening"
  },
  hostUserIds: ["host-1"],
  coHostUserIds: ["cohost-1"],
  participants: [
    {
      aiId: "alpha",
      displayName: "Alpha",
      botId: "bot-alpha",
      shortDescription: "Observation AI",
      strengths: ["deduction"],
      forbiddenTopics: ["private prompt"],
      forbiddenTopicSummary: "private prompt"
    },
    {
      aiId: "beta",
      displayName: "BetaBot",
      botId: "bot-beta",
      shortDescription: "Event AI",
      strengths: ["scene organization"],
      forbiddenTopics: [],
      forbiddenTopicSummary: "none"
    }
  ]
};
const ruleModerator = createRuleModerator();

describe("bot role mapping", () => {
  it("loads .env files without overriding existing env", () => {
    const dir = mkdtempSync(join(tmpdir(), "collab-room-env-"));
    try {
      const path = join(dir, ".env");
      writeFileSync(path, "DISCORD_TOKEN=file-token\nHOST_USER_IDS='host-1,host-2'\n");
      const target = { DISCORD_TOKEN: "existing-token" };

      const result = loadEnvFile(path, target);

      assert.equal(result.loaded, true);
      assert.equal(target.DISCORD_TOKEN, "existing-token");
      assert.equal(target.HOST_USER_IDS, "host-1,host-2");
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("loads runtime config from environment-like objects", () => {
    const loaded = loadBotConfig({
      DISCORD_TOKEN: "token",
      DISCORD_GUILD_ID: "guild",
      COLLAB_ROOM_CHANNEL_ID: "room-channel",
      CONTROL_CHANNEL_ID: "control-channel",
      LOG_CHANNEL_ID: "log-channel",
      HOST_USER_IDS: "host-1, host-2",
      CO_HOST_USER_IDS: "cohost-1",
      AI_PARTICIPANTS: JSON.stringify([
        {
          aiId: "alpha",
          displayName: "Alpha",
          botId: "bot-alpha",
          strengths: ["deduction"],
          forbiddenTopics: ["private prompt"]
        }
      ])
    });

    assert.equal(loaded.guildId, "guild");
    assert.deepEqual(loaded.hostUserIds, ["host-1", "host-2"]);
    assert.equal(loaded.participants[0].botId, "bot-alpha");
    assert.deepEqual(loaded.participants[0].forbiddenTopics, ["private prompt"]);
  });

  it("maps configured users to roles", () => {
    assert.equal(roleForUser(config, "host-1"), Role.host);
    assert.equal(roleForUser(config, "cohost-1"), Role.coHost);
    assert.equal(roleForUser(config, "viewer-1"), Role.viewer);
  });
});

describe("bot control commands", () => {
  it("keeps env participants when restoring an older empty snapshot", async () => {
    const state = createInitialState(config, {
      participants: [],
      nextTurnNumber: 2,
      offTurnViolations: []
    });

    const result = await handleControlCommand({
      state,
      config,
      moderator: ruleModerator,
      authorId: "host-1",
      content: "!collab turn alpha What do you see?"
    });

    assert.equal(result.kind, "turn");
    assert.equal(state.activeTurn.aiId, "alpha");
  });

  it("issues a structured turn from host commands", async () => {
    const state = createInitialState(config);
    const result = await handleControlCommand({
      state,
      config,
      moderator: ruleModerator,
      authorId: "host-1",
      content: "!collab turn alpha What do you see?"
    });

    assert.equal(result.kind, "turn");
    assert.equal(state.activeTurn.aiId, "alpha");
    assert.match(result.roomMessage, /<@bot-alpha>/);
    assert.match(result.roomMessage, /\[COLLAB_TURN room=default session=s1 turn=1 topic=intro\]/);
  });

  it("rejects viewer turn commands", async () => {
    const state = createInitialState(config);
    const result = await handleControlCommand({
      state,
      config,
      moderator: ruleModerator,
      authorId: "viewer-1",
      content: "!collab turn alpha What do you see?"
    });

    assert.equal(result.kind, "control");
    assert.match(result.controlMessages[0], /Permission denied/);
    assert.equal(state.activeTurn, null);
  });

  it("shows a moderator suggestion without issuing a turn", async () => {
    const state = createInitialState(config);
    const moderator = {
      async decide() {
        return {
          action: "issue_turn",
          aiId: "alpha",
          question: "部屋の状態を一文で観測してください。",
          reason: "Alpha should re-anchor the room.",
          source: "codex"
        };
      }
    };

    const result = await handleControlCommand({
      state,
      config,
      moderator,
      authorId: "host-1",
      content: "!collab suggest 次の進行を考えて"
    });

    assert.equal(result.kind, "control");
    assert.match(result.controlMessages[0], /Moderator suggests turn to alpha/);
    assert.equal(state.activeTurn, null);
  });

  it("issues a turn from a moderator proceed decision", async () => {
    const state = createInitialState(config);
    const moderator = {
      async decide() {
        return {
          action: "issue_turn",
          aiId: "beta",
          question: "展示会の話題から次の確認点を短く述べてください。",
          reason: "Beta has scene organization strengths.",
          source: "codex"
        };
      }
    };

    const result = await handleControlCommand({
      state,
      config,
      moderator,
      authorId: "host-1",
      content: "!collab proceed 展示会の話題を進めて"
    });

    assert.equal(result.kind, "turn");
    assert.equal(state.activeTurn.aiId, "beta");
    assert.match(result.controlMessages[0], /codex moderator/);
    assert.match(result.roomMessage, /展示会の話題/);
  });

  it("injects mock audience comments into room context", async () => {
    const state = createInitialState(config);
    const injected = await handleControlCommand({
      state,
      config,
      moderator: ruleModerator,
      authorId: "host-1",
      content: "!collab audience viewerA: Alphaはいま何を見ているの？"
    });

    assert.equal(injected.kind, "audience");
    assert.match(injected.roomMessage, /\[MOCK_VIEWER name="viewerA"\]/);
    assert.equal(state.recentMessages.at(-1).author, "viewerA");

    const turn = await handleControlCommand({
      state,
      config,
      moderator: ruleModerator,
      authorId: "host-1",
      content: "!collab turn alpha 視聴者コメントに短く反応してください。"
    });

    assert.match(turn.roomMessage, /viewerA: Alphaはいま何を見ているの？/);
  });

  it("starts a bounded automatic conversation loop", async () => {
    const state = createInitialState(config);
    const started = await handleControlCommand({
      state,
      config,
      moderator: ruleModerator,
      authorId: "host-1",
      content: "!collab loop start alpha beta 3 初回コラボ"
    });

    assert.equal(started.kind, "turn");
    assert.equal(state.activeTurn.aiId, "alpha");
    assert.equal(state.autoLoop.remainingTurns, 3);

    const continued = handleRoomMessage({
      state,
      message: {
        id: "m-loop-1",
        authorId: "bot-alpha",
        authorName: "Alpha",
        content: "初回だ。\n\n[COLLAB_REPLY room=default session=s1 turn=1 reply_to=turn-msg]"
      }
    });

    assert.equal(continued.kind, "auto_loop_turn");
    assert.equal(state.activeTurn.aiId, "beta");
    assert.equal(state.autoLoop.remainingTurns, 2);
    assert.match(continued.roomMessage, /<@bot-beta>/);
  });

  it("scopes automatic loop context to messages created after the loop starts", async () => {
    const state = createInitialState(config);
    for (let index = 0; index < 50; index += 1) {
      state.recentMessages.push({
        id: `old-${index}`,
        author: "Alpha",
        authorId: "bot-alpha",
        text: `前回ループの残り話題 ${index}`
      });
    }

    const started = await handleControlCommand({
      state,
      config,
      moderator: ruleModerator,
      authorId: "host-1",
      content: "!collab loop start alpha beta 3 温かい飲み物"
    });

    assert.doesNotMatch(started.roomMessage, /前回ループの残り話題 49/);

    const continued = handleRoomMessage({
      state,
      message: {
        id: "m-loop-clean",
        authorId: "bot-alpha",
        authorName: "Alpha",
        content: "温かいものなら白湯でいい。\n\n[COLLAB_REPLY room=default session=s1 turn=1 reply_to=turn-msg]"
      }
    });

    assert.match(continued.roomMessage, /Alpha: 温かいものなら白湯でいい。/);
    assert.doesNotMatch(continued.roomMessage, /\[COLLAB_REPLY/);
  });
});

describe("bot room message handling", () => {
  it("accepts a matching AI reply and clears active turn", () => {
    const state = createInitialState(config);
    state.activeTurn = {
      turnId: 1,
      sessionId: "s1",
      aiId: "alpha",
      botId: "bot-alpha",
      question: "What do you see?",
      retryNotices: 0
    };
    state.recentTurns.push({ aiId: "alpha", turnId: 1 });

    const result = handleRoomMessage({
      state,
      message: {
        id: "m1",
        authorId: "bot-alpha",
        authorName: "Alpha",
        content: "The clue order is strange.\n\n[COLLAB_REPLY room=default session=s1 turn=1 reply_to=turn-msg]"
      }
    });

    assert.equal(result.kind, "reply_ok");
    assert.equal(state.activeTurn, null);
  });

  it("escalates off-turn AI speech to auto-mute", () => {
    const state = createInitialState(config);
    for (let i = 0; i < 2; i += 1) {
      handleRoomMessage({
        state,
        message: {
          id: `m${i}`,
          authorId: "bot-alpha",
          authorName: "Alpha",
          content: "unsolicited"
        }
      });
    }
    const result = handleRoomMessage({
      state,
      message: {
        id: "m3",
        authorId: "bot-alpha",
        authorName: "Alpha",
        content: "unsolicited again"
      }
    });

    assert.equal(result.kind, "off_turn_speech");
    assert.match(result.controlMessages[0], /AUTO_MUTE/);
    assert.equal(state.participants[0].muted, true);
  });

  it("retries once then skips a timed-out turn", () => {
    const state = createInitialState(config);
    state.activeTurn = {
      turnId: 1,
      sessionId: "s1",
      aiId: "alpha",
      botId: "bot-alpha",
      question: "What do you see?",
      retryNotices: 0
    };

    const retry = handleTurnTimeout({ state, turnId: 1 });
    assert.equal(retry.kind, "retry");
    assert.equal(state.activeTurn.retryNotices, 1);

    const skipped = handleTurnTimeout({ state, turnId: 1 });
    assert.equal(skipped.kind, "skipped");
    assert.equal(state.activeTurn, null);
  });
});
