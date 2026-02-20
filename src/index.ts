import "dotenv/config";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";
import { getSecurityConfig } from "./telegram.js";

// Initialize security config early so warnings surface at startup
getSecurityConfig();

const server = createServer();
const transport = new StdioServerTransport();

await server.connect(transport);
