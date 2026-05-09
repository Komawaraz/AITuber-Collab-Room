import { Client, GatewayIntentBits, Partials } from "discord.js";
import { openSqliteStore } from "../../../packages/db/src/sqlite.js";
import { acquireProcessLock } from "../../../packages/runtime-lock/src/index.js";
import { loadBotConfig } from "./config.js";
import { createModerator } from "./moderator.js";
import { loadEnvFile } from "./env-file.js";
import { handleControlCommand, handleRoomMessage, handleTurnTimeout } from "./handlers.js";
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

client.once("clientReady", () => {
  console.log(`AITuber Collab Room bot logged in as ${client.user.tag}`);
  void checkConfiguredChannels();
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
