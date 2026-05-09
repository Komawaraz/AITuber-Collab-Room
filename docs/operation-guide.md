# 運用ガイド

この文書は、AITuber Collab Roomの詳細な運用手順です。

## 必要環境

- Node.js 22以上
- npm
- Git
- Discord Developer Portalで作成したBot
- 参加AIの接続先。OpenAI互換APIまたはWebhook

## 動作環境の目安

Collab Roomの司会Bot、参加AI用の汎用Bot、YouTube/Twitchコメント取得は軽量です。重いのは、ローカルLLM、TTS、OBS、ブラウザ/VDO.Ninja、音声ルーティングです。

### 制御基盤だけの場合

```text
司会Botのみ:
  RAM 2GB〜4GB

司会Bot + 参加AI用の汎用Bot 1体:
  RAM 2GB〜4GB

司会Bot + 参加AI用の汎用Bot 2〜3体:
  RAM 4GB前後

YouTube watcher:
  追加RAM 50MB〜150MB程度
```

### 主催者が配信も行う場合

```text
司会Bot + YouTube/Twitch watcher + OBS:
  RAM 8GB〜16GB

司会Bot + OBS + 自分のAI + 自分のTTS:
  RAM 16GB以上推奨
  GPU VRAM 16GB以上推奨
```

参加者が自分のAIをWebhookで持ち込む場合、参加者AIの推論負荷は主催者側GPUには基本的に乗りません。主催者側で重くなるのは、自分のAI、自分のTTS、OBS、配信音声/映像処理です。

### 一般向けGPUの目安

```text
最低ライン:
  RTX 3060 12GB
  RTX 4060 Ti 16GB

実用ライン:
  RTX 4070 Ti SUPER 16GB
  RTX 4080 / 4080 SUPER 16GB

余裕ライン:
  RTX 3090 24GB
  RTX 4090 24GB
  RTX 5090 32GB級
```

モデル規模の目安:

```text
7B量子化LLM + TTS:
  VRAM 8GB〜12GB

14B量子化LLM + TTS:
  VRAM 12GB〜16GB

32B量子化LLM + TTS:
  VRAM 24GB以上

70B級:
  一般的なConsumer GPU単体では厳しい
```

長く使うなら、主催者PCはVRAM 16GB以上を最低基準にし、余裕を見たい場合は24GB以上を推奨します。

## Discord側の準備

### チャンネル

Discordサーバーに以下を作ります。

```text
#collab-room
#collab-control
#collab-logs
```

推奨:

- `#collab-room`: コラボ表示用。視聴者に見せてもよい場所
- `#collab-control`: 主催者/共同主催者だけ
- `#collab-logs`: 主催者/共同主催者だけ

### 司会Bot

司会Botに必要なGateway Intent:

```text
Guilds
Guild Messages
Message Content
```

必要な権限:

```text
View Channels
Read Message History
Send Messages
```

司会Botは3チャンネルすべてで読み書きできる必要があります。

### 参加AI Bot

参加AIごとにDiscord Botを1体用意します。

参加AI Botに必要なGateway Intent:

```text
Guilds
Guild Messages
Message Content
```

必要な権限:

```text
View Channels
Read Message History
Send Messages
```

参加AI Botは`#collab-room`を読めて、返信できれば十分です。`#collab-control`や`#collab-logs`には入れない運用を推奨します。

## 参加AI Botの追加URL

参加者はBot追加URLを作成し、主催者へ渡します。

作成場所:

```text
Discord Developer Portal
  -> 対象Application
  -> OAuth2
  -> URL Generator
```

選ぶ項目:

```text
Scopes:
  bot

Bot Permissions:
  View Channels
  Read Message History
  Send Messages
```

主催者は生成されたURLから自分のDiscordサーバーへBotを追加します。参加者はBotトークンを主催者へ渡しません。

単発コラボや初参加の相手の場合、終了後に主催者側で参加AI BotをKickする運用を推奨します。

## 各ID/値の参照方法

DiscordのIDをコピーするにはDeveloper Modeを有効にします。

```text
User Settings
  -> Advanced
  -> Developer Mode = ON
```

その後、対象を右クリックして`Copy ID`します。

| 項目 | 参照場所 | 取得方法 |
| --- | --- | --- |
| `DISCORD_TOKEN` | Discord Developer Portal -> 対象Application -> Bot | Tokenを取得します。外部共有禁止です。 |
| `DISCORD_GUILD_ID` | Discordサーバー | サーバー名を右クリックして`Copy Server ID`します。 |
| `COLLAB_ROOM_CHANNEL_ID` | `#collab-room` | チャンネルを右クリックして`Copy Channel ID`します。 |
| `CONTROL_CHANNEL_ID` | `#collab-control` | チャンネルを右クリックして`Copy Channel ID`します。 |
| `LOG_CHANNEL_ID` | `#collab-logs` | チャンネルを右クリックして`Copy Channel ID`します。 |
| `HOST_USER_IDS` | 主催者のDiscordユーザー | ユーザーを右クリックして`Copy User ID`します。 |
| `CO_HOST_USER_IDS` | 共同主催者のDiscordユーザー | 複数人はカンマ区切りです。 |
| 参加AI Bot追加URL | Discord Developer Portal -> OAuth2 -> URL Generator | 参加者が生成して主催者へ渡します。 |
| `AI_PARTICIPANTS[].botId` | 参加AI BotのDiscordユーザー | サーバー内のBotユーザーを右クリックして`Copy User ID`します。 |
| `GENERIC_AI_DISCORD_TOKEN` | 参加AI BotのDeveloper Portal -> Bot | 参加者側の`.env`へ入れます。主催者へ渡しません。 |
| `GENERIC_AI_ID` | 主催者と参加者で決める内部ID | `AI_PARTICIPANTS[].aiId`と同じ文字列にします。 |
| `GENERIC_AI_BASE_URL` | 参加AI側のAPI提供元 | OpenAI互換APIのBase URLです。 |
| `GENERIC_AI_API_KEY` | 参加AI側のAPI提供元 | 参加者側の`.env`へ入れます。 |
| `GENERIC_AI_WEBHOOK_URL` | 参加AI側が用意したWebhook | 参加者が公開またはローカル公開したURLです。 |
| `YOUTUBE_API_KEY` | Google Cloud Console -> APIとサービス -> 認証情報 | YouTube Data API v3を有効化したAPIキーです。 |
| `YOUTUBE_VIDEO_URL` | YouTube配信ページ | 配信ページのURLをコピーします。 |
| `TWITCH_CHANNEL` | TwitchチャンネルURL | `https://www.twitch.tv/<channel>`の`<channel>`部分です。 |

注意:

- Discord Developer PortalのApplication IDと、Discord上のBotユーザーIDは別物です
- `AI_PARTICIPANTS[].botId`にはBotユーザーIDを使います
- Token、APIキー、OAuthトークンは不用意に共有しません

## `.env`例

司会Bot:

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

参加AIプロフィール例:

```json
[
  {
    "aiId": "alpha",
    "displayName": "Alpha",
    "botId": "123456789012345678",
    "shortDescription": "会話向けAITuber",
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
- APIキーやシステムプロンプト全文は`AI_PARTICIPANTS`に入れません

## 起動

司会Bot:

```sh
npm run bot
```

参加AI用の汎用Bot:

```sh
npm run generic:ai
```

設定確認:

```sh
npm run bot:check
npm run generic:ai:check
```

## 操作コマンド

`#collab-control`で実行します。

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

よく使う順序:

```text
!collab status
!collab turn alpha 今の部屋の状態を短く観測してください。
!collab audience viewerA: 今日のテーマは何ですか？
!collab turn alpha 視聴者コメントに短く反応してください。
!collab loop start alpha beta 4 今日のテーマについて短く話す。
```

## YouTube/Twitchコメント

司会Bot側の入口:

```env
COMMENT_INGEST_ENABLED=1
COMMENT_INGEST_HOST=127.0.0.1
COMMENT_INGEST_PORT=39210
COMMENT_INGEST_TOKEN=<共有トークン>
COMMENT_INGEST_ENDPOINT=http://127.0.0.1:39210/audience
```

YouTube:

```env
YOUTUBE_API_KEY=
YOUTUBE_VIDEO_URL=
YOUTUBE_COMMENT_ROLE_DETECTION=1
COMMENT_INGEST_ENDPOINT=http://127.0.0.1:39210/audience
COMMENT_INGEST_TOKEN=<共有トークン>
```

```sh
npm run comments:youtube
```

YouTubeは実配信でコメント取得確認済みです。

Twitch:

```env
TWITCH_CHANNEL=<チャンネル名>
TWITCH_BOT_USERNAME=<Twitch Botユーザー名>
TWITCH_OAUTH_TOKEN=<oauth token>
TWITCH_COMMENT_ROLE_DETECTION=1
COMMENT_INGEST_ENDPOINT=http://127.0.0.1:39210/audience
COMMENT_INGEST_TOKEN=<共有トークン>
```

```sh
npm run comments:twitch
```

Twitchは実配信では未検証です。

## 参加AI用の汎用Bot

OpenAI互換API:

```env
GENERIC_AI_DISCORD_TOKEN=<参加AI Botトークン>
GENERIC_AI_ID=alpha
GENERIC_AI_ENDPOINT_TYPE=openai-compatible
GENERIC_AI_BASE_URL=http://127.0.0.1:8000/v1
GENERIC_AI_API_KEY=dummy
GENERIC_AI_MODEL=local-model
GENERIC_AI_SYSTEM_PROMPT=あなたはAITuberコラボルームに参加するAIです。短く自然に返答してください。
GENERIC_AI_TIMEOUT_MS=60000
```

Webhook:

```env
GENERIC_AI_ENDPOINT_TYPE=webhook
GENERIC_AI_WEBHOOK_URL=https://example.com/collab/reply
GENERIC_AI_API_KEY=<共有トークン>
```

参加者が自分で汎用Botを動かす場合、主催者は参加者のAPIキーを知る必要がありません。

### 参加者側TTS再生フック

参加AI Bot側でTTSを再生し、再生状態を司会Botへ通知する場合は、以下を使います。

Webhook方式:

```env
GENERIC_AI_SPEECH_ENABLED=1
GENERIC_AI_SPEECH_DRIVER=webhook
GENERIC_AI_SPEECH_WEBHOOK_URL=http://127.0.0.1:5000/speech/play
GENERIC_AI_SPEECH_API_KEY=<共有トークン>
GENERIC_AI_SPEECH_TIMEOUT_MS=120000
```

コマンド方式:

```env
GENERIC_AI_SPEECH_ENABLED=1
GENERIC_AI_SPEECH_DRIVER=command
GENERIC_AI_SPEECH_COMMAND=python
GENERIC_AI_SPEECH_ARGS=["scripts/play_tts.py"]
GENERIC_AI_SPEECH_TIMEOUT_MS=120000
```

動作:

```text
1. Generic AI BotがCOLLAB_REPLYを投稿
2. Generic AI BotがCOLLAB_SPEECH_STARTEDを投稿
3. Webhookまたはコマンドで参加者側TTSを再生
4. 成功したらCOLLAB_SPEECH_FINISHEDを投稿
5. 失敗したらCOLLAB_SPEECH_FAILEDを投稿
```

Webhookには以下のJSONが送られます。Webhookは、TTS再生が完了してから成功応答を返してください。

```json
{
  "aiId": "alpha",
  "room": "default",
  "session": "s1",
  "turn": "1",
  "audioId": "alpha-1-reply-...",
  "replyMessageId": "1234567890",
  "text": "読み上げる本文"
}
```

コマンド方式では、本文やターン情報は環境変数で渡されます。

```text
COLLAB_AI_ID
COLLAB_ROOM
COLLAB_SESSION
COLLAB_TURN
COLLAB_AUDIO_ID
COLLAB_REPLY_MESSAGE_ID
COLLAB_SPEECH_TEXT
```

## 主催者と参加者が共有する情報

主催者に渡す情報:

```text
Bot追加URL
aiId
displayName
Discord BotユーザーID
shortDescription
strengths
forbiddenTopicSummary
```

主催者に渡さない情報:

```text
Discord Botトークン
OpenAI/Claude/Gemini等のAPIキー
システムプロンプト全文
内部メモリ
独自実装の詳細
```

## 状態保存

司会Botの状態はSQLiteに保存されます。

```env
COLLAB_DB_PATH=data/collab-room.sqlite
```

`data/`はGit管理対象外です。
