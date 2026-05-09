import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildModeratorPrompt, parseModeratorDecision } from "../apps/bot/src/moderator.js";
import { createInitialState } from "../apps/bot/src/state.js";

const config = {
  roomId: "default",
  session: { sessionId: "s1", summary: "No summary yet." },
  topic: { topicId: "intro", title: "Opening" },
  participants: [
    {
      aiId: "alpha",
      displayName: "Alpha",
      botId: "bot-alpha",
      shortDescription: "Observation AI",
      strengths: ["deduction"],
      muted: false,
      paused: false
    },
    {
      aiId: "beta",
      displayName: "Beta",
      botId: "bot-beta",
      shortDescription: "Event AI",
      strengths: ["scene organization"],
      muted: false,
      paused: false
    }
  ]
};

describe("moderator prompt and decisions", () => {
  it("builds a JSON-only Codex moderator prompt from room state", () => {
    const state = createInitialState(config);
    const prompt = buildModeratorPrompt({ state, instruction: "展示会の話題を進めて" });

    assert.match(prompt, /Return only compact JSON/);
    assert.match(prompt, /展示会の話題を進めて/);
    assert.match(prompt, /"aiId":"alpha"/);
  });

  it("accepts a valid Codex issue_turn decision", () => {
    const state = createInitialState(config);
    const decision = parseModeratorDecision(
      '{"action":"issue_turn","aiId":"alpha","question":"今の部屋を短く観測してください。","reason":"Alpha should observe."}',
      state
    );

    assert.deepEqual(decision, {
      action: "issue_turn",
      aiId: "alpha",
      question: "今の部屋を短く観測してください。",
      reason: "Alpha should observe.",
      source: "codex"
    });
  });

  it("falls back when Codex selects a muted participant", () => {
    const state = createInitialState(config);
    state.participants[0].muted = true;

    const decision = parseModeratorDecision(
      '{"action":"issue_turn","aiId":"alpha","question":"Muted target","reason":"Bad target"}',
      state
    );

    assert.equal(decision.action, "issue_turn");
    assert.equal(decision.aiId, "beta");
    assert.match(decision.reason, /unavailable participant/);
  });

  it("returns no_turn when the room already has an active turn", () => {
    const state = createInitialState(config);
    state.activeTurn = { turnId: 1, aiId: "alpha" };

    const decision = parseModeratorDecision(
      '{"action":"issue_turn","aiId":"beta","question":"Next","reason":"Try next"}',
      state
    );

    assert.equal(decision.action, "no_turn");
    assert.match(decision.reason, /active turn exists/);
  });
});
