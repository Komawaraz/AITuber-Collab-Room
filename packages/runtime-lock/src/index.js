import { closeSync, existsSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

export function acquireProcessLock(name, { lockDir = "data/runtime" } = {}) {
  const lockPath = resolve(lockDir, `${name}.lock`);
  mkdirSync(dirname(lockPath), { recursive: true });

  while (true) {
    try {
      const fd = openSync(lockPath, "wx");
      writeFileSync(fd, `${process.pid}\n`);
      closeSync(fd);
      installCleanup(lockPath);
      return lockPath;
    } catch (error) {
      if (error.code !== "EEXIST") {
        throw error;
      }

      const existingPid = readLockPid(lockPath);
      if (!existingPid || !isProcessAlive(existingPid)) {
        rmSync(lockPath, { force: true });
        continue;
      }

      throw new Error(`${name} is already running with pid ${existingPid}`);
    }
  }
}

function readLockPid(lockPath) {
  if (!existsSync(lockPath)) {
    return null;
  }
  const raw = readFileSync(lockPath, "utf8").trim();
  const pid = Number.parseInt(raw, 10);
  return Number.isInteger(pid) && pid > 0 ? pid : null;
}

function isProcessAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === "EPERM";
  }
}

function installCleanup(lockPath) {
  const cleanup = () => {
    rmSync(lockPath, { force: true });
  };

  process.once("exit", cleanup);
  for (const signal of ["SIGINT", "SIGTERM"]) {
    process.once(signal, () => {
      cleanup();
      process.exit(0);
    });
  }
}
