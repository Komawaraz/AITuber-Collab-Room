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
    apiKey: process.env.YOUTUBE_API_KEY || "",
    liveChatId: process.env.YOUTUBE_LIVE_CHAT_ID || "",
    roleDetectionEnabled: envFlag(process.env.YOUTUBE_COMMENT_ROLE_DETECTION, true),
    once: process.argv.includes("--once")
  };

  if (!config.apiKey || !config.liveChatId) {
    throw new Error("Missing YOUTUBE_API_KEY or YOUTUBE_LIVE_CHAT_ID.");
  }

  await watchYouTubeLiveChat(config);
}

export async function watchYouTubeLiveChat({
  apiKey,
  liveChatId,
  endpoint,
  token,
  roleDetectionEnabled = true,
  once = false,
  fetchImpl = fetch,
  sleep = defaultSleep
}) {
  let pageToken = "";
  const seen = new Set();

  while (true) {
    const url = new URL("https://www.googleapis.com/youtube/v3/liveChat/messages");
    url.searchParams.set("liveChatId", liveChatId);
    url.searchParams.set("part", "id,snippet,authorDetails");
    url.searchParams.set("maxResults", "200");
    url.searchParams.set("key", apiKey);
    if (pageToken) {
      url.searchParams.set("pageToken", pageToken);
    }

    const response = await fetchImpl(url);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(`youtube live chat failed: ${response.status} ${body.error?.message || ""}`.trim());
    }

    for (const item of body.items || []) {
      const comment = item.snippet?.displayMessage || "";
      const name = item.authorDetails?.displayName || "youtube-viewer";
      if (!comment || seen.has(item.id)) {
        continue;
      }
      seen.add(item.id);
      await postAudienceComment({
        endpoint,
        token,
        source: "youtube",
        role: applyCommentRoleDetection(roleFromYouTubeAuthor(item.authorDetails || {}), roleDetectionEnabled),
        name,
        comment,
        fetchImpl
      });
      console.log(`[youtube] ${name}: ${comment}`);
    }

    pageToken = body.nextPageToken || pageToken;
    if (once) {
      return;
    }
    await sleep(Math.max(1_000, body.pollingIntervalMillis || 5_000));
  }
}

export function roleFromYouTubeAuthor(authorDetails) {
  if (authorDetails.isChatOwner) {
    return "host";
  }
  if (authorDetails.isChatModerator) {
    return "moderator";
  }
  if (authorDetails.isChatSponsor) {
    return "member";
  }
  return "viewer";
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isMainModule() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}
