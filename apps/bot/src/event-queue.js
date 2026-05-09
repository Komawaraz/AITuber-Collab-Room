export function createEventQueue({ onError = defaultOnError } = {}) {
  let tail = Promise.resolve();
  let pendingCount = 0;

  async function enqueue(name, handler) {
    pendingCount += 1;
    const run = tail.then(async () => {
      try {
        return await handler();
      } catch (error) {
        onError(error, { name });
        throw error;
      } finally {
        pendingCount -= 1;
      }
    });

    tail = run.catch(() => {});
    return run;
  }

  return {
    enqueue,
    get pendingCount() {
      return pendingCount;
    }
  };
}

function defaultOnError(error, event) {
  console.error(`[event-queue] ${event.name}: ${error.stack || error.message}`);
}
