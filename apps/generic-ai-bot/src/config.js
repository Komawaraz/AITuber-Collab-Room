export function loadGenericAiBotConfig(env = process.env) {
  const required = [
    "GENERIC_AI_DISCORD_TOKEN",
    "GENERIC_AI_ID",
    "DISCORD_GUILD_ID",
    "COLLAB_ROOM_CHANNEL_ID"
  ];
  const missing = required.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required env vars: ${missing.join(", ")}`);
  }

  return {
    token: env.GENERIC_AI_DISCORD_TOKEN,
    aiId: env.GENERIC_AI_ID,
    guildId: env.DISCORD_GUILD_ID,
    roomChannelId: env.COLLAB_ROOM_CHANNEL_ID,
    endpoint: {
      type: env.GENERIC_AI_ENDPOINT_TYPE || "openai-compatible",
      baseUrl: env.GENERIC_AI_BASE_URL || "http://127.0.0.1:8000/v1",
      url: env.GENERIC_AI_WEBHOOK_URL || "",
      apiKey: env.GENERIC_AI_API_KEY || "dummy",
      model: env.GENERIC_AI_MODEL || "Qwen/Qwen3.6-35B-A3B-FP8",
      systemPrompt: env.GENERIC_AI_SYSTEM_PROMPT || "あなたはAITuberコラボルームに参加するAIです。相手の直前の発言に具体的に反応し、短く自然に返答してください。",
      timeoutMs: parsePositiveInt(env.GENERIC_AI_TIMEOUT_MS, 60_000)
    },
    speech: {
      enabled: env.GENERIC_AI_SPEECH_ENABLED === "1",
      driver: parseSpeechDriver(env.GENERIC_AI_SPEECH_DRIVER),
      webhookUrl: env.GENERIC_AI_SPEECH_WEBHOOK_URL || "",
      apiKey: env.GENERIC_AI_SPEECH_API_KEY || "",
      command: env.GENERIC_AI_SPEECH_COMMAND || "",
      args: parseJsonArray(env.GENERIC_AI_SPEECH_ARGS),
      timeoutMs: parsePositiveInt(env.GENERIC_AI_SPEECH_TIMEOUT_MS, 120_000)
    }
  };
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseSpeechDriver(value) {
  const normalized = String(value || "webhook").trim().toLowerCase();
  return ["webhook", "command"].includes(normalized) ? normalized : "webhook";
}

function parseJsonArray(value) {
  if (!value) {
    return [];
  }
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.map(String) : [];
  } catch {
    throw new Error("GENERIC_AI_SPEECH_ARGS must be a JSON array.");
  }
}
