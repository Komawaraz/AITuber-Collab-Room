import {
  buildTurnContext,
  can,
  inspectReply,
  processOffTurnSpeech,
  Role,
  selectNextSpeaker
} from "../../../packages/core/src/index.js";
import { parseCollabTag, TagType } from "../../../packages/protocol/src/index.js";
import {
  findParticipantByAiId,
  findParticipantByBotId,
  rememberMessage,
  setParticipantMuted
} from "./state.js";

const COMMAND_PREFIX = "!collab";

export function roleForUser(config, userId) {
  if (config.hostUserIds.includes(userId)) {
    return Role.host;
  }
  if (config.coHostUserIds.includes(userId)) {
    return Role.coHost;
  }
  return Role.viewer;
}

export async function handleControlCommand({ state, config, moderator, authorId, content }) {
  if (!content.startsWith(COMMAND_PREFIX)) {
    return null;
  }

  const role = roleForUser(config, authorId);
  const [command, ...args] = content.slice(COMMAND_PREFIX.length).trim().split(/\s+/).filter(Boolean);

  if (!command || command === "status") {
    return controlResult(`session=${state.session.sessionId} topic=${state.topic.topicId} paused=${state.paused} activeTurn=${state.activeTurn?.turnId || "none"}`);
  }

  if (command === "turn") {
    if (!can(role, "FORCE_TURN")) {
      return controlResult("Permission denied: FORCE_TURN");
    }
    if (state.autoLoop?.pendingTurn) {
      return controlResult(`Cannot issue manual turn while speech pacing wait is active for ${state.autoLoop.pendingTurn.aiId}. Use !collab loop stop first.`);
    }
    const aiId = args.shift();
    const question = args.join(" ").trim() || "Please respond to the current topic.";
    return issueTurn({ state, aiId, question, reason: "manual command" });
  }

  if (command === "next") {
    if (!can(role, "FORCE_TURN")) {
      return controlResult("Permission denied: FORCE_TURN");
    }
    if (state.autoLoop?.pendingTurn) {
      return controlResult(`Cannot issue next turn while speech pacing wait is active for ${state.autoLoop.pendingTurn.aiId}. Use !collab loop stop first.`);
    }
    const question = args.join(" ").trim() || "Please respond to the current topic.";
    const selected = selectNextSpeaker({
      participants: state.participants,
      recentTurns: state.recentTurns
    });
    if (!selected.ai) {
      return controlResult(`No eligible AI: ${selected.reason}`);
    }
    return issueTurn({ state, aiId: selected.ai.aiId, question, reason: selected.reason });
  }

  if (command === "suggest" || command === "proceed") {
    if (!can(role, "FORCE_TURN")) {
      return controlResult("Permission denied: FORCE_TURN");
    }
    if (command === "proceed" && state.autoLoop?.pendingTurn) {
      return controlResult(`Cannot proceed while speech pacing wait is active for ${state.autoLoop.pendingTurn.aiId}. Use !collab loop stop first.`);
    }
    const instruction = args.join(" ").trim() || "Proceed naturally.";
    const decision = await moderator.decide({ state, instruction });
    if (command === "suggest" || decision.action !== "issue_turn") {
      return controlResult(formatModeratorDecision(decision));
    }
    return issueTurn({
      state,
      aiId: decision.aiId,
      question: decision.question,
      reason: `${decision.source || "moderator"} moderator: ${decision.reason}`
    });
  }

  if (command === "audience") {
    if (!can(role, "FORCE_TURN")) {
      return controlResult("Permission denied: FORCE_TURN");
    }
    return injectAudienceComment({ state, args });
  }

  if (command === "loop") {
    if (!can(role, "FORCE_TURN")) {
      return controlResult("Permission denied: FORCE_TURN");
    }
    return handleLoopCommand({ state, args });
  }

  if (command === "mute" || command === "unmute") {
    if (!can(role, command === "mute" ? "MUTE_AI" : "UNMUTE_AI")) {
      return controlResult(`Permission denied: ${command.toUpperCase()}`);
    }
    const aiId = args[0];
    if (!setParticipantMuted(state, aiId, command === "mute")) {
      return controlResult(`Unknown AI: ${aiId}`);
    }
    return controlResult(`${command === "mute" ? "Muted" : "Unmuted"} ${aiId}`);
  }

  if (command === "cancel") {
    if (!can(role, "CANCEL_TURN")) {
      return controlResult("Permission denied: CANCEL_TURN");
    }
    const turnId = args[0];
    if (!state.activeTurn || String(state.activeTurn.turnId) !== String(turnId)) {
      return controlResult(`No active turn ${turnId}`);
    }
    state.activeTurn = null;
    return controlResult(`Cancelled turn ${turnId}`);
  }

  if (command === "pause") {
    if (!can(role, "PAUSE_ROOM")) {
      return controlResult("Permission denied: PAUSE_ROOM");
    }
    state.paused = true;
    return controlResult("Room paused.");
  }

  if (command === "resume") {
    if (!can(role, "PAUSE_ROOM")) {
      return controlResult("Permission denied: PAUSE_ROOM");
    }
    state.paused = false;
    return controlResult("Room resumed.");
  }

  return controlResult(`Unknown command: ${command}`);
}

function injectAudienceComment({ state, args }) {
  const raw = args.join(" ").trim();
  if (!raw) {
    return controlResult("Usage: !collab audience <name>: <comment>");
  }

  const parsed = parseAudienceComment(raw);
  return injectAudienceCommentFromSource({
    state,
    source: "discord-manual",
    name: parsed.name,
    comment: parsed.comment
  });
}

export function injectAudienceCommentFromSource({ state, source = "external", name, comment }) {
  const normalized = {
    source: sanitizeSourceName(source),
    name: sanitizeAudienceName(name || "viewer"),
    comment: String(comment || "").trim()
  };
  if (!normalized.comment) {
    return controlResult("Audience comment ignored: empty comment.");
  }

  const id = `viewer-${normalized.source}-${Date.now()}-${state.recentMessages.length}`;
  const content = `[VIEWER_COMMENT source="${normalized.source}" name="${escapeAudienceName(normalized.name)}"] ${normalized.comment}`;

  rememberMessage(state, {
    id,
    authorId: `viewer:${normalized.source}`,
    authorName: normalized.name,
    content: normalized.comment
  });

  return {
    kind: "audience",
    roomMessage: content,
    controlMessages: [`Injected audience comment from ${normalized.name}. source=${normalized.source}`],
    logMessages: [`AUDIENCE_COMMENT source=${normalized.source} name=${normalized.name} text=${normalized.comment}`]
  };
}

function parseAudienceComment(raw) {
  const match = /^([^:：]{1,32})[:：]\s*(.+)$/s.exec(raw);
  if (!match) {
    return {
      name: "viewer",
      comment: raw
    };
  }
  return {
    name: sanitizeAudienceName(match[1]),
    comment: match[2].trim()
  };
}

function sanitizeAudienceName(name) {
  return String(name || "viewer").replace(/\s+/g, "_").replace(/["\\]/g, "").slice(0, 32) || "viewer";
}

function sanitizeSourceName(source) {
  return String(source || "external").replace(/[^a-zA-Z0-9_.:-]/g, "_").slice(0, 48) || "external";
}

function escapeAudienceName(name) {
  return sanitizeAudienceName(name).replace(/]/g, "");
}

export function handleRoomMessage({ state, message }) {
  rememberMessage(state, message);

  const participant = findParticipantByBotId(state, message.authorId);
  if (!participant) {
    return {
      kind: "human_or_unregistered",
      controlMessages: [],
      logMessages: []
    };
  }

  const tag = parseCollabTag(message.content);
  if (tag?.type === TagType.reply) {
    return handleAiReply({ state, participant, message });
  }

  const currentCount = state.offTurnViolations.get(participant.aiId) ?? 0;
  const result = processOffTurnSpeech({
    aiId: participant.aiId,
    currentViolationCount: currentCount
  });
  state.offTurnViolations.set(participant.aiId, result.violationCount);

  if (result.event.type === "AUTO_MUTE") {
    participant.muted = true;
  }

  const line = `[${result.event.type}] ${participant.aiId}: ${result.event.reason}`;
  return {
    kind: "off_turn_speech",
    controlMessages: [line],
    logMessages: [line]
  };
}

export function handleTurnTimeout({ state, turnId }) {
  if (!state.activeTurn || String(state.activeTurn.turnId) !== String(turnId)) {
    return null;
  }

  if (state.activeTurn.retryNotices < 1) {
    state.activeTurn.retryNotices += 1;
    return {
      kind: "retry",
      controlMessages: [`[TURN_RETRY_NOTICE] ${state.activeTurn.aiId} turn=${turnId}`],
      roomMessage: `<@${state.activeTurn.botId}> [COLLAB_TURN room=${state.roomId} session=${state.session.sessionId} turn=${turnId} topic=${state.topic.topicId}] Retry notice: please reply to the active turn.`
    };
  }

  const aiId = state.activeTurn.aiId;
  state.activeTurn = null;
  return {
    kind: "skipped",
    controlMessages: [`[TURN_SKIPPED_NO_REPLY] ${aiId} turn=${turnId}`],
    logMessages: [`[TURN_SKIPPED_NO_REPLY] ${aiId} turn=${turnId}`]
  };
}

function issueTurn({ state, aiId, question, reason }) {
  const participant = findParticipantByAiId(state, aiId);
  if (!participant) {
    return controlResult(`Unknown AI: ${aiId}`);
  }
  if (participant.muted || participant.paused || state.paused) {
    return controlResult(`Cannot issue turn to ${aiId}: muted, paused, or room paused.`);
  }

  const turn = {
    turnId: state.nextTurnNumber++,
    sessionId: state.session.sessionId,
    aiId,
    botId: participant.botId,
    question,
    retryNotices: 0
  };
  state.activeTurn = turn;
  state.recentTurns.push({ aiId, turnId: turn.turnId });
  state.recentTurns = state.recentTurns.slice(-50);

  const context = buildTurnContext({
    roomId: state.roomId,
    session: state.session,
    turn,
    topic: state.topic,
    recentMessages: recentMessagesForTurn(state),
    participants: state.participants
  });

  return {
    kind: "turn",
    roomMessage: `<@${participant.botId}> ${context}`,
    controlMessages: [`Issued turn ${turn.turnId} to ${aiId}. reason=${reason}`],
    logMessages: [`TURN_ISSUED turn=${turn.turnId} ai=${aiId} reason=${reason}`]
  };
}

function handleAiReply({ state, participant, message }) {
  if (!state.activeTurn || state.activeTurn.aiId !== participant.aiId) {
    const currentCount = state.offTurnViolations.get(participant.aiId) ?? 0;
    const result = processOffTurnSpeech({
      aiId: participant.aiId,
      currentViolationCount: currentCount
    });
    state.offTurnViolations.set(participant.aiId, result.violationCount);
    if (result.event.type === "AUTO_MUTE") {
      participant.muted = true;
    }
    const line = `[${result.event.type}] ${participant.aiId}: reply without active matching turn`;
    return {
      kind: "reply_without_turn",
      controlMessages: [line],
      logMessages: [line]
    };
  }

  const inspection = inspectReply({
    text: message.content,
    turn: state.activeTurn,
    ai: participant,
    forbiddenTopics: [...(participant.forbiddenTopics || [])]
  });

  const turnId = state.activeTurn.turnId;
  if (inspection.ok) {
    state.activeTurn = null;
    state.offTurnViolations.set(participant.aiId, 0);
    const result = {
      kind: "reply_ok",
      controlMessages: [`Reply accepted from ${participant.aiId} for turn ${turnId}.`],
      logMessages: [`TURN_REPLIED turn=${turnId} ai=${participant.aiId} message=${message.id}`]
    };
    return maybeContinueLoop({ state, previousParticipant: participant, previousMessageText: message.content, result });
  }

  const messages = inspection.events.map(
    (event) => `[${event.type}] ${participant.aiId} turn=${turnId} reason=${event.reason}${event.topic ? ` topic=${event.topic}` : ""}`
  );
  return {
    kind: "reply_needs_attention",
    controlMessages: messages,
    logMessages: messages
  };
}

function handleLoopCommand({ state, args }) {
  const subcommand = args.shift();
  if (!subcommand || subcommand === "status") {
    if (!state.autoLoop?.enabled) {
      return controlResult("Auto loop is stopped.");
    }
    if (state.autoLoop.pendingTurn) {
      return controlResult(
        `Auto loop waiting: next=${state.autoLoop.pendingTurn.aiId} remaining=${state.autoLoop.remainingTurns} readyAt=${state.autoLoop.pendingTurn.readyAt || "unknown"} topic=${state.autoLoop.topic}`
      );
    }
    return controlResult(
      `Auto loop active: participants=${state.autoLoop.participantIds.join(",")} remaining=${state.autoLoop.remainingTurns} topic=${state.autoLoop.topic}`
    );
  }

  if (subcommand === "stop") {
    state.autoLoop = null;
    return controlResult("Auto loop stopped.");
  }

  if (subcommand !== "start") {
    return controlResult("Usage: !collab loop start <ai_id> <ai_id> <turns> <topic>");
  }

  if (state.activeTurn) {
    return controlResult(`Cannot start auto loop while turn ${state.activeTurn.turnId} is active.`);
  }
  if (state.autoLoop?.pendingTurn) {
    return controlResult(`Cannot start auto loop while speech pacing wait is active for ${state.autoLoop.pendingTurn.aiId}.`);
  }

  const firstAiId = args.shift();
  const secondAiId = args.shift();
  const turns = Math.min(12, Math.max(1, Number.parseInt(args.shift(), 10) || 4));
  const topic = args.join(" ").trim() || "疑似コラボ配信として、相手の発話を一つ拾って短く返す。";
  const participantIds = [firstAiId, secondAiId].filter(Boolean);
  if (participantIds.length !== 2 || participantIds.some((aiId) => !findParticipantByAiId(state, aiId))) {
    return controlResult("Usage: !collab loop start <ai_id> <ai_id> <turns> <topic>");
  }

  state.autoLoop = {
    enabled: true,
    participantIds,
    remainingTurns: turns,
    contextStartAfterMessageId: state.recentMessages.at(-1)?.id || null,
    topic
  };

  return issueTurn({
    state,
    aiId: firstAiId,
    question: buildLoopQuestion({ aiId: firstAiId, topic, isFirst: true }),
    reason: `auto loop start remaining=${turns}`
  });
}

function maybeContinueLoop({ state, previousParticipant, previousMessageText, result }) {
  if (!state.autoLoop?.enabled) {
    return result;
  }
  if (state.autoLoop.remainingTurns <= 1) {
    state.autoLoop = null;
    result.controlMessages.push("Auto loop completed.");
    result.logMessages.push("AUTO_LOOP_COMPLETED");
    return result;
  }

  const nextAiId = nextLoopParticipantId(state.autoLoop.participantIds, previousParticipant.aiId);
  if (!nextAiId) {
    state.autoLoop = null;
    result.controlMessages.push("Auto loop stopped: no next participant.");
    result.logMessages.push("AUTO_LOOP_STOPPED reason=no_next_participant");
    return result;
  }

  state.autoLoop.remainingTurns -= 1;
  const pendingTurn = {
    id: `auto-${Date.now()}-${state.autoLoop.remainingTurns}-${nextAiId}`,
    aiId: nextAiId,
    question: buildLoopQuestion({ aiId: nextAiId, topic: state.autoLoop.topic, isFirst: false }),
    reason: `auto loop remaining=${state.autoLoop.remainingTurns}`
  };

  const delayMs = estimateSpeechDelayMs(previousMessageText, state.speechPacing);
  if (delayMs > 0) {
    pendingTurn.readyAt = new Date(Date.now() + delayMs).toISOString();
    pendingTurn.delayMs = delayMs;
    state.autoLoop.pendingTurn = pendingTurn;
    result.kind = "auto_loop_wait";
    result.pendingAutoTurn = { ...pendingTurn };
    result.controlMessages.push(`Auto loop waiting ${delayMs}ms before turn to ${nextAiId}.`);
    result.logMessages.push(`AUTO_LOOP_WAIT next=${nextAiId} delay_ms=${delayMs}`);
    return result;
  }

  const nextTurn = issueTurn({ state, ...pendingTurn });

  if (nextTurn.kind !== "turn") {
    state.autoLoop = null;
    result.controlMessages.push(...(nextTurn.controlMessages || []), "Auto loop stopped.");
    result.logMessages.push(...(nextTurn.logMessages || []), "AUTO_LOOP_STOPPED reason=issue_failed");
    return result;
  }

  result.kind = "auto_loop_turn";
  result.roomMessage = nextTurn.roomMessage;
  result.controlMessages.push(...nextTurn.controlMessages);
  result.logMessages.push(...nextTurn.logMessages);
  return result;
}

export function handlePendingAutoTurn({ state, pendingTurnId }) {
  const pendingTurn = state.autoLoop?.pendingTurn;
  if (!pendingTurn || pendingTurn.id !== pendingTurnId) {
    return null;
  }
  if (state.activeTurn) {
    return {
      kind: "auto_loop_wait",
      controlMessages: [`Auto loop still waiting: active turn ${state.activeTurn.turnId} exists.`],
      logMessages: [`AUTO_LOOP_WAIT_STILL_ACTIVE turn=${state.activeTurn.turnId}`],
      pendingAutoTurn: { ...pendingTurn, delayMs: 1_000 }
    };
  }

  delete state.autoLoop.pendingTurn;
  const nextTurn = issueTurn({
    state,
    aiId: pendingTurn.aiId,
    question: pendingTurn.question,
    reason: pendingTurn.reason
  });

  if (nextTurn.kind !== "turn") {
    state.autoLoop = null;
    return {
      kind: "control",
      controlMessages: [...(nextTurn.controlMessages || []), "Auto loop stopped."],
      logMessages: [...(nextTurn.logMessages || []), "AUTO_LOOP_STOPPED reason=pending_issue_failed"]
    };
  }

  return {
    ...nextTurn,
    kind: "auto_loop_turn"
  };
}

function estimateSpeechDelayMs(text, pacing = {}) {
  if (!pacing.enabled) {
    return 0;
  }
  const clean = String(text || "")
    .replace(/\[COLLAB_REPLY\s+[^\]]+\]/g, "")
    .replace(/\s+/g, "")
    .trim();
  const charCount = Array.from(clean).length;
  const estimated = Math.ceil((pacing.baseDelayMs || 0) + (charCount / (pacing.charsPerSecond || 12)) * 1000);
  return Math.max(pacing.minDelayMs || 0, Math.min(pacing.maxDelayMs || estimated, estimated));
}

function nextLoopParticipantId(participantIds, currentAiId) {
  if (participantIds.length === 0) {
    return null;
  }
  const index = participantIds.indexOf(currentAiId);
  if (index === -1) {
    return participantIds[0];
  }
  return participantIds[(index + 1) % participantIds.length];
}

function buildLoopQuestion({ aiId, topic, isFirst }) {
  if (isFirst) {
    return `${topic} 視聴者に短く挨拶し、相手が返しやすい軽い話題を一つ振ってください。`;
  }
  return `${topic} まず相手の直前の質問や言葉に具体的に答えてください。その後、視聴者にもわかる軽い話題を一つだけ振ってください。`;
}

function recentMessagesForTurn(state) {
  const markerId = state.autoLoop?.contextStartAfterMessageId;
  if (!markerId) {
    return state.recentMessages;
  }
  const markerIndex = state.recentMessages.findIndex((message) => message.id === markerId);
  return markerIndex === -1
    ? state.recentMessages
    : state.recentMessages.slice(markerIndex + 1);
}

function controlResult(message) {
  return {
    kind: "control",
    controlMessages: [message],
    logMessages: []
  };
}

function formatModeratorDecision(decision) {
  if (decision.action === "issue_turn") {
    return [
      `Moderator suggests turn to ${decision.aiId}.`,
      `Question: ${decision.question}`,
      `Reason: ${decision.reason}`,
      `Source: ${decision.source || "unknown"}`
    ].join("\n");
  }
  return [
    "Moderator suggests no turn.",
    `Reason: ${decision.reason}`,
    `Source: ${decision.source || "unknown"}`
  ].join("\n");
}
