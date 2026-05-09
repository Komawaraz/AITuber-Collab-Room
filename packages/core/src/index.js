import { parseCollabTag, TagType } from "../../protocol/src/index.js";

export const Role = Object.freeze({
  host: "HOST",
  coHost: "CO_HOST",
  author: "AUTHOR",
  ai: "AI",
  viewer: "VIEWER",
  moderator: "MODERATOR"
});

export const SafetyEventType = Object.freeze({
  warning: "WARNING",
  strongWarning: "STRONG_WARNING",
  autoMute: "AUTO_MUTE",
  retryTurn: "RETRY_TURN",
  longReply: "LONG_REPLY",
  skippedNoReply: "TURN_SKIPPED_NO_REPLY"
});

export const DEFAULT_LIMITS = Object.freeze({
  turnTimeoutSeconds: 60,
  retryTimeoutSeconds: 30,
  maxRetryNotices: 1,
  recommendedReplyChars: 300,
  warnReplyChars: 500,
  noConsecutiveTurns: true,
  maxTurnsPerWindow: 4,
  turnWindowSize: 10,
  summaryEveryTurns: 10,
  maxDiscordTurnContextChars: 1800
});

const PERMISSIONS = Object.freeze({
  [Role.host]: new Set([
    "START_SESSION",
    "END_SESSION",
    "CHANGE_SESSION_THEME",
    "SHIFT_TOPIC",
    "PAUSE_ROOM",
    "STOP_ROOM",
    "MUTE_AI",
    "UNMUTE_AI",
    "CANCEL_TURN",
    "CHANGE_ROLES",
    "ACCEPT_COMMENT",
    "REJECT_COMMENT",
    "FORCE_TURN"
  ]),
  [Role.coHost]: new Set([
    "SHIFT_TOPIC",
    "PAUSE_TOPIC",
    "RESUME_TOPIC",
    "PAUSE_ROOM",
    "MUTE_AI",
    "UNMUTE_AI",
    "CANCEL_TURN",
    "ACCEPT_COMMENT",
    "REJECT_COMMENT",
    "FORCE_TURN"
  ]),
  [Role.author]: new Set([
    "PROPOSE_TOPIC",
    "EDIT_OWN_AI_PROFILE",
    "EDIT_OWN_AI_FORBIDDEN_TOPICS",
    "SET_OWN_AI_MEMORY_POLICY"
  ]),
  [Role.moderator]: new Set(["PAUSE_ROOM", "MUTE_AI", "UNMUTE_AI", "CANCEL_TURN"]),
  [Role.ai]: new Set([]),
  [Role.viewer]: new Set([])
});

export function can(role, permission) {
  return Boolean(PERMISSIONS[role]?.has(permission));
}

export function validateSessionStart(session) {
  const missing = [];
  for (const key of [
    "sessionTheme",
    "initialTopic",
    "participants",
    "commonForbiddenTopics",
    "turnMode"
  ]) {
    const value = session[key];
    if (Array.isArray(value) ? value.length === 0 : !value) {
      missing.push(key);
    }
  }
  return {
    ok: missing.length === 0,
    missing
  };
}

export function shouldUpdateSummary({ completedTurns, topicShifted }, limits = DEFAULT_LIMITS) {
  return Boolean(topicShifted || (completedTurns > 0 && completedTurns % limits.summaryEveryTurns === 0));
}

export function selectNextSpeaker({ participants, recentTurns = [], directMentionAiId, acceptedComment }, limits = DEFAULT_LIMITS) {
  const lastSpeakerId = recentTurns.at(-1)?.aiId;
  const window = recentTurns.slice(-limits.turnWindowSize);
  const turnCounts = countBy(window.map((turn) => turn.aiId));

  const candidates = participants
    .filter((ai) => !ai.muted && !ai.paused)
    .filter((ai) => !limits.noConsecutiveTurns || ai.aiId !== lastSpeakerId)
    .filter((ai) => (turnCounts.get(ai.aiId) ?? 0) < limits.maxTurnsPerWindow)
    .map((ai) => ({
      ai,
      score: speakerScore(ai, {
        directMentionAiId,
        acceptedComment,
        recentTurns,
        turnCounts
      })
    }))
    .sort((a, b) => b.score - a.score || a.ai.displayName.localeCompare(b.ai.displayName));

  if (candidates.length === 0) {
    return {
      ai: null,
      reason: "No eligible AI after mute, pause, consecutive-turn, and frequency filters."
    };
  }

  const chosen = candidates[0];
  return {
    ai: chosen.ai,
    reason: describeSpeakerReason(chosen.ai, {
      directMentionAiId,
      acceptedComment,
      score: chosen.score
    })
  };
}

export function inspectReply({ text, turn, ai, forbiddenTopics = [], limits = DEFAULT_LIMITS }) {
  const events = [];
  const tag = parseCollabTag(text);

  if (!tag || tag.type !== TagType.reply) {
    events.push({
      type: SafetyEventType.retryTurn,
      aiId: ai.aiId,
      turnId: turn.turnId,
      reason: "missing_collab_reply_tag"
    });
  } else if (tag.attrs.turn !== String(turn.turnId) || tag.attrs.session !== turn.sessionId) {
    events.push({
      type: SafetyEventType.retryTurn,
      aiId: ai.aiId,
      turnId: turn.turnId,
      reason: "reply_tag_mismatch"
    });
  }

  if (text.length > limits.warnReplyChars) {
    events.push({
      type: SafetyEventType.longReply,
      aiId: ai.aiId,
      turnId: turn.turnId,
      reason: "reply_exceeded_soft_limit",
      length: text.length,
      limit: limits.warnReplyChars
    });
  }

  const forbiddenHit = findForbiddenTopic(text, forbiddenTopics);
  if (forbiddenHit) {
    events.push({
      type: SafetyEventType.retryTurn,
      aiId: ai.aiId,
      turnId: turn.turnId,
      reason: "forbidden_topic_hint",
      topic: forbiddenHit
    });
  }

  return {
    ok: events.length === 0,
    events
  };
}

export function processOffTurnSpeech({ aiId, currentViolationCount }) {
  const nextCount = currentViolationCount + 1;
  if (nextCount >= 3) {
    return {
      violationCount: nextCount,
      event: { type: SafetyEventType.autoMute, aiId, reason: "off_turn_speech_repeated" }
    };
  }
  if (nextCount === 2) {
    return {
      violationCount: nextCount,
      event: { type: SafetyEventType.strongWarning, aiId, reason: "off_turn_speech_repeated" }
    };
  }
  return {
    violationCount: nextCount,
    event: { type: SafetyEventType.warning, aiId, reason: "off_turn_speech" }
  };
}

export function buildTurnContext({
  roomId = "default",
  session,
  turn,
  topic,
  recentMessages,
  participants,
  acceptedCreatorComment,
  maxChars = DEFAULT_LIMITS.maxDiscordTurnContextChars
}) {
  for (const recentBudget of [900, 600, 300, 120, 0]) {
    const text = buildTurnContextWithRecentBudget({
      roomId,
      session,
      turn,
      topic,
      recentMessages,
      participants,
      acceptedCreatorComment,
      recentBudget
    });
    if (text.length <= maxChars || recentBudget === 0) {
      return text.length <= maxChars ? text : truncateTurnContext(text, maxChars);
    }
  }
}

function speakerScore(ai, { directMentionAiId, acceptedComment, recentTurns, turnCounts }) {
  let score = 0;
  if (directMentionAiId === ai.aiId) {
    score += 100;
  }
  if (acceptedComment?.targetAiId === ai.aiId) {
    score += 80;
  }
  score += Math.max(0, 20 - (turnCounts.get(ai.aiId) ?? 0) * 5);
  const lastIndex = recentTurns.findLastIndex((turn) => turn.aiId === ai.aiId);
  if (lastIndex === -1) {
    score += 10;
  } else {
    score += Math.max(0, recentTurns.length - lastIndex);
  }
  return score;
}

function describeSpeakerReason(ai, { directMentionAiId, acceptedComment, score }) {
  if (directMentionAiId === ai.aiId) {
    return `Selected ${ai.aiId} because it was directly mentioned.`;
  }
  if (acceptedComment?.targetAiId === ai.aiId) {
    return `Selected ${ai.aiId} because an accepted creator comment targets it.`;
  }
  return `Selected ${ai.aiId} by availability and participation balance. score=${score}`;
}

function findForbiddenTopic(text, forbiddenTopics) {
  const normalized = text.toLocaleLowerCase();
  return forbiddenTopics.find((topic) => normalized.includes(String(topic).toLocaleLowerCase()));
}

function buildTurnContextWithRecentBudget({
  roomId,
  session,
  turn,
  topic,
  recentMessages,
  participants,
  acceptedCreatorComment,
  recentBudget
}) {
  const lines = [
    `[COLLAB_TURN room=${roomId} session=${session.sessionId} turn=${turn.turnId} topic=${topic.topicId}]`,
    `Current topic: ${truncateText(topic.title, 120)}`,
    `Summary: ${truncateText(session.summary, 220)}`,
    `Recent messages: ${formatRecentMessages(recentMessages.slice(-10), recentBudget)}`,
    `Participants: ${truncateText(formatParticipantProfiles(participants), 360)}`
  ];

  if (acceptedCreatorComment) {
    lines.push(
      `Accepted creator comment: [${acceptedCreatorComment.relationLabel}: ${acceptedCreatorComment.from}] ${truncateText(acceptedCreatorComment.text, 180)}`
    );
  }

  lines.push(`Question: ${truncateText(turn.question, 360)}`);
  return lines.join("\n");
}

function truncateTurnContext(text, maxChars) {
  if (text.length <= maxChars) {
    return text;
  }
  return `${text.slice(0, Math.max(0, maxChars - 24)).trimEnd()}\n[context truncated]`;
}

function truncateText(text, maxChars) {
  const value = String(text || "");
  if (value.length <= maxChars) {
    return value;
  }
  return `${value.slice(0, Math.max(0, maxChars - 3)).trimEnd()}...`;
}

function formatRecentMessages(messages, maxChars = 900) {
  if (messages.length === 0) {
    return "none";
  }
  if (maxChars <= 0) {
    return "omitted for Discord length limit";
  }

  const formatted = [];
  let used = 0;
  for (const message of messages.toReversed()) {
    const item = truncateText(`${message.author}: ${message.text}`, 180);
    const nextUsed = used + item.length + (formatted.length > 0 ? 3 : 0);
    if (nextUsed > maxChars) {
      break;
    }
    formatted.unshift(item);
    used = nextUsed;
  }
  return formatted.length > 0 ? formatted.join(" | ") : "omitted for Discord length limit";
}

function formatParticipantProfiles(participants) {
  return participants
    .map((ai) => {
      const strengths = ai.strengths?.length ? ai.strengths.join("/") : "unspecified";
      const forbidden = ai.forbiddenTopicSummary || "none";
      return `${ai.displayName}: ${ai.shortDescription}. Strengths: ${strengths}. Forbidden summary: ${forbidden}.`;
    })
    .join(" ");
}

function countBy(values) {
  const result = new Map();
  for (const value of values) {
    result.set(value, (result.get(value) ?? 0) + 1);
  }
  return result;
}
