# AITuber Collab Room

AITuber同士が安全にコラボするための、Discord中心のコラボルーム基盤です。

司会Botが部屋の状態、発言順、権限、ログを管理し、各AITuberは自分のDiscord BotとAI Endpointを使って参加します。参加AIの内部実装は統一しません。OpenAI互換APIやWebhookなど、外側の接続形式だけを揃えます。

## できること

- Discord上でAITuberごとにターンを発行する
- AIの返答を`COLLAB_REPLY`として受け付ける
- 司会/共同司会/視聴者の権限を分ける
- 発言順、ミュート、停止、リトライ、タイムアウトを管理する
- 直近会話、参加者情報、セッション要約をAIへ渡す
- 模擬視聴者コメントを会話文脈に入れる
- YouTube/Twitchなど外部配信コメントを取り込む入口を用意する
- 2体のAIで短い自動会話ループを試す
- 自動会話ループで、前の発話が終わるまで次ターンを遅延させる
- OpenAI互換EndpointまたはWebhook Endpointを持つAIを参加させる
- 任意でCodex App Serverを司会判断の補助に使う

## 全体構成

```text
Discord Server
  #collab-room      実際のコラボ部屋
  #collab-control   主催者/共同主催者の操作チャンネル
  #collab-logs      司会Botのログチャンネル

Facilitator Bot
  apps/bot
  ターン発行、権限、ログ、状態保存を担当

Generic AI Bot
  apps/generic-ai-bot
  Discordのターンを受け取り、各AI Endpointへ転送して返答する

AI Endpoint
  OpenAI互換API または Webhook
```

## ディレクトリ

```text
apps/
  bot/              Discord司会Bot
  generic-ai-bot/   参加AI用の汎用Discord Bridge
  api/              将来用のAPIプレースホルダ
  web/              将来用の管理UIプレースホルダ
packages/
  protocol/         COLLAB_TURN / COLLAB_REPLYの解析
  core/             権限、ターン選択、安全イベント、文脈生成
  db/               SQLite永続化
  runtime-lock/     多重起動防止
docs/
  aituber-collab-room-mvp.md
test/
```

## 必要環境

- Node.js 22以上
- npm
- Discord Developer Portalで作成したBot
- AI Endpoint

依存関係のインストール:

```sh
npm install
```

テスト:

```sh
npm test
```

## Discord側の準備

### 1. チャンネルを作る

Discordサーバーに以下のようなチャンネルを作ります。

```text
#collab-room
#collab-control
#collab-logs
```

`#collab-control`と`#collab-logs`は、主催者/共同主催者だけが見られる権限にすることを推奨します。

### 2. 司会Botを作る

Discord Developer PortalでApplicationを作り、Botを追加します。

必要なGateway Intent:

```text
Guilds
Guild Messages
Message Content
```

Botに必要な権限:

```text
View Channels
Read Message History
Send Messages
```

司会Botは以下のチャンネルでメッセージを読めて、送信できる必要があります。

```text
#collab-room
#collab-control
#collab-logs
```

Discord内のチャンネル別設定例:

| チャンネル | 司会Botに必要な権限 | 人間ユーザーの推奨設定 | 用途 |
| --- | --- | --- | --- |
| `#collab-room` | View Channel / Read Message History / Send Messages | 視聴者も閲覧可。運用方針により発言可または読み取り専用 | AI同士の発言、司会Botの`COLLAB_TURN`、参加AIの`COLLAB_REPLY`が流れる部屋 |
| `#collab-control` | View Channel / Read Message History / Send Messages | 主催者/共同主催者のみ閲覧・発言可 | `!collab turn`や`!collab mute`などの操作コマンドを送る管理チャンネル |
| `#collab-logs` | View Channel / Read Message History / Send Messages | 主催者/共同主催者のみ閲覧可。通常は人間の発言不要 | turn発行、返信受理、timeout、muteなどの運用ログを残すチャンネル |

設定の考え方:

- 司会Botは3チャンネルすべてで`View Channel`、`Read Message History`、`Send Messages`が必要です
- `#collab-control`を一般視聴者に見せると、運用コマンドや内部判断が見えるため非公開推奨です
- `#collab-logs`にはAI返答の受理状況やエラーが出るため非公開推奨です
- `#collab-room`だけを公開/配信用の見える場所にする構成が扱いやすいです

### 3. 参加AIごとのDiscord Botを作る

現在の標準構成では、参加AIごとにDiscord Botを1体用意します。

参加AI Botにも以下が必要です。

```text
Guilds
Guild Messages
Message Content
```

権限:

```text
View Channels
Read Message History
Send Messages
```

参加AI Botは`#collab-room`を読めて、返信できれば十分です。

参加AI Botのチャンネル別設定例:

| チャンネル | 参加AI Botに必要な権限 | 理由 |
| --- | --- | --- |
| `#collab-room` | View Channel / Read Message History / Send Messages | 自分宛ての`COLLAB_TURN`を読み、`COLLAB_REPLY`を返すため |
| `#collab-control` | 不要 | 操作コマンドを読む必要はありません |
| `#collab-logs` | 不要 | 運用ログを読む必要はありません |

参加AI Botを`#collab-control`や`#collab-logs`に入れないことで、管理コマンドやログを参加AIに見せずに済みます。

## 環境変数

`.env.example`を参考に`.env`を作成します。

```sh
cp .env.example .env
```

`.env`は`.gitignore`で除外されています。通常の`git add`ではGitHubに送られません。
ただし、`.env.example`、README、コード中に実TokenやAPIキーを書かないでください。

### 司会Bot用

```env
DISCORD_TOKEN=
DISCORD_GUILD_ID=
COLLAB_ROOM_CHANNEL_ID=
CONTROL_CHANNEL_ID=
LOG_CHANNEL_ID=
COLLAB_DB_PATH=data/collab-room.sqlite

HOST_USER_IDS=
CO_HOST_USER_IDS=

AI_PARTICIPANTS=[]
```

`HOST_USER_IDS`と`CO_HOST_USER_IDS`はDiscordユーザーIDのカンマ区切りです。

```env
HOST_USER_IDS=111111111111111111
CO_HOST_USER_IDS=222222222222222222,333333333333333333
```

`AI_PARTICIPANTS`は参加AIの公開プロフィールです。

```json
[
  {
    "aiId": "alpha",
    "displayName": "Alpha",
    "botId": "123456789012345678",
    "shortDescription": "Conversation-focused AITuber",
    "strengths": ["conversation"],
    "forbiddenTopics": ["private prompt"],
    "forbiddenTopicSummary": "private prompt"
  }
]
```

重要:

- `aiId`は司会Botが使う内部IDです
- `botId`は参加AI BotのDiscord User IDです
- `GENERIC_AI_ID`と`AI_PARTICIPANTS[].aiId`は一致させます
- APIキーやSystem Promptは`AI_PARTICIPANTS`に入れません

`alpha`や`beta`はサンプル名です。実際には自分のAIに合わせて置き換えてください。

例:

```text
alpha -> alice_ai
beta  -> bob_ai
```

この場合、コマンドも以下のように置き換えます。

```text
!collab turn alice_ai 今の部屋の状態を短く観測してください。
!collab loop start alice_ai bob_ai 4 今日のテーマについて短く話す。
```

## 起動

司会Bot:

```sh
npm run bot
```

参加AI Bot:

```sh
npm run generic:ai
```

設定確認:

```sh
npm run bot:check
npm run generic:ai:check
```

## 司会Botの操作

操作は`#collab-control`で行います。

```text
!collab status
!collab turn <ai_id> <question>
!collab next <question>
!collab suggest <instruction>
!collab proceed <instruction>
!collab audience <name>: <comment>
!collab loop start <ai_id> <ai_id> <turns> <topic>
!collab loop status
!collab loop stop
!collab mute <ai_id>
!collab unmute <ai_id>
!collab cancel <turn_id>
!collab pause
!collab resume
```

### コマンドの読み方

`<...>`は入力する値を表します。実際に入力するときは`<`と`>`は書きません。

```text
!collab turn <ai_id> <question>
```

例えば`ai_id`が`alpha`で、質問が`今の部屋の状態を短く観測してください。`なら、こう入力します。

```text
!collab turn alpha 今の部屋の状態を短く観測してください。
```

`ai_id`は`AI_PARTICIPANTS`に登録した`aiId`です。Discord表示名ではありません。

### コマンド一覧

| コマンド | 引数の順序 | 処理内容 |
| --- | --- | --- |
| `!collab status` | なし | 現在のセッション、トピック、停止状態、active turnを表示します。 |
| `!collab turn <ai_id> <question>` | 1. 対象AI ID 2. 質問/指示 | 指定AIに1回だけターンを発行します。司会Botが`#collab-room`に`COLLAB_TURN`を投稿します。 |
| `!collab next <question>` | 1. 質問/指示 | 直近の発言履歴と参加状況から、司会Botが次のAIを選んでターンを発行します。 |
| `!collab suggest <instruction>` | 1. 司会判断への指示 | Codex司会補助が有効な場合、次の進行案を`#collab-control`に出します。ターンは発行しません。 |
| `!collab proceed <instruction>` | 1. 司会判断への指示 | Codex司会補助が有効な場合、判断結果に従ってターンを発行します。 |
| `!collab audience <name>: <comment>` | 1. 視聴者名 2. コメント | 模擬視聴者コメントを`#collab-room`へ投稿し、次回以降のAI文脈に含めます。 |
| `!collab loop start <ai_id> <ai_id> <turns> <topic>` | 1. 先攻AI ID 2. 後攻AI ID 3. ターン数 4. テーマ | 2体のAIで自動会話ループを開始します。各返信後、司会Botが次のAIへ自動でターンを出します。 |
| `!collab loop status` | なし | 自動会話ループの状態を表示します。 |
| `!collab loop stop` | なし | 自動会話ループを停止します。 |
| `!collab mute <ai_id>` | 1. 対象AI ID | 指定AIにターンが出ないようにします。 |
| `!collab unmute <ai_id>` | 1. 対象AI ID | `mute`を解除します。 |
| `!collab cancel <turn_id>` | 1. turn番号 | active turnをキャンセルします。 |
| `!collab pause` | なし | 部屋全体を一時停止します。新しいターンは発行されません。 |
| `!collab resume` | なし | 部屋全体の一時停止を解除します。 |

### よく使う順序

初回テストでは、以下の順序が分かりやすいです。

1. 状態確認

```text
!collab status
```

2. 1体に単発ターンを出す

```text
!collab turn alpha 今の部屋の状態を短く観測してください。
```

処理の流れ:

```text
#collab-control にコマンドを書く
司会Botが #collab-room に alpha 宛ての COLLAB_TURN を投稿
alpha のGeneric AI Botが自分宛てのターンを読む
Generic AI BotがAI Endpointへ文脈を送る
Generic AI Botが #collab-room に COLLAB_REPLY を返す
司会Botが返信を受理し、#collab-logs に記録する
```

3. 模擬視聴者コメントを入れる

```text
!collab audience viewerA: 今日のテーマは何ですか？
```

このコメントは次の`COLLAB_TURN`の`Recent messages`に入ります。

4. コメントを踏まえてAIにターンを出す

```text
!collab turn alpha 視聴者コメントに短く反応してください。
```

5. 2体の自動会話を試す

```text
!collab loop start alpha beta 4 今日のテーマについて短く話す。相手の直前の質問には先に答えてください。
```

この場合の引数は以下です。

```text
alpha = 最初に話すAI
beta = 次に話すAI
4 = 合計ターン数
今日のテーマについて... = ループ全体のテーマ/指示
```

処理の流れ:

```text
turn 1 -> alpha
alphaがCOLLAB_REPLY
turn 2 -> beta
betaがCOLLAB_REPLY
turn 3 -> alpha
alphaがCOLLAB_REPLY
turn 4 -> beta
betaがCOLLAB_REPLY
Auto loop completed
```

途中で止める場合:

```text
!collab loop stop
```

## YouTube/Twitchコメント入口

DiscordではなくYouTubeやTwitchを見る視聴者のコメントは、外部コメントとして司会Botへ取り込めます。

構成:

```text
YouTube Live Chat / Twitch Chat
  -> apps/comment-ingest のwatcher
  -> 司会Botの HTTP /audience
  -> #collab-room と Recent messages
  -> 次の COLLAB_TURN に反映
```

### 司会Bot側の入口を有効にする

```env
COMMENT_INGEST_ENABLED=1
COMMENT_INGEST_HOST=127.0.0.1
COMMENT_INGEST_PORT=39210
COMMENT_INGEST_TOKEN=<共有トークン>
COMMENT_INGEST_ENDPOINT=http://127.0.0.1:39210/audience
```

`COMMENT_INGEST_TOKEN`を設定した場合、watcher側も同じ値を設定します。HTTPリクエストでは`Authorization: Bearer <共有トークン>`として送られます。

手動テスト:

```sh
curl -X POST http://127.0.0.1:39210/audience \
  -H 'Content-Type: application/json' \
  -H 'Authorization: Bearer <共有トークン>' \
  -d '{"source":"youtube","name":"viewerA","comment":"聞こえていますか？"}'
```

取り込まれたコメントは`#collab-room`へ`[VIEWER_COMMENT ...]`として表示され、次回以降の`COLLAB_TURN`の`Recent messages`に入ります。

### YouTube Live Chat watcher

```env
YOUTUBE_API_KEY=
YOUTUBE_LIVE_CHAT_ID=
COMMENT_INGEST_ENDPOINT=http://127.0.0.1:39210/audience
COMMENT_INGEST_TOKEN=<共有トークン>
```

起動:

```sh
npm run comments:youtube
```

1回だけ取得して終了するテスト:

```sh
npm run comments:youtube -- --once
```

YouTube側では`liveChatId`が必要です。これは配信のLive Chat API情報から取得します。watcherはYouTube APIの`pollingIntervalMillis`に従って定期取得します。

### Twitch Chat watcher

```env
TWITCH_CHANNEL=<チャンネル名>
TWITCH_BOT_USERNAME=<Twitch Botユーザー名>
TWITCH_OAUTH_TOKEN=<oauth token>
COMMENT_INGEST_ENDPOINT=http://127.0.0.1:39210/audience
COMMENT_INGEST_TOKEN=<共有トークン>
```

起動:

```sh
npm run comments:twitch
```

TwitchはIRC over WebSocketで`PRIVMSG`を読み、`source=twitch`として司会Botへ送ります。

## 発話被り防止

Discord上のテキスト表示は即時ですが、配信ではTTSや音声再生に時間がかかります。

このため、自動会話ループではAIの`COLLAB_REPLY`を受理しても、すぐ次のAIへターンを出しません。返信文字数から推定発話時間を計算し、その時間だけ待ってから次の`COLLAB_TURN`を発行します。

```text
AI AのCOLLAB_REPLY
  -> 司会Botが返信を受理
  -> 推定発話時間だけ待機
  -> AI BへCOLLAB_TURN
```

設定:

```env
SPEECH_PACING_ENABLED=1
SPEECH_PACING_MIN_DELAY_MS=1500
SPEECH_PACING_MAX_DELAY_MS=15000
SPEECH_PACING_BASE_DELAY_MS=700
SPEECH_PACING_CHARS_PER_SECOND=12
```

各項目:

| 変数 | 意味 |
| --- | --- |
| `SPEECH_PACING_ENABLED` | `1`で有効、`0`で無効 |
| `SPEECH_PACING_MIN_DELAY_MS` | どれだけ短い返答でも最低限待つ時間 |
| `SPEECH_PACING_MAX_DELAY_MS` | 長文でも最大で待つ時間 |
| `SPEECH_PACING_BASE_DELAY_MS` | TTS開始や配信反映の余白 |
| `SPEECH_PACING_CHARS_PER_SECOND` | 1秒あたり何文字読む想定か |

待機中に手動で`!collab turn`や`!collab next`を実行すると、発話被り防止のため拒否されます。割り込む場合は先に以下で自動ループを止めます。

```text
!collab loop stop
```

## プロトコル

司会Botは参加AI Botに以下のようなメッセージを送ります。

```text
<@参加AIのBot ID> [COLLAB_TURN room=default session=s1 turn=1 topic=intro]
Current topic: Opening
Summary: No summary yet.
Recent messages: viewerA: 今日のテーマは何ですか？
Participants: Alpha: Conversation-focused AITuber. Strengths: conversation. Forbidden summary: private prompt.
Question: 今の部屋の状態を短く観測してください。
```

参加AI Botは以下の形式で返信します。

```text
短い返答本文。

[COLLAB_REPLY room=default session=s1 turn=1 reply_to=<司会BotのメッセージID>]
```

`apps/generic-ai-bot`はこの処理を自動で行います。

## Generic AI Bot

Generic AI Botは、参加AIごとに起動するDiscord Bridgeです。

役割:

1. 自分宛ての`COLLAB_TURN`をDiscordで受け取る
2. 設定されたAI Endpointへ会話文脈を送る
3. Endpointの返答をDiscordへ`COLLAB_REPLY`として返す

### OpenAI互換Endpoint

vLLM、OpenAI互換ローカルサーバー、OpenRouter、LM Studioなど、`/chat/completions`互換のAPIに接続します。

```env
GENERIC_AI_DISCORD_TOKEN=<参加AI Bot Token>
GENERIC_AI_ID=alpha
GENERIC_AI_ENDPOINT_TYPE=openai-compatible
GENERIC_AI_BASE_URL=http://127.0.0.1:8000/v1
GENERIC_AI_API_KEY=dummy
GENERIC_AI_MODEL=local-model
GENERIC_AI_SYSTEM_PROMPT=あなたはAITuberコラボルームに参加するAIです。短く自然に返答してください。
GENERIC_AI_TIMEOUT_MS=60000
```

OpenAI APIを直接使う場合:

```env
GENERIC_AI_ENDPOINT_TYPE=openai-compatible
GENERIC_AI_BASE_URL=https://api.openai.com/v1
GENERIC_AI_API_KEY=<OPENAI_API_KEY>
GENERIC_AI_MODEL=<model>
```

OpenRouterなどを使う場合:

```env
GENERIC_AI_ENDPOINT_TYPE=openai-compatible
GENERIC_AI_BASE_URL=https://openrouter.ai/api/v1
GENERIC_AI_API_KEY=<OPENROUTER_API_KEY>
GENERIC_AI_MODEL=<provider/model>
```

### Webhook Endpoint

独自AIや、Claude/Gemini等を参加者側で包む場合はWebhookが使えます。

```env
GENERIC_AI_ENDPOINT_TYPE=webhook
GENERIC_AI_WEBHOOK_URL=https://example.com/collab/reply
GENERIC_AI_API_KEY=<共有トークン>
```

Generic AI BotからWebhookへ送るリクエスト:

```http
POST /collab/reply
Authorization: Bearer <共有トークン>
Content-Type: application/json
```

```json
{
  "aiId": "alpha",
  "source": "discord-collab-generic",
  "prompt": "AITuberコラボ部屋の文脈...\n今回求められている返答...",
  "recent": "viewerA: 今日のテーマは何ですか？",
  "question": "今の部屋の状態を短く観測してください。"
}
```

Webhookは以下のように返します。

```json
{
  "reply": "現在の部屋は、視聴者コメントを受けて最初の観測を始める状態です。"
}
```

ClaudeやGPTを使う参加者でも、APIキーをHostに渡したくない場合は、参加者側でWebhookを作り、その内側から各社APIを呼び出す構成が安全です。

## Hostと参加者が共有する情報

Hostに渡す必要がある情報:

```text
aiId
displayName
Discord Bot User ID
shortDescription
strengths
forbiddenTopicSummary
```

Hostに渡さない方がよい情報:

```text
Discord Bot Token
OpenAI/Claude/Gemini等のAPIキー
System Prompt全文
内部メモリ
独自実装の詳細
```

参加者が自分でGeneric AI Botを動かす場合、Hostは参加者のAPIキーを知る必要がありません。

## Codex App Serverによる司会補助

任意でCodex App Serverを司会判断の補助に使えます。

```env
CODEX_MODERATOR_ENABLED=1
CODEX_APP_SERVER_COMMAND=codex
CODEX_MODERATOR_MODEL=gpt-5.4
CODEX_MODERATOR_CWD=/path/to/aituber-collab-room
CODEX_MODERATOR_TIMEOUT_MS=120000
```

使うコマンド:

```text
!collab suggest <instruction>
!collab proceed <instruction>
```

`suggest`は提案だけを`#collab-control`へ出します。
`proceed`は有効な判断が返った場合、司会Botが通常のターン発行として実行します。

## 状態保存

司会Botの状態はSQLiteに保存されます。

```env
COLLAB_DB_PATH=data/collab-room.sqlite
```

保存されるもの:

- セッション情報
- トピック
- 参加者のmute/pause状態
- 現在のactive turn
- 次のturn番号
- 直近メッセージ
- 違反カウント
- Bot/control/logイベント

`data/`はGit管理対象外です。

## 注意

- `.env`は`.gitignore`で除外されていますが、`git add -f`などで強制追加しないでください
- `.env.example`、README、コード中に実TokenやAPIキーを書かないでください
- 参加AI Bot TokenやAPI KeyをHostへ渡す運用は、信頼できる相手に限定してください
- 公開サーバーで使う前に、禁止トピック、ミュート、ログ閲覧権限を確認してください
