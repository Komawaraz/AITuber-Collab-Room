import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildGenericCollabInput } from "../apps/generic-ai-bot/src/collab-input.js";
import { loadGenericAiBotConfig } from "../apps/generic-ai-bot/src/config.js";
import { requestGenericAiReply } from "../apps/generic-ai-bot/src/endpoint-client.js";

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
});
