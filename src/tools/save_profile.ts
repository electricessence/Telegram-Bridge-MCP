import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toResult, toError } from "../telegram.js";
import { requireAuth } from "../session-gate.js";
import { IDENTITY_SCHEMA } from "./identity-schema.js";
import { writeProfile, resolveProfilePath } from "../profile-store.js";
import { getSessionVoiceFor } from "../voice-state.js";
import { getDefaultFrames, listPresets, getPreset } from "../animation-state.js";
import { listReminders } from "../reminder-state.js";

const DESCRIPTION =
  "Snapshot the current session's voice, animation, and reminder configuration " +
  "to a profile file for later restoration via load_profile. " +
  "Bare keys (e.g. \"Overseer\") save to data/profiles/{key}.json (gitignored). " +
  "Path keys (e.g. \"profiles/Overseer\") save relative to the repo root.";

export function register(server: McpServer) {
  server.registerTool(
    "save_profile",
    {
      description: DESCRIPTION,
      inputSchema: {
        key: z
          .string()
          .min(1)
          .max(200)
          .describe(
            "Profile key. Bare name (e.g. \"Overseer\") saves to data/profiles/. " +
            "Path key (e.g. \"profiles/Overseer\") saves relative to repo root.",
          ),
        identity: IDENTITY_SCHEMA,
      },
    },
    ({ key, identity }) => {
      const sid = requireAuth(identity);
      if (typeof sid !== "number") return toError(sid);

      const sections: string[] = [];

      const voice = getSessionVoiceFor(sid);
      const animationDefault = getDefaultFrames(sid);
      const presetNames = listPresets(sid);
      const reminders = listReminders();

      const data: Record<string, unknown> = {};

      if (voice !== null) {
        data.voice = voice;
        sections.push("voice");
      }

      // Always snapshot animation_default (captures the active default, built-in or custom)
      data.animation_default = [...animationDefault];
      sections.push("animation_default");

      if (presetNames.length > 0) {
        const presets: Record<string, string[]> = {};
        for (const name of presetNames) {
          const frames = getPreset(sid, name);
          if (frames) presets[name] = [...frames];
        }
        data.animation_presets = presets;
        sections.push("animation_presets");
      }

      if (reminders.length > 0) {
        data.reminders = reminders.map(r => ({
          text: r.text,
          delay_seconds: r.delay_seconds,
          recurring: r.recurring,
        }));
        sections.push("reminders");
      }

      let path: string;
      try {
        path = resolveProfilePath(key);
        writeProfile(key, data);
      } catch (err) {
        return toError({ code: "WRITE_FAILED", message: (err as Error).message });
      }

      return toResult({ saved: true, key, path, sections });
    },
  );
}
