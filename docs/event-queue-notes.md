# Event Queue Notes

## Current Decision

Use an in-memory serial event queue for the current alpha.

Events entering the facilitator bot should be processed one at a time:

- Discord control messages
- Discord room messages
- external audience comments from HTTP `/audience`
- turn timeout timers
- pending auto-loop timers

The goal is to prevent concurrent mutation of shared room state.

## Current Scope

This is not a durable job queue.

The queue guarantees ordering only while the facilitator bot process is running.
Existing SQLite event logs and state snapshots still provide observability and basic restart state, but unprocessed queued work is not replayed after process exit.

## Deferred Durable Queue

A later production-oriented version may add a SQLite-backed queue with:

- `queued`
- `processing`
- `done`
- `failed`

That version should also handle idempotency for Discord sends. Without idempotency, replaying queued events after restart can duplicate room messages.

## Reason

The current MVP needs state serialization more than restart replay.
Adding durable replay now would expand the design into message deduplication, delivery tracking, and failure recovery. Those are important, but they are separate from the first useful slice.
