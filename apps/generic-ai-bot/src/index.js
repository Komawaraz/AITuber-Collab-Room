import { Client, GatewayIntentBits } from "discord.js";
import { formatCollabReplyTag, parseCollabTag, TagType } from "../../../packages/protocol/src/index.js";
import { acquireProcessLock } from "../../../packages/runtime-lock/src/index.js";
import { loadEnvFile } from "../../bot/src/env-file.js";
import { buildGenericCollabInput } from "./collab-input.js";
import { loadGenericAiBotConfig } from "./config.js";
import { requestGenericAiReply } from "./endpoint-client.js";
import { runParticipantSpeech } from "./speech.js";

loadEnvFile();

const config = loadGenericAiBotConfig();
acquireProcessLock(`generic-ai-bot-${config.aiId}`);

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once("clientReady", () => {
  console.log(`Generic AI bot logged in as ${client.user.tag} ai=${config.aiId} endpoint=${config.endpoint.type}`);
});

client.on("messageCreate", async (message) => {
  try {
    if (message.author.id === client.user.id) {
      return;
    }
    if (message.guildId !== config.guildId || message.channelId !== config.roomChannelId) {
      return;
    }

    const tag = parseCollabTag(message.content);
    if (!tag || tag.type !== TagType.turn) {
      return;
    }
    if (!message.mentions.users.has(client.user.id)) {
      return;
    }

    const aiText = await requestGenericAiReply({
      config,
      turn: buildGenericCollabInput(message.content)
    });
    const content = [
      aiText,
      "",
      formatCollabReplyTag({
        room: tag.attrs.room,
        session: tag.attrs.session,
        turn: tag.attrs.turn,
        reply_to: message.id
      })
    ].join("\n");

    const replyMessage = await message.reply({
      content,
      allowedMentions: { repliedUser: false }
    });
    console.log(`[generic-ai:reply] ai=${config.aiId} turn=${tag.attrs.turn} message=${message.id}`);

    const speechResult = await runParticipantSpeech({
      config,
      text: aiText,
      turnAttrs: tag.attrs,
      replyMessageId: replyMessage.id,
      async sendSpeechEvent(content) {
        await message.channel.send({ content });
      }
    });
    if (speechResult.ok) {
      console.log(`[generic-ai:speech] ai=${config.aiId} turn=${tag.attrs.turn} audio=${speechResult.audioId}`);
    } else if (speechResult.error) {
      console.error(`[generic-ai:speech] ai=${config.aiId} turn=${tag.attrs.turn} ${speechResult.error.message}`);
    }
  } catch (error) {
    console.error(`[generic-ai:message] ai=${config.aiId} ${error.stack || error.message}`);
  }
});

await client.login(config.token);
