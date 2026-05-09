const TAG_PATTERN = /\[(COLLAB_TURN|COLLAB_REPLY|COLLAB_SPEECH_STARTED|COLLAB_SPEECH_FINISHED|COLLAB_SPEECH_FAILED)\s+([^\]]+)\]/;

export const TagType = Object.freeze({
  turn: "COLLAB_TURN",
  reply: "COLLAB_REPLY",
  speechStarted: "COLLAB_SPEECH_STARTED",
  speechFinished: "COLLAB_SPEECH_FINISHED",
  speechFailed: "COLLAB_SPEECH_FAILED"
});

export function parseCollabTag(text) {
  const match = TAG_PATTERN.exec(text);
  if (!match) {
    return null;
  }

  return {
    type: match[1],
    attrs: parseAttrs(match[2]),
    raw: match[0],
    index: match.index
  };
}

export function parseAttrs(source) {
  const attrs = {};
  for (const token of source.trim().split(/\s+/)) {
    const separatorIndex = token.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }
    const key = token.slice(0, separatorIndex);
    const rawValue = token.slice(separatorIndex + 1);
    attrs[key] = stripQuotes(rawValue);
  }
  return attrs;
}

export function formatCollabTurnTag({ room, session, turn, topic }) {
  return formatTag(TagType.turn, { room, session, turn, topic });
}

export function formatCollabReplyTag({ room, session, turn, reply_to }) {
  return formatTag(TagType.reply, { room, session, turn, reply_to });
}

export function formatCollabSpeechTag({ type, room, session, turn, audio_id, reason }) {
  return formatTag(type, { room, session, turn, audio_id, reason });
}

export function isValidTurnForAi({ messageText, mentionedBotId, targetBotId }) {
  const tag = parseCollabTag(messageText);
  return Boolean(
    tag &&
      tag.type === TagType.turn &&
      mentionedBotId === targetBotId &&
      tag.attrs.room &&
      tag.attrs.session &&
      tag.attrs.turn
  );
}

export function buildDummyReply({ turnMessageText, replyToMessageId }) {
  const tag = parseCollabTag(turnMessageText);
  if (!tag || tag.type !== TagType.turn) {
    return null;
  }

  const replyTag = formatCollabReplyTag({
    room: tag.attrs.room,
    session: tag.attrs.session,
    turn: tag.attrs.turn,
    reply_to: replyToMessageId
  });

  return [
    "観測しました。現在の部屋は、司会botがターンを発行し、AI役の返答を待っている状態です。",
    "",
    replyTag
  ].join("\n");
}

function formatTag(type, attrs) {
  const attrText = Object.entries(attrs)
    .filter(([, value]) => value !== undefined && value !== null && String(value).length > 0)
    .map(([key, value]) => `${key}=${String(value)}`)
    .join(" ");
  return `[${type} ${attrText}]`;
}

function stripQuotes(value) {
  if (
    (value.startsWith('"') && value.endsWith('"')) ||
    (value.startsWith("'") && value.endsWith("'"))
  ) {
    return value.slice(1, -1);
  }
  return value;
}
