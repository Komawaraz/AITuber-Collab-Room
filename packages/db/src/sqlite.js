import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const SNAPSHOT_ID = "default";

export function openSqliteStore(path = "data/collab-room.sqlite") {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new DatabaseSync(path);
  initializeSchema(db);
  return {
    db,
    close() {
      db.close();
    },
    saveStateSnapshot(state) {
      saveStateSnapshot(db, state);
    },
    loadStateSnapshot() {
      return loadStateSnapshot(db);
    },
    appendEvent(event) {
      return appendEvent(db, event);
    },
    listEvents(options) {
      return listEvents(db, options);
    }
  };
}

export function initializeSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS state_snapshots (
      id TEXT PRIMARY KEY,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      session_id TEXT NOT NULL,
      type TEXT NOT NULL,
      source TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_events_session_created
      ON events (session_id, created_at);
  `);
}

export function saveStateSnapshot(db, state) {
  const snapshot = JSON.stringify(serializeState(state));
  db.prepare(`
    INSERT INTO state_snapshots (id, state_json, updated_at)
    VALUES (?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      state_json = excluded.state_json,
      updated_at = excluded.updated_at
  `).run(SNAPSHOT_ID, snapshot, new Date().toISOString());
}

export function loadStateSnapshot(db) {
  const row = db.prepare("SELECT state_json FROM state_snapshots WHERE id = ?").get(SNAPSHOT_ID);
  if (!row) {
    return null;
  }
  return JSON.parse(row.state_json);
}

export function appendEvent(db, event) {
  const createdAt = event.createdAt || new Date().toISOString();
  const result = db.prepare(`
    INSERT INTO events (session_id, type, source, payload_json, created_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    event.sessionId,
    event.type,
    event.source || "bot",
    JSON.stringify(event.payload || {}),
    createdAt
  );
  return Number(result.lastInsertRowid);
}

export function listEvents(db, { sessionId, limit = 50 } = {}) {
  const boundedLimit = Math.max(1, Math.min(500, Number(limit) || 50));
  const rows = sessionId
    ? db.prepare(`
        SELECT id, session_id, type, source, payload_json, created_at
        FROM events
        WHERE session_id = ?
        ORDER BY id DESC
        LIMIT ?
      `).all(sessionId, boundedLimit)
    : db.prepare(`
        SELECT id, session_id, type, source, payload_json, created_at
        FROM events
        ORDER BY id DESC
        LIMIT ?
      `).all(boundedLimit);

  return rows.map((row) => ({
    id: row.id,
    sessionId: row.session_id,
    type: row.type,
    source: row.source,
    payload: JSON.parse(row.payload_json),
    createdAt: row.created_at
  }));
}

export function serializeState(state) {
  return {
    roomId: state.roomId,
    session: state.session,
    topic: state.topic,
    participants: state.participants,
    nextTurnNumber: state.nextTurnNumber,
    activeTurn: state.activeTurn,
    recentMessages: state.recentMessages,
    recentTurns: state.recentTurns,
    offTurnViolations: Array.from(state.offTurnViolations.entries()),
    autoLoop: state.autoLoop,
    speechPacing: state.speechPacing,
    paused: state.paused
  };
}
