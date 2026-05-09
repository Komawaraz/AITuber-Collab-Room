import { Client, GatewayIntentBits, Partials } from "discord.js";
import { createServer } from "node:http";
import { openSqliteStore } from "../../../packages/db/src/sqlite.js";
import { acquireProcessLock } from "../../../packages/runtime-lock/src/index.js";
import { loadBotConfig } from "./config.js";
import { createModerator } from "./moderator.js";
import { loadEnvFile } from "./env-file.js";
import {
  handleControlCommand,
  handlePendingAutoTurn,
  handleRoomMessage,
  handleTurnTimeout,
  injectAudienceCommentFromSource
} from "./handlers.js";
import { createInitialState } from "./state.js";

loadEnvFile();
acquireProcessLock("collab-room-bot");

const config = loadBotConfig();
const store = openSqliteStore(config.dbPath);
const state = createInitialState(config, store.loadStateSnapshot());
const moderator = createModerator(config.moderator);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const timeoutHandles = new Map();
const pendingAutoTurnHandles = new Map();

client.once("clientReady", () => {
  console.log(`AITuber Collab Room bot logged in as ${client.user.tag}`);
  void checkConfiguredChannels();
  startCommentIngestServer();
  resumePendingAutoTurn();
  store.appendEvent({
    sessionId: state.session.sessionId,
    type: "BOT_READY",
    source: "bot",
    payload: {
      user: client.user.tag,
      roomId: state.roomId
    }
  });
  store.saveStateSnapshot(state);
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.id === client.user.id) {
      return;
    }
    if (message.guildId !== config.guildId) {
      return;
    }

    const normalized = normalizeDiscordMessage(message);

    if (message.channelId === config.channels.control) {
      const result = await handleControlCommand({
        state,
        config,
        moderator,
        authorId: message.author.id,
        content: message.content
      });
      if (result) {
        await publishResult(result);
      }
      return;
    }

    if (message.channelId === config.channels.room) {
      const result = handleRoomMessage({ state, message: normalized });
      await publishResult(result);
    }
  } catch (error) {
    console.error(`[bot:message] ${error.stack || error.message}`);
  }
});

await client.login(config.token);

function startCommentIngestServer() {
  if (!config.commentIngest.enabled) {
    return;
  }

  const server = createServer(async (request, response) => {
    try {
      if (request.method !== "POST" || request.url !== "/audience") {
        sendJson(response, 404, { ok: false, error: "not_found" });
        return;
      }
      if (config.commentIngest.token) {
        const authorization = request.headers.authorization || "";
        if (authorization !== `Bearer ${config.commentIngest.token}`) {
          sendJson(response, 401, { ok: false, error: "unauthorized" });
          return;
        }
      }

      const body = await readJsonBody(request, 16_384);
      const result = injectAudienceCommentFromSource({
        state,
        source: body.source,
        role: body.role,
        name: body.name,
        comment: body.comment
      });
      await publishResult(result);
      sendJson(response, 200, { ok: true, kind: result.kind });
    } catch (error) {
      console.error(`[bot:comment-ingest] ${error.stack || error.message}`);
      sendJson(response, 400, { ok: false, error: error.message });
    }
  });

  server.listen(config.commentIngest.port, config.commentIngest.host, () => {
    console.log(
      `[bot:comment-ingest] listening on http://${config.commentIngest.host}:${config.commentIngest.port}/audience`
    );
  });
}

function normalizeDiscordMessage(message) {
  return {
    id: message.id,
    authorId: message.author.id,
    authorName: message.author.username,
    isBot: message.author.bot,
    content: message.content
  };
}

async function publishResult(result) {
  if (!result) {
    return;
  }

  for (const text of result.controlMessages || []) {
    await safeSendToChannel(config.channels.control, text, "control");
  }
  if (result.roomMessage) {
    await safeSendToChannel(config.channels.room, result.roomMessage, "room");
  }
  for (const text of result.logMessages || []) {
    await safeSendToChannel(config.channels.logs, text, "logs");
  }

  if ((result.kind === "turn" || result.kind === "auto_loop_turn") && state.activeTurn) {
    scheduleTurnTimeout(state.activeTurn.turnId, 60_000);
  }
  if (result.kind === "retry" && state.activeTurn) {
    scheduleTurnTimeout(state.activeTurn.turnId, 30_000);
  }
  if (result.kind === "auto_loop_wait" && result.pendingAutoTurn) {
    schedulePendingAutoTurn(result.pendingAutoTurn.id, result.pendingAutoTurn.delayMs || 1_000);
  }

  persistResult(result);
}

async function sendToChannel(channelId, text) {
  const channel = await client.channels.fetch(channelId);
  if (!channel || !channel.isTextBased()) {
    throw new Error(`Channel ${channelId} is not text-based or cannot be fetched.`);
  }
  try {
    await channel.send(text);
  } catch (error) {
    console.error(`[bot:send] channel=${channelId} failed: ${error.message}`);
    throw error;
  }
}

async function safeSendToChannel(channelId, text, label) {
  try {
    await sendToChannel(channelId, text);
    return true;
  } catch (error) {
    console.error(`[bot:send:${label}] continuing after failed send: ${error.message}`);
    return false;
  }
}

function scheduleTurnTimeout(turnId, timeoutMs) {
  const existing = timeoutHandles.get(turnId);
  if (existing) {
    clearTimeout(existing);
  }

  const handle = setTimeout(async () => {
    timeoutHandles.delete(turnId);
    const result = handleTurnTimeout({ state, turnId });
    await publishResult(result);
  }, timeoutMs);

  timeoutHandles.set(turnId, handle);
}

function schedulePendingAutoTurn(pendingTurnId, delayMs) {
  const existing = pendingAutoTurnHandles.get(pendingTurnId);
  if (existing) {
    clearTimeout(existing);
  }

  const handle = setTimeout(async () => {
    pendingAutoTurnHandles.delete(pendingTurnId);
    const result = handlePendingAutoTurn({ state, pendingTurnId });
    await publishResult(result);
  }, Math.max(0, delayMs));

  pendingAutoTurnHandles.set(pendingTurnId, handle);
}

function resumePendingAutoTurn() {
  const pendingTurn = state.autoLoop?.pendingTurn;
  if (!pendingTurn) {
    return;
  }
  const readyAt = Date.parse(pendingTurn.readyAt || "");
  const delayMs = Number.isFinite(readyAt)
    ? Math.max(0, readyAt - Date.now())
    : pendingTurn.delayMs || 1_000;
  console.log(`[bot:auto-loop] resuming pending turn ai=${pendingTurn.aiId} delay_ms=${delayMs}`);
  schedulePendingAutoTurn(pendingTurn.id, delayMs);
}

function persistResult(result) {
  for (const text of result.controlMessages || []) {
    store.appendEvent({
      sessionId: state.session.sessionId,
      type: result.kind,
      source: "control",
      payload: { text }
    });
  }
  for (const text of result.logMessages || []) {
    store.appendEvent({
      sessionId: state.session.sessionId,
      type: result.kind,
      source: "log",
      payload: { text }
    });
  }
  if (result.roomMessage) {
    store.appendEvent({
      sessionId: state.session.sessionId,
      type: result.kind,
      source: "room",
      payload: { text: result.roomMessage }
    });
  }
  store.saveStateSnapshot(state);
}

function readJsonBody(request, maxBytes) {
  return new Promise((resolve, reject) => {
    let raw = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      raw += chunk;
      if (raw.length > maxBytes) {
        request.destroy();
        reject(new Error("request_body_too_large"));
      }
    });
    request.on("end", () => {
      try {
        resolve(JSON.parse(raw || "{}"));
      } catch {
        reject(new Error("invalid_json"));
      }
    });
    request.on("error", reject);
  });
}

function sendJson(response, statusCode, body) {
  response.writeHead(statusCode, { "Content-Type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(body));
}

async function checkConfiguredChannels() {
  for (const [name, channelId] of Object.entries(config.channels)) {
    try {
      const channel = await client.channels.fetch(channelId);
      console.log(
        `[bot:channel-check] ${name} found=${Boolean(channel)} text=${Boolean(channel?.isTextBased?.())}`
      );
    } catch (error) {
      console.error(`[bot:channel-check] ${name} id=${channelId} failed: ${error.message}`);
    }
  }
}
