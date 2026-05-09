import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { formatCollabSpeechTag, TagType } from "../../../packages/protocol/src/index.js";

const execFileAsync = promisify(execFile);

export async function runParticipantSpeech({
  config,
  text,
  turnAttrs,
  replyMessageId,
  sendSpeechEvent,
  fetchImpl = fetch,
  execFileImpl = execFileAsync
}) {
  if (!config.speech?.enabled) {
    return { skipped: true };
  }

  const audioId = buildAudioId({ aiId: config.aiId, turn: turnAttrs.turn, replyMessageId });
  await sendSpeechEvent(formatSpeechTag(TagType.speechStarted, turnAttrs, audioId));

  try {
    if (config.speech.driver === "command") {
      await runSpeechCommand({ config, text, turnAttrs, audioId, replyMessageId, execFileImpl });
    } else {
      await runSpeechWebhook({ config, text, turnAttrs, audioId, replyMessageId, fetchImpl });
    }
    await sendSpeechEvent(formatSpeechTag(TagType.speechFinished, turnAttrs, audioId));
    return { skipped: false, ok: true, audioId };
  } catch (error) {
    await sendSpeechEvent(formatSpeechTag(TagType.speechFailed, turnAttrs, audioId, errorCode(error)));
    return { skipped: false, ok: false, audioId, error };
  }
}

async function runSpeechWebhook({ config, text, turnAttrs, audioId, replyMessageId, fetchImpl }) {
  if (!config.speech.webhookUrl) {
    throw new Error("missing_speech_webhook_url");
  }
  const response = await fetchImpl(config.speech.webhookUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.speech.apiKey ? { "Authorization": `Bearer ${config.speech.apiKey}` } : {})
    },
    body: JSON.stringify({
      aiId: config.aiId,
      room: turnAttrs.room,
      session: turnAttrs.session,
      turn: turnAttrs.turn,
      audioId,
      replyMessageId,
      text
    }),
    signal: AbortSignal.timeout(config.speech.timeoutMs)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`speech_webhook_failed_${response.status}_${body.error || body.detail || ""}`.trim());
  }
}

async function runSpeechCommand({ config, text, turnAttrs, audioId, replyMessageId, execFileImpl }) {
  if (!config.speech.command) {
    throw new Error("missing_speech_command");
  }
  const env = {
    ...process.env,
    COLLAB_AI_ID: config.aiId,
    COLLAB_ROOM: turnAttrs.room || "",
    COLLAB_SESSION: turnAttrs.session || "",
    COLLAB_TURN: String(turnAttrs.turn || ""),
    COLLAB_AUDIO_ID: audioId,
    COLLAB_REPLY_MESSAGE_ID: replyMessageId || "",
    COLLAB_SPEECH_TEXT: text
  };
  await execFileImpl(config.speech.command, config.speech.args || [], {
    env,
    timeout: config.speech.timeoutMs,
    maxBuffer: 1024 * 1024
  });
}

function formatSpeechTag(type, turnAttrs, audioId, reason) {
  return formatCollabSpeechTag({
    type,
    room: turnAttrs.room,
    session: turnAttrs.session,
    turn: turnAttrs.turn,
    audio_id: audioId,
    reason
  });
}

function buildAudioId({ aiId, turn, replyMessageId }) {
  return `${sanitizeId(aiId)}-${sanitizeId(turn)}-${sanitizeId(replyMessageId)}-${Date.now()}`;
}

function sanitizeId(value) {
  return String(value || "unknown").replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 64) || "unknown";
}

function errorCode(error) {
  const message = String(error?.message || "speech_failed").toLowerCase();
  return message.replace(/[^a-z0-9_-]/g, "_").slice(0, 48) || "speech_failed";
}
