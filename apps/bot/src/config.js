export function loadBotConfig(env = process.env) {
  const required = [
    "DISCORD_TOKEN",
    "DISCORD_GUILD_ID",
    "COLLAB_ROOM_CHANNEL_ID",
    "CONTROL_CHANNEL_ID",
    "LOG_CHANNEL_ID"
  ];
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  return {
    token: env.DISCORD_TOKEN,
    guildId: env.DISCORD_GUILD_ID,
    channels: {
      room: env.COLLAB_ROOM_CHANNEL_ID,
      control: env.CONTROL_CHANNEL_ID,
      logs: env.LOG_CHANNEL_ID
    },
    dbPath: env.COLLAB_DB_PATH || "data/collab-room.sqlite",
    roomId: env.ROOM_ID || "default",
    session: {
      sessionId: env.SESSION_ID || "manual-test-01",
      sessionTheme: env.SESSION_THEME || "AITuber collaboration test",
      summary: env.SESSION_SUMMARY || "No summary yet."
    },
    topic: {
      topicId: env.INITIAL_TOPIC_ID || "intro",
      title: env.INITIAL_TOPIC_TITLE || "Opening topic"
    },
    hostUserIds: parseCsv(env.HOST_USER_IDS),
    coHostUserIds: parseCsv(env.CO_HOST_USER_IDS),
    participants: parseParticipants(env.AI_PARTICIPANTS),
    moderator: {
      enabled: env.CODEX_MODERATOR_ENABLED === "1",
      command: env.CODEX_APP_SERVER_COMMAND || "codex",
      model: env.CODEX_MODERATOR_MODEL || "gpt-5.4",
      cwd: env.CODEX_MODERATOR_CWD || process.cwd(),
      timeoutMs: parsePositiveInt(env.CODEX_MODERATOR_TIMEOUT_MS, 120_000)
    },
    commentIngest: {
      enabled: env.COMMENT_INGEST_ENABLED === "1",
      host: env.COMMENT_INGEST_HOST || "127.0.0.1",
      port: parsePositiveInt(env.COMMENT_INGEST_PORT, 39210),
      token: env.COMMENT_INGEST_TOKEN || ""
    },
    speechPacing: {
      enabled: env.SPEECH_PACING_ENABLED !== "0",
      minDelayMs: parsePositiveInt(env.SPEECH_PACING_MIN_DELAY_MS, 1_500),
      maxDelayMs: parsePositiveInt(env.SPEECH_PACING_MAX_DELAY_MS, 15_000),
      baseDelayMs: parseNonNegativeInt(env.SPEECH_PACING_BASE_DELAY_MS, 700),
      charsPerSecond: parsePositiveNumber(env.SPEECH_PACING_CHARS_PER_SECOND, 12)
    }
  };
}

function parseCsv(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseParticipants(value) {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    if (!Array.isArray(parsed)) {
      throw new Error("AI_PARTICIPANTS must be a JSON array.");
    }
    return parsed.map((participant) => ({
      aiId: String(participant.aiId),
      displayName: String(participant.displayName || participant.aiId),
      botId: String(participant.botId),
      shortDescription: String(participant.shortDescription || "No public description."),
      strengths: Array.isArray(participant.strengths) ? participant.strengths.map(String) : [],
      forbiddenTopics: Array.isArray(participant.forbiddenTopics) ? participant.forbiddenTopics.map(String) : [],
      forbiddenTopicSummary: String(participant.forbiddenTopicSummary || "none"),
      muted: Boolean(participant.muted),
      paused: Boolean(participant.paused)
    }));
  } catch (error) {
    throw new Error(`Invalid AI_PARTICIPANTS: ${error.message}`);
  }
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseNonNegativeInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

function parsePositiveNumber(value, fallback) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
