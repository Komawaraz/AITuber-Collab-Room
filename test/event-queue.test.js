import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createEventQueue } from "../apps/bot/src/event-queue.js";

describe("event queue", () => {
  it("serializes async event handlers", async () => {
    const queue = createEventQueue({ onError() {} });
    const events = [];

    const first = queue.enqueue("first", async () => {
      events.push("first:start");
      await sleep(20);
      events.push("first:end");
      return "first-result";
    });
    const second = queue.enqueue("second", async () => {
      events.push("second:start");
      events.push("second:end");
      return "second-result";
    });

    assert.equal(await first, "first-result");
    assert.equal(await second, "second-result");
    assert.deepEqual(events, ["first:start", "first:end", "second:start", "second:end"]);
    assert.equal(queue.pendingCount, 0);
  });

  it("continues processing after a failed handler", async () => {
    const errors = [];
    const queue = createEventQueue({
      onError(error, event) {
        errors.push(`${event.name}:${error.message}`);
      }
    });
    const events = [];

    const failed = queue.enqueue("failed", async () => {
      events.push("failed");
      throw new Error("boom");
    });
    const next = queue.enqueue("next", async () => {
      events.push("next");
      return "ok";
    });

    await assert.rejects(failed, /boom/);
    assert.equal(await next, "ok");
    assert.deepEqual(events, ["failed", "next"]);
    assert.deepEqual(errors, ["failed:boom"]);
    assert.equal(queue.pendingCount, 0);
  });
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
