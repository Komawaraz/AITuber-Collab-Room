import { WebSocket } from "ws";
import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../../bot/src/env-file.js";
import {
  applyCommentRoleDetection,
  envFlag,
  loadCommentIngestClientConfig,
  postAudienceComment
} from "./client.js";

if (isMainModule()) {
  loadEnvFile();
  const config = {
    ...loadCommentIngestClientConfig(),
    channel: process.env.TWITCH_CHANNEL || "",
    username: process.env.TWITCH_BOT_USERNAME || "",
    oauthToken: process.env.TWITCH_OAUTH_TOKEN || "",
    roleDetectionEnabled: envFlag(process.env.TWITCH_COMMENT_ROLE_DETECTION, true),
    once: process.argv.includes("--once")
  };

  if (!config.channel || !config.username || !config.oauthToken) {
    throw new Error("Missing TWITCH_CHANNEL, TWITCH_BOT_USERNAME, or TWITCH_OAUTH_TOKEN.");
  }

  await watchTwitchChat(config);
}

export function watchTwitchChat({
  channel,
  username,
  oauthToken,
  endpoint,
  token,
  roleDetectionEnabled = true,
  once = false
}) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket("wss://irc-ws.chat.twitch.tv:443");
    const normalizedChannel = channel.replace(/^#/, "").toLowerCase();

    ws.on("open", () => {
      ws.send("CAP REQ :twitch.tv/tags twitch.tv/commands");
      ws.send(`PASS ${oauthToken.startsWith("oauth:") ? oauthToken : `oauth:${oauthToken}`}`);
      ws.send(`NICK ${username}`);
      ws.send(`JOIN #${normalizedChannel}`);
    });

    ws.on("message", async (data) => {
      const lines = String(data).split(/\r?\n/).filter(Boolean);
      for (const line of lines) {
        if (line.startsWith("PING ")) {
          ws.send(line.replace(/^PING/, "PONG"));
          continue;
        }
        const message = parsePrivmsg(line);
        if (!message) {
          continue;
        }
        try {
          await postAudienceComment({
            endpoint,
            token,
            source: "twitch",
            role: applyCommentRoleDetection(message.role, roleDetectionEnabled),
            name: message.displayName || message.login,
            comment: message.text
          });
          console.log(`[twitch] ${message.displayName || message.login}: ${message.text}`);
          if (once) {
            ws.close();
            resolve();
          }
        } catch (error) {
          reject(error);
        }
      }
    });

    ws.on("error", reject);
    ws.on("close", () => {
      if (!once) {
        console.log("[twitch] connection closed");
      }
    });
  });
}

export function parsePrivmsg(line) {
  const match = /^(?:@([^ ]+) )?:([^! ]+)!.* PRIVMSG #[^ ]+ :(.+)$/s.exec(line);
  if (!match) {
    return null;
  }
  const tags = parseTags(match[1] || "");
  return {
    login: match[2],
    displayName: tags["display-name"] || match[2],
    role: roleFromTwitchTags(tags),
    text: match[3]
  };
}

export function roleFromTwitchTags(tags) {
  const badges = String(tags.badges || "");
  if (/(^|,)broadcaster\//.test(badges)) {
    return "host";
  }
  if (/(^|,)moderator\//.test(badges)) {
    return "moderator";
  }
  if (/(^|,)vip\//.test(badges)) {
    return "vip";
  }
  if (/(^|,)subscriber\//.test(badges)) {
    return "member";
  }
  return "viewer";
}

function parseTags(raw) {
  const tags = {};
  for (const pair of raw.split(";")) {
    if (!pair) {
      continue;
    }
    const [key, value = ""] = pair.split("=");
    tags[key] = value.replace(/\\s/g, " ");
  }
  return tags;
}

function isMainModule() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}
