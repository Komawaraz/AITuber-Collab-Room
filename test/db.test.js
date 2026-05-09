import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { openSqliteStore } from "../packages/db/src/sqlite.js";
import { createInitialState } from "../apps/bot/src/state.js";

const config = {
  roomId: "default",
  session: {
    sessionId: "s1",
    summary: "Persistent summary."
  },
  topic: {
    topicId: "intro",
    title: "Opening"
  },
  participants: [
    {
      aiId: "alpha",
      displayName: "Alpha",
      botId: "bot-alpha",
      shortDescription: "Observation AI",
      strengths: ["deduction"],
      forbiddenTopics: ["private prompt"],
      forbiddenTopicSummary: "private prompt"
    }
  ]
};

describe("sqlite store", () => {
  it("persists and restores state snapshots", () => {
    const dir = mkdtempSync(join(tmpdir(), "collab-room-db-"));
    const dbPath = join(dir, "state.sqlite");

    try {
      const store = openSqliteStore(dbPath);
      const state = createInitialState(config);
      state.nextTurnNumber = 8;
      state.participants[0].muted = true;
      state.offTurnViolations.set("alpha", 2);
      state.autoLoop = {
        enabled: true,
        participantIds: ["alpha", "guest"],
        remainingTurns: 2,
        topic: "test loop"
      };
      state.recentMessages.push({
        id: "m1",
        author: "Alpha",
        authorId: "bot-alpha",
        text: "unsolicited"
      });

      store.saveStateSnapshot(state);
      store.close();

      const reopened = openSqliteStore(dbPath);
      const restored = createInitialState(config, reopened.loadStateSnapshot());

      assert.equal(restored.nextTurnNumber, 8);
      assert.equal(restored.participants[0].muted, true);
      assert.equal(restored.offTurnViolations.get("alpha"), 2);
      assert.equal(restored.autoLoop.remainingTurns, 2);
      assert.equal(restored.recentMessages[0].text, "unsolicited");
      reopened.close();
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it("appends queryable event logs", () => {
    const store = openSqliteStore(":memory:");
    const id = store.appendEvent({
      sessionId: "s1",
      type: "turn",
      source: "control",
      payload: { text: "Issued turn 1 to alpha." },
      createdAt: "2026-05-07T00:00:00.000Z"
    });

    const events = store.listEvents({ sessionId: "s1" });

    assert.equal(id, 1);
    assert.equal(events.length, 1);
    assert.equal(events[0].type, "turn");
    assert.deepEqual(events[0].payload, { text: "Issued turn 1 to alpha." });
    store.close();
  });
});
