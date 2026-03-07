# syntax=docker/dockerfile:1

# ── Stage 1: production dependencies (native modules compiled here) ───────────
FROM node:24-slim AS deps

# Build tools needed for native modules (onnxruntime-node, opusscript, sharp)
RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod

# ── Stage 2: TypeScript build ─────────────────────────────────────────────────
FROM node:24-slim AS build

RUN apt-get update && apt-get install -y --no-install-recommends \
    python3 make g++ \
    && rm -rf /var/lib/apt/lists/*

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY tsconfig.json ./
COPY src/ ./src/
RUN pnpm build

# ── Stage 3: runtime (no build tools, no dev deps, non-root) ─────────────────
FROM node:24-slim AS runtime

# Patch all OS packages to eliminate known CVEs
RUN apt-get update && apt-get upgrade -y --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Prod node_modules (pre-compiled native modules from stage 1)
COPY --from=deps /app/node_modules ./node_modules

# Compiled JS output
COPY --from=build /app/dist ./dist

# Resource files read at runtime by the MCP server
COPY BEHAVIOR.md COMMUNICATION.md FORMATTING.md SETUP.md LOOP-PROMPT.md ./
COPY package.json ./

# Cache dir for Whisper/TTS model weights — mount a volume here to persist
# e.g. docker run -v telegram-mcp-cache:/home/node/.cache ...
ENV XDG_CACHE_HOME=/home/node/.cache

# Run as non-root
USER node

# MCP over stdio — no port needed
CMD ["node", "dist/index.js"]
