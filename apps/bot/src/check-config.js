import { loadEnvFile } from "./env-file.js";
import { loadBotConfig } from "./config.js";

loadEnvFile();

try {
  const config = loadBotConfig();
  console.log("Discord bot config OK");
  console.log(`guild=${config.guildId}`);
  console.log(`room_channel=${config.channels.room}`);
  console.log(`control_channel=${config.channels.control}`);
  console.log(`log_channel=${config.channels.logs}`);
  console.log(`db_path=${config.dbPath}`);
  console.log(`hosts=${config.hostUserIds.length}`);
  console.log(`co_hosts=${config.coHostUserIds.length}`);
  console.log(`participants=${config.participants.map((participant) => participant.aiId).join(",") || "none"}`);
  console.log(`codex_moderator=${config.moderator.enabled ? "enabled" : "disabled"}`);
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
