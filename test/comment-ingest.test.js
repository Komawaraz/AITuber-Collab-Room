import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { loadBotConfig } from "../apps/bot/src/config.js";
import { injectAudienceCommentFromSource } from "../apps/bot/src/handlers.js";
import { createInitialState } from "../apps/bot/src/state.js";
import {
  applyCommentRoleDetection,
  envFlag,
  loadCommentIngestClientConfig,
  postAudienceComment
} from "../apps/comment-ingest/src/client.js";
import { parsePrivmsg } from "../apps/comment-ingest/src/twitch.js";
import { roleFromYouTubeAuthor } from "../apps/comment-ingest/src/youtube.js";

describe("external comment ingest", () => {
  it("loads optional ingest server config", () => {
    const config = loadBotConfig({
      DISCORD_TOKEN: "token",
      DISCORD_GUILD_ID: "guild",
      COLLAB_ROOM_CHANNEL_ID: "room",
      CONTROL_CHANNEL_ID: "control",
      LOG_CHANNEL_ID: "logs",
      COMMENT_INGEST_ENABLED: "1",
      COMMENT_INGEST_PORT: "40001",
      COMMENT_INGEST_TOKEN: "shared"
    });

    assert.equal(config.commentIngest.enabled, true);
    assert.equal(config.commentIngest.port, 40001);
    assert.equal(config.commentIngest.token, "shared");
  });

  it("injects normalized external comments into room context", () => {
    const state = createInitialState({
      roomId: "default",
      session: { sessionId: "s1", summary: "No summary yet." },
      topic: { topicId: "intro", title: "Opening" },
      participants: []
    });

    const result = injectAudienceCommentFromSource({
      state,
      source: "youtube",
      role: "host",
      name: "viewerA",
      comment: "聞こえていますか？"
    });

    assert.equal(result.kind, "audience");
    assert.match(result.roomMessage, /\[VIEWER_COMMENT source="youtube" role="host" name="viewerA"\]/);
    assert.equal(state.recentMessages.at(-1).authorId, "viewer:youtube");
    assert.equal(state.recentMessages.at(-1).author, "viewerA(host)");
    assert.equal(state.recentMessages.at(-1).text, "聞こえていますか？");
  });

  it("posts comments to the ingest endpoint", async () => {
    const response = await postAudienceComment({
      endpoint: "http://127.0.0.1:39210/audience",
      token: "shared",
      source: "twitch",
      role: "moderator",
      name: "viewerB",
      comment: "見えています",
      fetchImpl: async (url, options) => {
        assert.equal(url, "http://127.0.0.1:39210/audience");
        assert.equal(options.headers.Authorization, "Bearer shared");
        assert.deepEqual(JSON.parse(options.body), {
          source: "twitch",
          role: "moderator",
          name: "viewerB",
          comment: "見えています"
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

    assert.deepEqual(response, { ok: true });
  });

  it("loads watcher client config", () => {
    const config = loadCommentIngestClientConfig({
      COMMENT_INGEST_ENDPOINT: "http://localhost:4000/audience",
      COMMENT_INGEST_TOKEN: "token"
    });

    assert.equal(config.endpoint, "http://localhost:4000/audience");
    assert.equal(config.token, "token");
  });

  it("loads comment role detection flags", () => {
    assert.equal(envFlag("1", false), true);
    assert.equal(envFlag("off", true), false);
    assert.equal(envFlag("", true), true);
    assert.equal(applyCommentRoleDetection("host", true), "host");
    assert.equal(applyCommentRoleDetection("host", false), "viewer");
  });

  it("parses Twitch PRIVMSG lines", () => {
    const message = parsePrivmsg(
      "@badges=broadcaster/1;display-name=ViewerA;id=abc :viewera!viewera@viewera.tmi.twitch.tv PRIVMSG #channel :こんにちは"
    );

    assert.equal(message.displayName, "ViewerA");
    assert.equal(message.login, "viewera");
    assert.equal(message.role, "host");
    assert.equal(message.text, "こんにちは");
  });

  it("maps YouTube chat owner comments to host role", () => {
    assert.equal(roleFromYouTubeAuthor({ isChatOwner: true }), "host");
    assert.equal(roleFromYouTubeAuthor({ isChatModerator: true }), "moderator");
    assert.equal(roleFromYouTubeAuthor({ isChatSponsor: true }), "member");
    assert.equal(roleFromYouTubeAuthor({}), "viewer");
  });
});
