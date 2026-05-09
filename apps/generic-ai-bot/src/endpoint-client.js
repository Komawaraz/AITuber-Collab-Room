export async function requestGenericAiReply({
  config,
  turn,
  source = "discord-collab-generic",
  fetchImpl = fetch
}) {
  if (config.endpoint.type === "openai-compatible") {
    return requestOpenAiCompatibleReply({ config, turn, source, fetchImpl });
  }
  if (config.endpoint.type === "webhook") {
    return requestWebhookReply({ config, turn, source, fetchImpl });
  }
  throw new Error(`Unsupported GENERIC_AI_ENDPOINT_TYPE: ${config.endpoint.type}`);
}

async function requestOpenAiCompatibleReply({ config, turn, source, fetchImpl }) {
  const endpoint = `${config.endpoint.baseUrl.replace(/\/+$/, "")}/chat/completions`;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${config.endpoint.apiKey}`
    },
    body: JSON.stringify({
      model: config.endpoint.model,
      messages: [
        {
          role: "system",
          content: `${config.endpoint.systemPrompt}\nRuntime source: ${source}. AI ID: ${config.aiId}.`
        },
        {
          role: "user",
          content: turn.prompt
        }
      ],
      temperature: 0.55,
      max_tokens: 220,
      chat_template_kwargs: {
        enable_thinking: false
      }
    }),
    signal: AbortSignal.timeout(config.endpoint.timeoutMs)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`OpenAI-compatible endpoint failed: ${response.status} ${body.error?.message || body.detail || ""}`.trim());
  }
  const text = body.choices?.[0]?.message?.content;
  if (!text) {
    throw new Error("OpenAI-compatible endpoint failed: empty reply");
  }
  return String(text).trim();
}

async function requestWebhookReply({ config, turn, source, fetchImpl }) {
  const endpoint = config.endpoint.url || config.endpoint.baseUrl;
  const response = await fetchImpl(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(config.endpoint.apiKey ? { "Authorization": `Bearer ${config.endpoint.apiKey}` } : {})
    },
    body: JSON.stringify({
      aiId: config.aiId,
      source,
      prompt: turn.prompt,
      recent: turn.recent,
      question: turn.question
    }),
    signal: AbortSignal.timeout(config.endpoint.timeoutMs)
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`Webhook endpoint failed: ${response.status} ${body.error || body.detail || ""}`.trim());
  }
  const text = body.reply || body.text || body.message;
  if (!text) {
    throw new Error("Webhook endpoint failed: empty reply");
  }
  return String(text).trim();
}
