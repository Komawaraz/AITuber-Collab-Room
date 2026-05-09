import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGenericCollabInput } from "../apps/generic-ai-bot/src/collab-input.js";
import { loadGenericAiBotConfig } from "../apps/generic-ai-bot/src/config.js";
import { requestGenericAiReply } from "../apps/generic-ai-bot/src/endpoint-client.js";
import { runParticipantSpeech } from "../apps/generic-ai-bot/src/speech.js";

describe("generic AI bot", () => {
  it("loads an OpenAI-compatible participant config without host-specific assumptions", () => {
    const config = loadGenericAiBotConfig({
      GENERIC_AI_DISCORD_TOKEN: "discord-token",
      GENERIC_AI_ID: "alpha",
      DISCORD_GUILD_ID: "guild",
      COLLAB_ROOM_CHANNEL_ID: "room",
      GENERIC_AI_ENDPOINT_TYPE: "openai-compatible",
      GENERIC_AI_BASE_URL: "http://127.0.0.1:8000/v1",
      GENERIC_AI_API_KEY: "api-token"
    });

    assert.equal(config.aiId, "alpha");
    assert.equal(config.endpoint.type, "openai-compatible");
    assert.equal(config.endpoint.apiKey, "api-token");
    assert.equal(config.speech.enabled, false);
  });

  it("loads participant speech webhook config", () => {
    const config = loadGenericAiBotConfig({
      GENERIC_AI_DISCORD_TOKEN: "discord-token",
      GENERIC_AI_ID: "alpha",
      DISCORD_GUILD_ID: "guild",
      COLLAB_ROOM_CHANNEL_ID: "room",
      GENERIC_AI_SPEECH_ENABLED: "1",
      GENERIC_AI_SPEECH_DRIVER: "webhook",
      GENERIC_AI_SPEECH_WEBHOOK_URL: "http://tts.test/play",
      GENERIC_AI_SPEECH_API_KEY: "speech-token"
    });

    assert.equal(config.speech.enabled, true);
    assert.equal(config.speech.driver, "webhook");
    assert.equal(config.speech.webhookUrl, "http://tts.test/play");
    assert.equal(config.speech.apiKey, "speech-token");
  });

  it("loads participant speech command config", () => {
    const config = loadGenericAiBotConfig({
      GENERIC_AI_DISCORD_TOKEN: "discord-token",
      GENERIC_AI_ID: "alpha",
      DISCORD_GUILD_ID: "guild",
      COLLAB_ROOM_CHANNEL_ID: "room",
      GENERIC_AI_SPEECH_ENABLED: "1",
      GENERIC_AI_SPEECH_DRIVER: "command",
      GENERIC_AI_SPEECH_COMMAND: "say",
      GENERIC_AI_SPEECH_ARGS: "[\"--voice\",\"test\"]"
    });

    assert.equal(config.speech.driver, "command");
    assert.equal(config.speech.command, "say");
    assert.deepEqual(config.speech.args, ["--voice", "test"]);
  });

  it("builds endpoint input from recent room context", () => {
    const turn = buildGenericCollabInput([
      "[COLLAB_TURN room=default session=s1 turn=2 topic=intro]",
      "Recent messages: Guest: 紅茶は温かいほうがいいですか？",
      "Question: 相手の質問に答えてください。"
    ].join("\n"));

    assert.match(turn.prompt, /Guest: 紅茶は温かいほうがいいですか？/);
    assert.match(turn.prompt, /相手の質問に答えてください/);
    assert.equal(turn.question, "相手の質問に答えてください。");
  });

  it("calls OpenAI-compatible endpoints", async () => {
    const reply = await requestGenericAiReply({
      config: {
        aiId: "luma",
        endpoint: {
          type: "openai-compatible",
          baseUrl: "http://llm.test/v1",
          apiKey: "key",
          model: "model",
          systemPrompt: "短く返答してください。",
          timeoutMs: 1000
        }
      },
      turn: { prompt: "こんにちは", recent: "", question: "こんにちは" },
      fetchImpl: async (url, options) => {
        assert.equal(url, "http://llm.test/v1/chat/completions");
        const body = JSON.parse(options.body);
        assert.equal(body.model, "model");
        assert.match(body.messages[0].content, /AI ID: luma/);
        return {
          ok: true,
          status: 200,
          async json() {
            return { choices: [{ message: { content: "聞こえています。" } }] };
          }
        };
      }
    });

    assert.equal(reply, "聞こえています。");
  });

  it("calls webhook endpoints for third-party AIs", async () => {
    const reply = await requestGenericAiReply({
      config: {
        aiId: "third-party",
        endpoint: {
          type: "webhook",
          baseUrl: "http://ai-owner.test/collab/reply",
          url: "",
          apiKey: "shared-token",
          timeoutMs: 1000
        }
      },
      turn: {
        prompt: "文脈つきプロンプト",
        recent: "Alpha: どう見る？",
        question: "返答してください。"
      },
      fetchImpl: async (url, options) => {
        assert.equal(url, "http://ai-owner.test/collab/reply");
        assert.equal(options.headers.Authorization, "Bearer shared-token");
        assert.deepEqual(JSON.parse(options.body), {
          aiId: "third-party",
          source: "discord-collab-generic",
          prompt: "文脈つきプロンプト",
          recent: "Alpha: どう見る？",
          question: "返答してください。"
        });
        return {
          ok: true,
          status: 200,
          async json() {
            return { reply: "こちらではそう見えます。" };
          }
        };
      }
    });

    assert.equal(reply, "こちらではそう見えます。");
  });

  it("posts participant speech events around webhook playback", async () => {
    const events = [];
    const result = await runParticipantSpeech({
      config: {
        aiId: "alpha",
        speech: {
          enabled: true,
          driver: "webhook",
          webhookUrl: "http://tts.test/play",
          apiKey: "speech-token",
          timeoutMs: 1000
        }
      },
      text: "こんにちは",
      turnAttrs: { room: "default", session: "s1", turn: "7" },
      replyMessageId: "reply-1",
      sendSpeechEvent: async (content) => events.push(content),
      fetchImpl: async (url, options) => {
        assert.equal(url, "http://tts.test/play");
        assert.equal(options.headers.Authorization, "Bearer speech-token");
        assert.deepEqual(JSON.parse(options.body), {
          aiId: "alpha",
          room: "default",
          session: "s1",
          turn: "7",
          audioId: JSON.parse(options.body).audioId,
          replyMessageId: "reply-1",
          text: "こんにちは"
        });
        return {
          ok: true,
          status: 200,
          async json() {
            return { ok: true };
          }
        };
      }
    });

    assert.equal(result.ok, true);
    assert.match(events[0], /\[COLLAB_SPEECH_STARTED room=default session=s1 turn=7 audio_id=alpha-7-reply-1-/);
    assert.match(events[1], /\[COLLAB_SPEECH_FINISHED room=default session=s1 turn=7 audio_id=alpha-7-reply-1-/);
  });

  it("runs participant speech commands with collab environment", async () => {
    const events = [];
    let captured;
    const result = await runParticipantSpeech({
      config: {
        aiId: "beta",
        speech: {
          enabled: true,
          driver: "command",
          command: "tts-player",
          args: ["--once"],
          timeoutMs: 1000
        }
      },
      text: "再生します",
      turnAttrs: { room: "default", session: "s1", turn: "3" },
      replyMessageId: "reply-2",
      sendSpeechEvent: async (content) => events.push(content),
      execFileImpl: async (command, args, options) => {
        captured = { command, args, env: options.env };
      }
    });

    assert.equal(result.ok, true);
    assert.equal(captured.command, "tts-player");
    assert.deepEqual(captured.args, ["--once"]);
    assert.equal(captured.env.COLLAB_AI_ID, "beta");
    assert.equal(captured.env.COLLAB_TURN, "3");
    assert.equal(captured.env.COLLAB_SPEECH_TEXT, "再生します");
    assert.match(events[0], /COLLAB_SPEECH_STARTED/);
    assert.match(events[1], /COLLAB_SPEECH_FINISHED/);
  });

  it("posts failed speech events when playback fails", async () => {
    const events = [];
    const result = await runParticipantSpeech({
      config: {
        aiId: "alpha",
        speech: {
          enabled: true,
          driver: "command",
          command: "tts-player",
          args: [],
          timeoutMs: 1000
        }
      },
      text: "失敗します",
      turnAttrs: { room: "default", session: "s1", turn: "4" },
      replyMessageId: "reply-3",
      sendSpeechEvent: async (content) => events.push(content),
      execFileImpl: async () => {
        throw new Error("player failed");
      }
    });

    assert.equal(result.ok, false);
    assert.match(events[0], /COLLAB_SPEECH_STARTED/);
    assert.match(events[1], /COLLAB_SPEECH_FAILED/);
    assert.match(events[1], /reason=player_failed/);
  });
});
