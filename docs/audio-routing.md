# 音声を配信へ乗せる方法

この文書は、参加者側の音声を主催者の配信へ乗せるための運用メモです。

## 基本方針

Collab Roomは音声そのものを送受信しません。

参加者側が自分のTTS音声を再生し、別経路で主催者のOBSへ送ります。Collab Roomは以下のイベントで発話状態だけを管理します。

```text
[COLLAB_SPEECH_STARTED room=default session=s1 turn=1 audio_id=<任意ID>]
[COLLAB_SPEECH_FINISHED room=default session=s1 turn=1 audio_id=<任意ID>]
[COLLAB_SPEECH_FAILED room=default session=s1 turn=1 audio_id=<任意ID> reason=<短い理由>]
```

`SPEECH_PACING_WAIT_FOR_EVENTS=1`にすると、司会Botは参加AI側の再生完了イベントを待ってから次ターンへ進みます。

## 推奨方式: VDO.Ninja

参加者:

```text
AI
  -> TTS
  -> 仮想オーディオデバイス
  -> VDO.Ninja
```

主催者:

```text
VDO.Ninja
  -> OBSブラウザソース
  -> 配信
```

利点:

- 参加者ごとに音声ソースを分けやすい
- 主催者側OBSで個別に音量調整しやすい
- Discordボイスチャンネルより音質や遅延を調整しやすい
- 主催者が参加者のTTS環境や声モデルを持たなくてよい

注意:

- 参加者側に仮想オーディオ設定が必要です
- 配信前に、主催者のOBSへ音が届くか必ず確認します
- 参加者ごとにVDO.Ninjaリンクを分けると管理しやすいです

## 簡易方式: Discordボイスチャンネル

参加者:

```text
AI
  -> TTS
  -> 仮想マイク
  -> Discordボイスチャンネル
```

主催者:

```text
Discord音声
  -> OBS音声キャプチャ
  -> 配信
```

利点:

- 導入が簡単です
- 参加者へ説明しやすいです
- Discordだけで完結しやすいです

注意:

- 参加者ごとの音量分離が難しい場合があります
- Discordのノイズ抑制、自動ゲイン、エコー除去がTTS音声に悪影響を出す場合があります
- 通知音や他の音が混ざらないように設定してください

## 仮想オーディオ例

- VB-CABLE
- VoiceMeeter
- BlackHole
- PipeWire
- PulseAudio

## 参加者側に必要なもの

- 参加AI Bot
- AI応答生成環境
- TTS再生環境
- 仮想オーディオデバイス
- VDO.NinjaまたはDiscordボイスチャンネル
- `COLLAB_SPEECH_*`を投稿する処理

## 主催者側に必要なもの

- OBS
- VDO.Ninjaブラウザソース、またはDiscord音声キャプチャ
- 参加者ごとの音量調整
- 配信用の音声モニタリング

## 同期の考え方

音声の実再生タイミングは、VDO.NinjaやDiscordボイスチャンネル側に依存します。

Collab Roomは、参加AI Botが送る`COLLAB_SPEECH_FINISHED`を信頼して次ターンへ進みます。そのため、参加AI BotはTTS再生が本当に終わったタイミングで`COLLAB_SPEECH_FINISHED`を投稿してください。

イベントが来ない場合は、推定発話時間で代替処理して次ターンへ進みます。

## 配信前チェック

- 主催者のOBSへ参加者のTTS音声が届くこと
- 参加者ごとの音量差が大きすぎないこと
- TTS音声以外の通知音が混ざらないこと
- 主催者側の音声が参加者側へ戻ってループしないこと
- `COLLAB_SPEECH_STARTED`と`COLLAB_SPEECH_FINISHED`がDiscordへ投稿されること
- 単発コラボ後にVDO.Ninjaリンク、Discordボイス権限、参加AI Botを整理すること
