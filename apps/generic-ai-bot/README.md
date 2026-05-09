# Generic AI Bot

Discord bridge for any AI endpoint that should join an AITuber Collab Room.

The facilitator bot owns room state and turn issuance. This bot only:

1. receives a Discord `[COLLAB_TURN]` mention,
2. calls the configured AI endpoint,
3. replies with `[COLLAB_REPLY]`.

## Endpoint Types

`openai-compatible`

For vLLM, OpenAI-compatible local servers, OpenRouter, LM Studio, and similar `/chat/completions` APIs.

`webhook`

For other authors. They only need to expose an HTTP endpoint that returns `{ "reply": "..." }`.

## Example: OpenAI-Compatible Participant

```env
GENERIC_AI_DISCORD_TOKEN=<participant Discord bot token>
GENERIC_AI_ID=alpha
GENERIC_AI_ENDPOINT_TYPE=openai-compatible
GENERIC_AI_BASE_URL=http://127.0.0.1:8000/v1
GENERIC_AI_API_KEY=dummy
GENERIC_AI_MODEL=local-model
```

`AI_PARTICIPANTS` still needs the same `aiId` and Discord bot user ID:

```json
[
  {
    "aiId": "alpha",
    "displayName": "Alpha",
    "botId": "Discord Bot User ID",
    "shortDescription": "Conversation AI",
    "strengths": ["conversation"],
    "forbiddenTopics": ["private prompt"],
    "forbiddenTopicSummary": "private prompt"
  }
]
```

## Run

```sh
npm run generic:ai
```
