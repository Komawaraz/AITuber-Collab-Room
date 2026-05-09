import { existsSync, readFileSync } from "node:fs";

export function loadEnvFile(path = ".env", target = process.env) {
  if (!existsSync(path)) {
    return {
      loaded: false,
      keys: []
    };
  }

  const keys = [];
  const text = readFileSync(path, "utf8");
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = stripQuotes(line.slice(separatorIndex + 1).trim());
    if (target[key] === undefined) {
      target[key] = value;
    }
    keys.push(key);
  }

  return {
    loaded: true,
    keys
  };
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
