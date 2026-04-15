import { describe, it, expect, beforeEach } from "vitest";
import { setPlannedBounce, isPlannedBounce, resetBounceStateForTest } from "./bounce-state.js";

beforeEach(() => {
  resetBounceStateForTest();
});

describe("bounce-state", () => {
  it("starts as false", () => {
    expect(isPlannedBounce()).toBe(false);
  });

  it("setPlannedBounce(true) makes isPlannedBounce() return true", () => {
    setPlannedBounce(true);
    expect(isPlannedBounce()).toBe(true);
  });

  it("setPlannedBounce(false) makes isPlannedBounce() return false", () => {
    setPlannedBounce(true);
    setPlannedBounce(false);
    expect(isPlannedBounce()).toBe(false);
  });

  it("resetBounceStateForTest resets flag to false", () => {
    setPlannedBounce(true);
    resetBounceStateForTest();
    expect(isPlannedBounce()).toBe(false);
  });
});
