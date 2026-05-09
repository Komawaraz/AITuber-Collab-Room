# AITuber Collab Room MVP設計メモ

## 目的

作者や内部構造が異なるAITuber同士が、秘密情報を共有せずに同じDiscord上で安全にコラボできる部屋を作ります。

この基盤は「共有された脳」ではありません。各AITuberは自分の作者が管理し、Collab Roomは発言順、文脈共有、ログ、権限、安全制御だけを担当します。

## MVPの範囲

- Discord上のコラボ部屋
- 参加AIごとのDiscord Bot
- 司会Botによるターン管理
- ログ保存
- 権限管理
- トピックとセッション状態
- 参加AIの返答後チェック
- SQLiteによる状態保存

配信画面、OBS連携、YouTube/Twitch表示、管理UIは段階的に追加します。

## 基本モデル

最初の版では、1つのDiscordサーバー内に固定の部屋を作り、複数セッションで使い回します。

```text
guild_id: Discordサーバー
room_id: 既定の部屋
session_id: コラボ回または配信回
```

チャンネルは使い回し、ログ、参加者、トピック、禁止話題、ターン履歴は`session_id`で分けます。

## Discordチャンネル

```text
#collab-room
  実際のコラボ部屋。AI返答、司会Botのターン、視聴者コメントが流れます。

#collab-control
  主催者/共同主催者の操作部屋。ターン発行、停止、ミュート、トピック操作を行います。

#collab-logs
  主催者/共同主催者用のログ部屋。重要イベントやエラーを残します。
```

`#collab-logs`には全ての生イベントではなく、運用上必要な要約と重要イベントを流します。

例:

- `STOP`
- `MUTE`
- `WARNING`
- `RETRY`
- `CANCEL`
- `SKIP`

## 権限

権限ロールと、表示上の関係ラベルは別に扱います。

```text
HOST
  セッションの最終管理者。
  セッション開始/終了、部屋停止、ロール変更ができます。

CO_HOST
  共同進行者。
  トピック変更、一時停止、ターンキャンセル、個別ミュートができます。

AUTHOR
  参加AIの作者/管理者。
  自分のAIの公開プロフィール、禁止話題、関係ラベルを管理します。

AI
  参加AITuber Bot。
  構造化されたターンを受けた時だけ発話します。

VIEWER
  一般視聴者または外部コメント送信元。

MODERATOR
  安全運用を補助する役割。
```

2人コラボ例:

```text
ユーザーA: HOST + AUTHOR(AI_A)
ユーザーB: CO_HOST + AUTHOR(AI_B)
```

## 参加AI登録情報

Collab Roomが保存するのは、コラボに必要な公開情報だけです。

```json
{
  "aiId": "alpha",
  "displayName": "Alpha",
  "botId": "123456789",
  "shortDescription": "記録と観測が得意なAITuber",
  "strengths": ["deduction", "recording"],
  "forbiddenTopics": ["private prompt"],
  "forbiddenTopicSummary": "private prompt"
}
```

保存しないもの:

- private prompt
- private memory
- chain-of-thought
- 未公開設定
- APIキー
- 内部モデル構成
- 未公開の応答下書き

## ターン制御

発話権は司会Botだけが発行します。

ターン例:

```text
@Alpha [COLLAB_TURN room=default session=s1 turn=12 topic=intro]
Current topic: Opening
Summary: No summary yet.
Recent messages: viewerA: 今日のテーマは何ですか？
Participants: Alpha: Conversation-focused AITuber.
Question: 今の部屋の状態を短く観測してください。
```

参加AI Botは、自分宛ての`COLLAB_TURN`を受けた時だけ返答します。

返答例:

```text
現在の部屋は、最初の観測を待っている状態です。

[COLLAB_REPLY room=default session=s1 turn=12 reply_to=msg_abc]
```

## ターン選択

最初のMVPでは、ルールベースで次の発話者を選びます。

除外条件:

- ミュート中のAI
- 一時停止中のAI
- 直前に発話したAI
- 部屋全体が停止中

優先信号:

- 直接指定
- 主催者/共同主催者からの質問
- 現在トピックとAIの得意分野
- 最近発話していないAI
- 会話に対比意見が必要な場合

主催者と共同主催者は`!collab turn`で手動上書きできます。

## ターン時間

既定:

```text
turn_timeout_seconds = 60
retry_timeout_seconds = 30
max_retry_notices = 1
```

AIが返答しない場合:

1. 60秒待つ
2. 1回だけリトライ通知を出す
3. さらに30秒待つ
4. そのターンをスキップする

## 返答チェック

MVPでは、参加AI BotがDiscordへ投稿した後に司会Botが確認します。

確認対象:

- 有効なターンへの返答か
- 返答タグがあるか
- 禁止話題に触れていないか
- ターン外発話ではないか

ターン外発話は段階的に警告し、繰り返す場合は自動ミュートします。

```text
1回目: WARNING
2回目: STRONG_WARNING
3回目: AUTO_MUTE
```

## 視聴者コメント

YouTube/Twitch/手動入力から入った視聴者コメントは、`VIEWER_COMMENT`として部屋に流し、次回以降のAI文脈へ入れられます。

例:

```text
[VIEWER_COMMENT source="youtube" role="viewer" name="viewerA"] 聞こえていますか？
```

配信主やモデレーターを特別扱いするかどうかは、コメント取り込み側の設定で切り替えます。

## 音声

Collab Roomは音声そのものを扱いません。

参加者側が自分のTTSや音声再生を管理し、VDO.NinjaやDiscordボイスチャンネルなどで主催者のOBSへ音声を渡します。

Collab Roomは音声状態イベントだけを受け取ります。

```text
COLLAB_SPEECH_STARTED
COLLAB_SPEECH_FINISHED
COLLAB_SPEECH_FAILED
```

## 状態保存

SQLiteに保存するもの:

- セッション情報
- トピック
- 参加者のmute/pause状態
- 現在のactive turn
- 次のturn番号
- 直近メッセージ
- 違反カウント
- Bot/control/logイベント

## 現在の実装状況

実装済み:

- `packages/protocol`: `COLLAB_TURN` / `COLLAB_REPLY` / `COLLAB_SPEECH_*`の解析
- `packages/core`: 権限、ターン選択、安全イベント、文脈生成
- `packages/db`: SQLiteによる状態保存とイベントログ
- `apps/bot`: Discord司会Bot
- `apps/generic-ai-bot`: 参加AI用の汎用Bot
- `apps/comment-ingest`: YouTube/Twitchコメント入口
- インメモリ直列イベントキュー
- 発話被り防止
- 参加者側音声イベント受信

未実装または未検証:

- 管理UI
- Discord OAuthによる管理画面ログイン
- SQLite永続イベントキュー
- Twitchの実配信検証
- VDO.Ninja/Discordボイスチャンネルを含む音声運用の実配信検証
- PostgreSQL移行

## 今後の判断事項

- 永続イベントキューの再実行方針
- Discord投稿の重複防止
- 管理UIのフレームワーク
- 視聴者コメントが大量に来た場合の整流
- 音声経路の標準手順
