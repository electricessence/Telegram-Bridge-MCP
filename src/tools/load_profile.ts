import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { toResult, toError } from "../telegram.js";
import { requireAuth } from "../session-gate.js";
import { IDENTITY_SCHEMA } from "./identity-schema.js";
import { readProfile } from "../profile-store.js";
import { setSessionVoice } from "../voice-state.js";
import { setSessionDefault, registerPreset } from "../animation-state.js";
import { addReminder } from "../reminder-state.js";

const DESCRIPTION =
  "Restore a previously saved session profile. Sparse-merges into the current " +
  "session — keys present in the profile overwrite the session's current values; " +
  "absent keys are untouched. Multiple loads stack. " +
  "Use load_profile after session_start to bootstrap voice, animations, and reminders.";

export function register(server: McpServer) {
  server.registerTool(
    "load_profile",
    {
      description: DESCRIPTION,
      inputSchema: {
        key: z
          .string()
          .min(1)
          .max(200)
          .describe(
            "Profile key to load. Bare name (e.g. \"Overseer\") loads from data/profiles/. " +
            "Path key (e.g. \"profiles/Overseer\") loads relative to repo root.",
          ),
        identity: IDENTITY_SCHEMA,
      },
    },
    ({ key, identity }) => {
      const _sid = requireAuth(identity);
      if (typeof _sid !== "number") return toError(_sid);

      let profile;
      try {
        profile = readProfile(key);
      } catch (err) {
        return toError({ code: "READ_FAILED", message: (err as Error).message });
      }

      if (profile === null) {
        return toError({ code: "NOT_FOUND", message: `Profile not found: ${key}` });
      }

      const applied: Record<string, unknown> = {};

      if (profile.voice !== undefined) {
        setSessionVoice(profile.voice);
        applied.voice = profile.voice;
      }

      try {
        if (profile.animation_default !== undefined) {
          setSessionDefault(_sid, profile.animation_default);
          applied.animation_default = true;
        }

        const appliedPresets: string[] = [];
        if (profile.animation_presets !== undefined) {
          for (const [name, frames] of Object.entries(profile.animation_presets)) {
            registerPreset(_sid, name, frames);
            appliedPresets.push(name);
          }
        }
        if (appliedPresets.length > 0) applied.presets = appliedPresets;

        const appliedReminders: string[] = [];
        if (profile.reminders !== undefined) {
          for (const r of profile.reminders) {
            const reminder = addReminder({
              id: r.id ?? crypto.randomUUID(),
              text: r.text,
              delay_seconds: r.delay_seconds,
              recurring: r.recurring,
            });
            appliedReminders.push(reminder.id);
          }
        }
        if (appliedReminders.length > 0) applied.reminders = appliedReminders;
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const isReminderLimit = message.includes("MAX_REMINDERS_PER_SESSION");
        return toError({
          code: isReminderLimit ? "REMINDER_LIMIT_EXCEEDED" : "APPLY_FAILED",
          message,
        });
      }

      return toResult({ loaded: true, key, applied });
    },
  );
}
