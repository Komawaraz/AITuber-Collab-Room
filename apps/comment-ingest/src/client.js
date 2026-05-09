export async function postAudienceComment({
  endpoint,
  token = "",
  source,
  role = "viewer",
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
    body: JSON.stringify({ source, role, name, comment })
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

export function envFlag(value, defaultValue = false) {
  if (value == null || value === "") {
    return defaultValue;
  }
  const normalized = String(value).trim().toLowerCase();
  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }
  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }
  return defaultValue;
}

export function applyCommentRoleDetection(role, enabled = true) {
  return enabled ? role : "viewer";
}
