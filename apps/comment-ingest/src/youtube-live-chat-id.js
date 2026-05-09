import { fileURLToPath } from "node:url";
import { loadEnvFile } from "../../bot/src/env-file.js";

if (isMainModule()) {
  loadEnvFile();
  const input = process.argv[2] || process.env.YOUTUBE_VIDEO_ID || process.env.YOUTUBE_VIDEO_URL || "";
  const apiKey = process.env.YOUTUBE_API_KEY || "";
  if (!apiKey) {
    throw new Error("Missing YOUTUBE_API_KEY.");
  }
  const videoId = extractYouTubeVideoId(input);
  if (!videoId) {
    throw new Error("Usage: npm run comments:youtube:chat-id -- <youtube video url or video id>");
  }

  const liveChatId = await fetchYouTubeLiveChatId({ apiKey, videoId });
  console.log(liveChatId);
}

export async function fetchYouTubeLiveChatId({ apiKey, videoId, fetchImpl = fetch }) {
  const url = new URL("https://www.googleapis.com/youtube/v3/videos");
  url.searchParams.set("id", videoId);
  url.searchParams.set("part", "liveStreamingDetails");
  url.searchParams.set("key", apiKey);

  const response = await fetchImpl(url);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`youtube video lookup failed: ${response.status} ${body.error?.message || ""}`.trim());
  }

  const liveChatId = body.items?.[0]?.liveStreamingDetails?.activeLiveChatId;
  if (!liveChatId) {
    throw new Error("No activeLiveChatId found. The video may not be a live stream, or live chat may be disabled.");
  }
  return liveChatId;
}

export function extractYouTubeVideoId(input) {
  const value = String(input || "").trim();
  if (/^[a-zA-Z0-9_-]{11}$/.test(value)) {
    return value;
  }

  try {
    const url = new URL(value);
    if (url.hostname === "youtu.be") {
      const id = url.pathname.split("/").filter(Boolean)[0] || "";
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : "";
    }
    if (url.pathname.startsWith("/live/")) {
      const id = url.pathname.split("/").filter(Boolean)[1] || "";
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : "";
    }
    const id = url.searchParams.get("v") || "";
    return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : "";
  } catch {
    return "";
  }
}

function isMainModule() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}
