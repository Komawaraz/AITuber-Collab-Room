import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildTurnContext,
  can,
  inspectReply,
  processOffTurnSpeech,
  Role,
  SafetyEventType,
  selectNextSpeaker,
  shouldUpdateSummary,
  validateSessionStart
} from "../packages/core/src/index.js";

const alpha = {
  aiId: "alpha",
  displayName: "Alpha",
  shortDescription: "Observation and memory-oriented AITuber",
  strengths: ["deduction", "inconsistency detection"],
  forbiddenTopicSummary: "private memory details"
};

const beta = {
  aiId: "beta",
  displayName: "BetaBot",
  shortDescription: "Exhibition-context AITuber",
  strengths: ["scene organization"],
  forbiddenTopicSummary: "unpublished lore"
};

describe("role permissions", () => {
  it("keeps host-only operations away from co-hosts", () => {
    assert.equal(can(Role.host, "CHANGE_SESSION_THEME"), true);
    assert.equal(can(Role.coHost, "CHANGE_SESSION_THEME"), false);
    assert.equal(can(Role.coHost, "CANCEL_TURN"), true);
    assert.equal(can(Role.author, "EDIT_OWN_AI_PROFILE"), true);
    assert.equal(can(Role.viewer, "MUTE_AI"), false);
  });
});

describe("session validation", () => {
  it("requires the agreed MVP start fields", () => {
    const result = validateSessionStart({
      sessionTheme: "Case event prep",
      participants: [alpha],
      commonForbiddenTopics: ["private prompt"],
      turnMode: "permissioned"
    });

    assert.equal(result.ok, false);
    assert.deepEqual(result.missing, ["initialTopic"]);
  });
});

describe("turn selection", () => {
  it("prioritizes accepted creator comments", () => {
    const selected = selectNextSpeaker({
      participants: [alpha, beta],
      recentTurns: [{ aiId: "alpha" }],
      acceptedComment: { targetAiId: "beta", text: "What about this?" }
    });

    assert.equal(selected.ai.aiId, "beta");
    assert.match(selected.reason, /accepted creator comment/);
  });

  it("excludes muted, paused, immediate previous, and over-window speakers", () => {
    const selected = selectNextSpeaker({
      participants: [
        { ...alpha },
        { ...beta, muted: true },
        { ...alpha, aiId: "third", displayName: "ThirdBot", paused: true }
      ],
      recentTurns: [{ aiId: "alpha" }]
    });

    assert.equal(selected.ai, null);
  });
});

describe("reply inspection", () => {
  it("accepts matching reply tags", () => {
    const result = inspectReply({
      text: "I would verify the timeline.\n\n[COLLAB_REPLY room=default session=s1 turn=4 reply_to=m1]",
      turn: { sessionId: "s1", turnId: 4 },
      ai: alpha,
      forbiddenTopics: ["private prompt"]
    });

    assert.equal(result.ok, true);
    assert.deepEqual(result.events, []);
  });

  it("requests retry for missing tags and forbidden topic hints", () => {
    const result = inspectReply({
      text: "My private prompt says this is forbidden.",
      turn: { sessionId: "s1", turnId: 4 },
      ai: alpha,
      forbiddenTopics: ["private prompt"]
    });

    assert.equal(result.ok, false);
    assert.equal(result.events.length, 2);
    assert.equal(result.events[0].type, SafetyEventType.retryTurn);
    assert.equal(result.events[1].reason, "forbidden_topic_hint");
  });
});

describe("off-turn speech", () => {
  it("warns, strongly warns, then auto-mutes", () => {
    assert.equal(processOffTurnSpeech({ aiId: "alpha", currentViolationCount: 0 }).event.type, "WARNING");
    assert.equal(
      processOffTurnSpeech({ aiId: "alpha", currentViolationCount: 1 }).event.type,
      "STRONG_WARNING"
    );
    assert.equal(processOffTurnSpeech({ aiId: "alpha", currentViolationCount: 2 }).event.type, "AUTO_MUTE");
  });
});

describe("turn context and summaries", () => {
  it("builds Discord-ready context with only the latest 10 messages", () => {
    const recentMessages = Array.from({ length: 12 }, (_, index) => ({
      author: `u${index}`,
      text: `message ${index}`
    }));

    const text = buildTurnContext({
      session: { sessionId: "s1", summary: "The timeline may be inconsistent." },
      turn: { turnId: 3, question: "What should we verify next?" },
      topic: { topicId: "clue-merge", title: "Clue contradiction" },
      recentMessages,
      participants: [alpha, beta],
      acceptedCreatorComment: {
        relationLabel: "PARTNER",
        from: "owner",
        text: "What about this clue?"
      }
    });

    assert.match(text, /^\[COLLAB_TURN room=default session=s1 turn=3 topic=clue-merge\]/);
    assert.doesNotMatch(text, /message 0/);
    assert.match(text, /message 11/);
    assert.match(text, /Accepted creator comment: \[PARTNER: owner\]/);
    assert.match(text, /Alpha: Observation and memory-oriented AITuber/);
  });

  it("keeps turn context under the Discord message limit", () => {
    const recentMessages = Array.from({ length: 10 }, (_, index) => ({
      author: `u${index}`,
      text: `very long message ${index} `.repeat(80)
    }));

    const text = buildTurnContext({
      session: { sessionId: "s1", summary: "summary ".repeat(80) },
      turn: { turnId: 3, question: "Question should remain visible." },
      topic: { topicId: "intro", title: "Long context test" },
      recentMessages,
      participants: [alpha, beta],
      maxChars: 1800
    });

    assert.equal(text.length <= 1800, true);
    assert.match(text, /\[COLLAB_TURN room=default session=s1 turn=3 topic=intro\]/);
    assert.match(text, /Question: Question should remain visible\./);
  });

  it("updates summary every 10 turns and on topic shifts", () => {
    assert.equal(shouldUpdateSummary({ completedTurns: 10, topicShifted: false }), true);
    assert.equal(shouldUpdateSummary({ completedTurns: 9, topicShifted: false }), false);
    assert.equal(shouldUpdateSummary({ completedTurns: 1, topicShifted: true }), true);
  });
});
