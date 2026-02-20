import { vi, beforeEach } from "vitest";

// Suppress the ALLOWED_USER_ID / ALLOWED_CHAT_ID startup warnings globally in
// the test suite. These env vars are intentionally not set in tests because
// setting them would cause validateTargetChat / filterAllowedUpdates to reject
// the fixture data used across the test files.
beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
