import "dotenv/config";
import { readFileSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { getSecurityConfig } from "./telegram.js";
import { clearCommandsOnShutdown } from "./shutdown.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const pkg = JSON.parse(readFileSync(join(__dirname, "..", "package.json"), "utf-8")) as { name: string; version: string };
process.stderr.write(`[info] [${pkg.name}] v${pkg.version} starting...\n`);

// Initialize security config early so warnings surface at startup
getSecurityConfig();

// Warn if TTS/STT remote hosts are using plain HTTP (credentials and audio exposed in transit)
if (process.env.TTS_HOST && !process.env.TTS_HOST.startsWith("https://")) {
  process.stderr.write("[warn] TTS_HOST is not using HTTPS — credentials and audio may be exposed in transit.\n");
}
if (process.env.STT_HOST && !process.env.STT_HOST.startsWith("https://")) {
  process.stderr.write("[warn] STT_HOST is not using HTTPS — credentials and audio may be exposed in transit.\n");
}

for (const sig of ["SIGTERM", "SIGINT"] as const) {
  process.on(sig, () => {
    void clearCommandsOnShutdown().finally(() => process.exit(0));
  });
}

const server = createServer();
const transport = new StdioServerTransport();

await server.connect(transport);
