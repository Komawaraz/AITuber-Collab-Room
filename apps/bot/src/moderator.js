import { spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { selectNextSpeaker } from "../../../packages/core/src/index.js";

export function createModerator(config) {
  if (!config?.enabled) {
    return createRuleModerator();
  }
  return createCodexModerator(config);
}

export function createRuleModerator() {
  return {
    kind: "rule",
    async decide({ state, instruction }) {
      return fallbackDecision({ state, instruction, reasonPrefix: "rule moderator" });
    }
  };
}

export function createCodexModerator(config) {
  return {
    kind: "codex",
    async decide({ state, instruction }) {
      try {
        const text = await runCodexAppServerTurn({
          command: config.command,
          model: config.model,
          cwd: config.cwd,
          timeoutMs: config.timeoutMs,
          prompt: buildModeratorPrompt({ state, instruction })
        });
        return parseModeratorDecision(text, state);
      } catch (error) {
        const fallback = fallbackDecision({
          state,
          instruction,
          reasonPrefix: `codex moderator unavailable: ${error.message}`
        });
        return { ...fallback, source: "fallback" };
      }
    }
  };
}

export function buildModeratorPrompt({ state, instruction }) {
  const compactState = {
    session: state.session,
    topic: state.topic,
    paused: state.paused,
    activeTurn: state.activeTurn,
    participants: state.participants.map((participant) => ({
      aiId: participant.aiId,
      displayName: participant.displayName,
      shortDescription: participant.shortDescription,
      strengths: participant.strengths,
      muted: participant.muted,
      paused: participant.paused
    })),
    recentMessages: state.recentMessages.slice(-10),
    recentTurns: state.recentTurns.slice(-10)
  };

  return [
    "You are the moderator brain for an AITuber collaboration room.",
    "Decide the next facilitation action. Do not execute Discord actions yourself.",
    "Return only compact JSON with this schema:",
    '{"action":"issue_turn"|"no_turn","aiId":"string|null","question":"string","reason":"string"}',
    "Rules:",
    "- Use action issue_turn only when one participant should receive the next turn.",
    "- Do not select muted or paused participants, and do not issue a turn while the room is paused or another turn is active.",
    "- Keep question short, concrete, and suitable for public Discord.",
    "- reason must be short and operational.",
    `Host instruction: ${instruction || "Proceed naturally."}`,
    `Room state JSON: ${JSON.stringify(compactState)}`
  ].join("\n");
}

export function parseModeratorDecision(text, state) {
  const parsed = extractJsonObject(text);
  if (!parsed || typeof parsed !== "object") {
    return fallbackDecision({
      state,
      instruction: "",
      reasonPrefix: "codex moderator returned non-json"
    });
  }

  const action = parsed.action === "issue_turn" ? "issue_turn" : "no_turn";
  const aiId = typeof parsed.aiId === "string" ? parsed.aiId : null;
  const question = normalizeQuestion(parsed.question);
  const reason = normalizeReason(parsed.reason, "codex moderator decision");

  if (action !== "issue_turn") {
    return { action: "no_turn", aiId: null, question, reason, source: "codex" };
  }

  const participant = state.participants.find((item) => item.aiId === aiId);
  if (!participant || participant.muted || participant.paused || state.paused || state.activeTurn) {
    return fallbackDecision({
      state,
      instruction: question,
      reasonPrefix: "codex moderator selected unavailable participant"
    });
  }

  return { action, aiId, question, reason, source: "codex" };
}

function fallbackDecision({ state, instruction, reasonPrefix }) {
  if (state.paused || state.activeTurn) {
    return {
      action: "no_turn",
      aiId: null,
      question: normalizeQuestion(instruction),
      reason: state.paused ? `${reasonPrefix}; room paused` : `${reasonPrefix}; active turn exists`,
      source: "rule"
    };
  }

  const selected = selectNextSpeaker({
    participants: state.participants,
    recentTurns: state.recentTurns
  });
  if (!selected.ai) {
    return {
      action: "no_turn",
      aiId: null,
      question: normalizeQuestion(instruction),
      reason: `${reasonPrefix}; ${selected.reason}`,
      source: "rule"
    };
  }
  return {
    action: "issue_turn",
    aiId: selected.ai.aiId,
    question: normalizeQuestion(instruction),
    reason: `${reasonPrefix}; ${selected.reason}`,
    source: "rule"
  };
}

function normalizeQuestion(value) {
  const text = String(value || "").trim();
  return text || "今の流れを踏まえて、次に見るべき点を短く述べてください。";
}

function normalizeReason(value, fallback) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.slice(0, 180) || fallback;
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  try {
    return JSON.parse(raw);
  } catch {
    const match = /\{[\s\S]*\}/.exec(raw);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
}

async function runCodexAppServerTurn({ command, model, cwd, timeoutMs, prompt }) {
  const proc = spawn(command, ["app-server"], {
    cwd,
    stdio: ["pipe", "pipe", "pipe"]
  });
  const stderr = [];
  proc.stderr.setEncoding("utf8");
  proc.stderr.on("data", (chunk) => stderr.push(chunk));

  const rl = createInterface({ input: proc.stdout });
  const pending = new Map();
  let nextId = 1;
  let threadId = null;
  let finalText = "";
  let completed = false;
  let processError = null;

  const timer = setTimeout(() => {
    processError = new Error(`Codex app-server timed out after ${timeoutMs}ms`);
    proc.kill("SIGTERM");
  }, timeoutMs);

  proc.once("error", (error) => {
    processError = error;
    rejectPending(pending, error);
  });
  proc.once("exit", (code, signal) => {
    if (completed) {
      return;
    }
    const detail = stderr.join("").trim();
    const message = detail || `Codex app-server exited early code=${code} signal=${signal || "none"}`;
    const error = processError || new Error(message);
    processError = error;
    rejectPending(pending, error);
  });

  rl.on("line", (line) => {
    let message;
    try {
      message = JSON.parse(line);
    } catch {
      return;
    }

    if (message.id && pending.has(message.id)) {
      const request = pending.get(message.id);
      pending.delete(message.id);
      if (message.error) {
        request.reject(new Error(message.error.message || "Codex app-server request failed"));
      } else {
        request.resolve(message.result || {});
      }
      return;
    }
    if (message.method === "item/agentMessage/delta") {
      finalText += message.params?.delta || message.params?.text || "";
    }
    if (message.method === "turn/completed") {
      completed = true;
    }
  });

  const send = (method, params = {}) => {
    const id = nextId++;
    if (processError) {
      return Promise.reject(processError);
    }
    const payload = `${JSON.stringify({ method, id, params })}\n`;
    return new Promise((resolve, reject) => {
      pending.set(id, { resolve, reject });
      proc.stdin.write(payload, (error) => {
        if (error) {
          pending.delete(id);
          reject(error);
        }
      });
    });
  };
  const notify = (method, params = {}) => {
    proc.stdin.write(`${JSON.stringify({ method, params })}\n`);
  };

  try {
    await send("initialize", {
      clientInfo: {
        name: "aituber_collab_room",
        title: "AITuber Collab Room",
        version: "0.1.0"
      }
    });
    notify("initialized", {});
    const thread = await send("thread/start", {
      model,
      cwd,
      approvalPolicy: "never",
      serviceName: "aituber_collab_room"
    });
    threadId = thread.thread?.id;
    if (!threadId) {
      throw new Error("Codex app-server did not return a thread id");
    }
    await send("turn/start", {
      threadId,
      input: [{ type: "text", text: prompt }]
    });

    while (!completed && proc.exitCode === null && !processError) {
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    if (processError) {
      throw processError;
    }
    proc.stdin.end();
    if (proc.exitCode === null) {
      proc.kill("SIGTERM");
    }
    if (!finalText.trim()) {
      throw new Error(stderr.join("").trim() || "Codex app-server returned an empty moderator response");
    }
    return finalText.trim();
  } finally {
    clearTimeout(timer);
    rl.close();
    if (proc.exitCode === null) {
      proc.kill("SIGTERM");
      await once(proc, "exit").catch(() => {});
    }
  }
}

function rejectPending(pending, error) {
  for (const request of pending.values()) {
    request.reject(error);
  }
  pending.clear();
}
