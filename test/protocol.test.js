import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildDummyReply,
  formatCollabReplyTag,
  formatCollabSpeechTag,
  formatCollabTurnTag,
  isValidTurnForAi,
  parseAttrs,
  parseCollabTag,
  TagType
} from "../packages/protocol/src/index.js";

describe("protocol tags", () => {
  it("parses turn tags", () => {
    const tag = parseCollabTag("@Alpha [COLLAB_TURN room=default session=s1 turn=12 topic=clue-a]");

    assert.equal(tag.type, TagType.turn);
    assert.deepEqual(tag.attrs, {
      room: "default",
      session: "s1",
      turn: "12",
      topic: "clue-a"
    });
  });

  it("parses quoted attrs", () => {
    assert.deepEqual(parseAttrs('room=default session="case-01" turn=7'), {
      room: "default",
      session: "case-01",
      turn: "7"
    });
  });

  it("formats turn and reply tags", () => {
    assert.equal(
      formatCollabTurnTag({ room: "default", session: "s1", turn: 1, topic: "intro" }),
      "[COLLAB_TURN room=default session=s1 turn=1 topic=intro]"
    );
    assert.equal(
      formatCollabReplyTag({ room: "default", session: "s1", turn: 1, reply_to: "m1" }),
      "[COLLAB_REPLY room=default session=s1 turn=1 reply_to=m1]"
    );
    assert.equal(
      formatCollabSpeechTag({ type: TagType.speechFinished, room: "default", session: "s1", turn: 1, audio_id: "a1" }),
      "[COLLAB_SPEECH_FINISHED room=default session=s1 turn=1 audio_id=a1]"
    );
  });

  it("parses speech tags", () => {
    const tag = parseCollabTag("[COLLAB_SPEECH_STARTED room=default session=s1 turn=7 audio_id=a7]");

    assert.equal(tag.type, TagType.speechStarted);
    assert.deepEqual(tag.attrs, {
      room: "default",
      session: "s1",
      turn: "7",
      audio_id: "a7"
    });
  });

  it("accepts only mentioned target bots with a valid turn tag", () => {
    assert.equal(
      isValidTurnForAi({
        messageText: "[COLLAB_TURN room=default session=s1 turn=1]",
        mentionedBotId: "bot-alpha",
        targetBotId: "bot-alpha"
      }),
      true
    );
    assert.equal(
      isValidTurnForAi({
        messageText: "[COLLAB_TURN room=default session=s1 turn=1]",
        mentionedBotId: "bot-other",
        targetBotId: "bot-alpha"
      }),
      false
    );
  });

  it("builds dummy replies from turn tags", () => {
    const reply = buildDummyReply({
      turnMessageText: "<@bot-alpha> [COLLAB_TURN room=default session=s1 turn=2 topic=intro]",
      replyToMessageId: "m123"
    });

    assert.match(reply, /観測しました/);
    assert.match(reply, /\[COLLAB_REPLY room=default session=s1 turn=2 reply_to=m123\]/);
  });
});
