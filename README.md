# AITuber Collab Room

> 状態: アルファ版 / 実験中
>
> YouTube Live Chatのコメント取得は実配信で確認済みです。Twitch連携、長時間配信、音声経路の総合検証はまだ未完了です。
>
> ライセンス: MIT

AITuber同士が安全にコラボするための、Discord中心のコラボルーム基盤です。

司会Botが発言順、権限、ログ、状態保存を管理し、各参加AIは自分のDiscord BotとAI接続先を使って参加します。参加AIの内部実装は統一せず、外側の接続形式だけを揃えます。

## できること

- Discord上で参加AIごとにターンを発行する
- 参加AIの返答を`COLLAB_REPLY`として受け付ける
- 主催者、共同主催者、視聴者の権限を分ける
- 発言順、ミュート、停止、リトライ、タイムアウトを管理する
- 直近会話、参加者情報、セッション要約をAIへ渡す
- YouTube/Twitchなど外部配信コメントを取り込む入口を用意する
- 自動会話ループと発話被り防止を使う
- 参加者側の音声再生イベントを受け取り、次ターン制御に使う
- OpenAI互換APIまたはWebhookを持つAIを参加させる
- 任意でCodex App Serverを司会判断の補助に使う

## 重要な考え方

このプロジェクトは、参加AIの中身や声モデルを主催者へ集約しません。
主催者が自分のAIを出す場合、そのAIも参加AIの1体として扱います。

```text
主催者側:
  司会Bot
  Discordチャンネル
  ターン管理
  ログ
  主催者AI Bot
  主催者AI本体
  主催者AIのTTS/音声再生

参加者側:
  参加AI Bot
  AI本体
  APIキー
  システムプロンプト
  TTS/音声再生
```

主催者AIは主催者側で動かし、外部参加AIは参加者側で動かします。参加者は主催者へBotトークンやAI APIキーを渡す必要はありません。主催者へ渡すのは、Bot追加URL、BotユーザーID、公開プロフィールなど最小限の情報です。

## 全体構成

```text
Discordサーバー
  #collab-room      コラボ部屋
  #collab-control   主催者用の操作チャンネル
  #collab-logs      司会Botのログチャンネル

司会Bot
  apps/bot

参加AI用の汎用Bot
  apps/generic-ai-bot

参加AIの接続先
  OpenAI互換API または Webhook

外部コメント取得
  apps/comment-ingest
```

## 詳細ドキュメント

READMEは入口だけにしています。詳しい手順は以下を参照してください。

| 内容 | 参照先 |
| --- | --- |
| セットアップ、Discord Bot、環境変数、コマンド | [docs/operation-guide.md](docs/operation-guide.md) |
| 参加者側の音声を配信へ乗せる方法 | [docs/audio-routing.md](docs/audio-routing.md) |
| イベントキューの現在仕様と今後 | [docs/event-queue-notes.md](docs/event-queue-notes.md) |
| MVP設計メモ | [docs/aituber-collab-room-mvp.md](docs/aituber-collab-room-mvp.md) |

## 動作環境の目安

Collab Roomの制御基盤そのものは軽量です。重いのはAI本体、TTS、OBS、音声ルーティングです。

```text
司会Botのみ:
  RAM 2GB〜4GB

司会Bot + OBS + 主催者AI + 主催者AIのTTS:
  RAM 16GB以上
  GPU VRAM 16GB以上推奨
  初期導入はNVIDIA GPU推奨
  AMD GPUはROCm対応環境なら利用可能な場合あり

外部参加者が自分のAIをWebhookで持ち込む場合:
  参加者AIの推論負荷は主催者側GPUには基本的に乗りません
```

詳しい目安は [docs/operation-guide.md](docs/operation-guide.md) の「動作環境の目安」を参照してください。

## 最短セットアップ

```sh
git clone https://github.com/Komawaraz/AITuber-Collab-Room.git
cd AITuber-Collab-Room
npm install
npm test
cp .env.example .env
```

`.env`にDiscord Botトークン、チャンネルID、参加AI設定を入れます。各値の参照方法は [docs/operation-guide.md](docs/operation-guide.md) を参照してください。

## 起動

司会Bot:

```sh
npm run bot
```

参加AI用の汎用Bot:

```sh
npm run generic:ai
```

YouTubeコメント取得:

```sh
npm run comments:youtube
```

Twitchコメント取得:

```sh
npm run comments:twitch
```

## 基本コマンド

操作は`#collab-control`で行います。

```text
!collab status
!collab turn <ai_id> <question>
!collab next <question>
!collab audience <name>: <comment>
!collab loop start <ai_id> <ai_id> <turns> <topic>
!collab loop start <ai_id> <ai_id> until_end <topic>
!collab loop status
!collab loop stop
!collab mute <ai_id>
!collab unmute <ai_id>
!collab pause
!collab resume
```

例:

```text
!collab turn alpha 今の部屋の状態を短く観測してください。
!collab loop start alpha beta 4 今日のテーマについて短く話す。
!collab loop start alpha beta until_end 休日の過ごし方について短く雑談する。
```

## 参加AI Botを主催者のサーバーへ入れる

参加者はDiscord Developer PortalでBot追加URLを生成し、主催者へ渡します。

必要な設定:

```text
Scopes:
  bot

Bot Permissions:
  View Channels
  Read Message History
  Send Messages
```

主催者はそのURLから自分のDiscordサーバーへBotを追加します。単発コラボ終了後は、不要になった参加AI BotをサーバーからKickする運用を推奨します。

## 音声について

Collab Roomは音声そのものを運びません。

参加者側が自分のTTS音声を再生し、VDO.NinjaやDiscordボイスチャンネルなど別経路で主催者のOBSへ音声を渡します。Collab Roomは以下のイベントで発話状態だけを管理します。

```text
[COLLAB_SPEECH_STARTED room=default session=s1 turn=1 audio_id=<任意ID>]
[COLLAB_SPEECH_FINISHED room=default session=s1 turn=1 audio_id=<任意ID>]
[COLLAB_SPEECH_FAILED room=default session=s1 turn=1 audio_id=<任意ID> reason=<短い理由>]
```

参加AI用の汎用Botでは、`GENERIC_AI_SPEECH_*`設定によりWebhookまたはローカルコマンド経由でTTS再生を呼び、上記イベントを自動投稿できます。

推奨構成:

```text
参加者:
  AI -> TTS -> 仮想オーディオ -> VDO.Ninja

主催者:
  VDO.Ninja -> OBSブラウザソース -> 配信
```

簡易構成:

```text
参加者:
  AI -> TTS -> 仮想マイク -> Discordボイスチャンネル

主催者:
  Discord音声 -> OBS音声キャプチャ -> 配信
```

詳細は [docs/audio-routing.md](docs/audio-routing.md) を参照してください。

## 現在のイベント処理

司会Botはインメモリの直列イベントキューで、Discordイベント、外部コメント、タイマー処理を1件ずつ処理します。

これは状態更新の競合を避けるための仕組みです。永続ジョブキューではないため、Botプロセス終了時に未処理イベントを再実行する保証はありません。

## 次の実装候補

優先度の高い順です。

1. SQLite永続イベントキュー
2. VDO.Ninja/Discord VCを含む音声運用の実配信テスト
3. YouTube/Twitchコメントの整流、優先度、フィルタ
4. 管理UI
5. 主催者向け手順と参加者向け手順のさらなる分離

## 注意

- `.env`はGit管理対象外です
- Token、APIキー、OAuthトークン、システムプロンプト全文は共有・公開しないでください
- `#collab-control`と`#collab-logs`は主催者/共同主催者だけが見られる権限にしてください
- 参加AI Botは原則として`#collab-room`だけ読めれば十分です
- 外部参加者のBotは、単発コラボ終了後にKickする運用を推奨します
