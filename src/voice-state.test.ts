import { vi, describe, it, expect, beforeEach } from "vitest";
import {
  getSessionVoice,
  setSessionVoice,
  clearSessionVoice,
  getSessionVoiceFor,
  resetVoiceStateForTest,
} from "./voice-state.js";
import { runInSessionContext } from "./session-context.js";

describe("voice-state", () => {
  beforeEach(() => { resetVoiceStateForTest(); });

  describe("getSessionVoice / setSessionVoice / clearSessionVoice", () => {
    it("returns null initially", () => {
      expect(getSessionVoice()).toBeNull();
    });

    it("sets and gets a voice", async () => {
      await runInSessionContext(1, () => {
        setSessionVoice("alloy");
        expect(getSessionVoice()).toBe("alloy");
      });
    });

    it("trims whitespace when setting", async () => {
      await runInSessionContext(1, () => {
        setSessionVoice("  nova  ");
        expect(getSessionVoice()).toBe("nova");
      });
    });

    it("treats empty string as null", async () => {
      await runInSessionContext(1, () => {
        setSessionVoice("alloy");
        setSessionVoice("");
        expect(getSessionVoice()).toBeNull();
      });
    });

    it("clears the voice", async () => {
      await runInSessionContext(1, () => {
        setSessionVoice("echo");
        clearSessionVoice();
        expect(getSessionVoice()).toBeNull();
      });
    });
  });

  describe("per-session isolation", () => {
    it("sessions do not share voice state", async () => {
      await runInSessionContext(1, () => { setSessionVoice("alloy"); });
      await runInSessionContext(2, () => { setSessionVoice("nova"); });
      await runInSessionContext(1, () => { expect(getSessionVoice()).toBe("alloy"); });
      await runInSessionContext(2, () => { expect(getSessionVoice()).toBe("nova"); });
    });

    it("clearing one session does not affect another", async () => {
      await runInSessionContext(1, () => { setSessionVoice("alloy"); });
      await runInSessionContext(2, () => { setSessionVoice("echo"); });
      await runInSessionContext(1, () => { clearSessionVoice(); });
      await runInSessionContext(1, () => { expect(getSessionVoice()).toBeNull(); });
      await runInSessionContext(2, () => { expect(getSessionVoice()).toBe("echo"); });
    });
  });

  describe("getSessionVoiceFor", () => {
    it("returns voice for the given SID", async () => {
      await runInSessionContext(5, () => { setSessionVoice("fable"); });
      expect(getSessionVoiceFor(5)).toBe("fable");
    });

    it("returns null for unknown SID", () => {
      expect(getSessionVoiceFor(99)).toBeNull();
    });
  });
});
