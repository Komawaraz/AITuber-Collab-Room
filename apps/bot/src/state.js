export function createInitialState(config, snapshot = null) {
  if (snapshot) {
    return restoreStateSnapshot(config, snapshot);
  }

  return {
    roomId: config.roomId,
    session: config.session,
    topic: config.topic,
    participants: config.participants.map((participant) => ({
      ...participant,
      strengths: [...(participant.strengths || [])],
      forbiddenTopics: [...(participant.forbiddenTopics || [])]
    })),
    nextTurnNumber: 1,
    activeTurn: null,
    recentMessages: [],
    recentTurns: [],
    offTurnViolations: new Map(),
    autoLoop: null,
    speechPacing: config.speechPacing || { enabled: false },
    paused: false
  };
}

export function restoreStateSnapshot(config, snapshot) {
  const participants = mergeParticipants(config.participants, snapshot.participants || []);
  return {
    roomId: snapshot.roomId || config.roomId,
    session: snapshot.session || config.session,
    topic: snapshot.topic || config.topic,
    participants,
    nextTurnNumber: Number(snapshot.nextTurnNumber || 1),
    activeTurn: snapshot.activeTurn || null,
    recentMessages: Array.isArray(snapshot.recentMessages) ? snapshot.recentMessages.slice(-50) : [],
    recentTurns: Array.isArray(snapshot.recentTurns) ? snapshot.recentTurns.slice(-50) : [],
    offTurnViolations: new Map(snapshot.offTurnViolations || []),
    autoLoop: snapshot.autoLoop || null,
    speechPacing: config.speechPacing || snapshot.speechPacing || { enabled: false },
    paused: Boolean(snapshot.paused)
  };
}

function mergeParticipants(configParticipants, snapshotParticipants) {
  const snapshotByAiId = new Map(snapshotParticipants.map((participant) => [participant.aiId, participant]));
  const merged = configParticipants.map((participant) => {
    const persisted = snapshotByAiId.get(participant.aiId);
    return cloneParticipant({
      ...participant,
      muted: persisted?.muted ?? participant.muted,
      paused: persisted?.paused ?? participant.paused
    });
  });

  for (const participant of snapshotParticipants) {
    if (!configParticipants.some((current) => current.aiId === participant.aiId)) {
      merged.push(cloneParticipant(participant));
    }
  }

  return merged;
}

function cloneParticipant(participant) {
  return {
    ...participant,
    strengths: [...(participant.strengths || [])],
    forbiddenTopics: [...(participant.forbiddenTopics || [])]
  };
}

export function rememberMessage(state, message) {
  state.recentMessages.push({
    id: message.id,
    author: message.authorName,
    authorId: message.authorId,
    text: cleanMessageText(message.content)
  });
  state.recentMessages = state.recentMessages.slice(-50);
}

function cleanMessageText(text) {
  return String(text || "")
    .replace(/\[COLLAB_REPLY\s+[^\]]+\]/g, "")
    .replace(/\[COLLAB_TURN\s+[^\]]+\]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function findParticipantByAiId(state, aiId) {
  return state.participants.find((participant) => participant.aiId === aiId);
}

export function findParticipantByBotId(state, botId) {
  return state.participants.find((participant) => participant.botId === botId);
}

export function setParticipantMuted(state, aiId, muted) {
  const participant = findParticipantByAiId(state, aiId);
  if (!participant) {
    return false;
  }
  participant.muted = muted;
  return true;
}
