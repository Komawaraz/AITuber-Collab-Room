import { loadEnvFile } from "../../bot/src/env-file.js";
import { loadGenericAiBotConfig } from "./config.js";

loadEnvFile();

const config = loadGenericAiBotConfig();
console.log(`Generic AI config OK: ai=${config.aiId} endpoint=${config.endpoint.type}`);
