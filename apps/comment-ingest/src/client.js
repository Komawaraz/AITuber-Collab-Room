export async function postAudienceComment({
  endpoint,
  token = "",
  source,
  name,
  comment,
  fetchImpl = fetch
}) {
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { "Authorization": `Bearer ${token}` } : {})
    },
    body: JSON.stringify({ source, name, comment })
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`comment ingest failed: ${response.status} ${body.error || ""}`.trim());
  }
  return body;
}

export function loadCommentIngestClientConfig(env = process.env) {
  return {
    endpoint: env.COMMENT_INGEST_ENDPOINT || "http://127.0.0.1:39210/audience",
    token: env.COMMENT_INGEST_TOKEN || ""
  };
}
