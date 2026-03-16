import { describe, it, expect, beforeEach } from "vitest";
import {
  grantDm,
  revokeDm,
  hasDmPermission,
  revokeAllForSession,
  dmTargetsFor,
  dmSendersFor,
  resetDmPermissionsForTest,
} from "./dm-permissions.js";

describe("dm-permissions", () => {
  beforeEach(() => {
    resetDmPermissionsForTest();
  });

  describe("grantDm / hasDmPermission", () => {
    it("returns false when no permission exists", () => {
      expect(hasDmPermission(1, 2)).toBe(false);
    });

    it("returns true after granting", () => {
      grantDm(1, 2);
      expect(hasDmPermission(1, 2)).toBe(true);
    });

    it("is directional — A→B does not imply B→A", () => {
      grantDm(1, 2);
      expect(hasDmPermission(1, 2)).toBe(true);
      expect(hasDmPermission(2, 1)).toBe(false);
    });

    it("supports bidirectional when both directions granted", () => {
      grantDm(1, 2);
      grantDm(2, 1);
      expect(hasDmPermission(1, 2)).toBe(true);
      expect(hasDmPermission(2, 1)).toBe(true);
    });
  });

  describe("revokeDm", () => {
    it("returns false when revoking non-existent permission", () => {
      expect(revokeDm(1, 2)).toBe(false);
    });

    it("returns true and removes the permission", () => {
      grantDm(1, 2);
      expect(revokeDm(1, 2)).toBe(true);
      expect(hasDmPermission(1, 2)).toBe(false);
    });

    it("only revokes the specified direction", () => {
      grantDm(1, 2);
      grantDm(2, 1);
      revokeDm(1, 2);
      expect(hasDmPermission(1, 2)).toBe(false);
      expect(hasDmPermission(2, 1)).toBe(true);
    });
  });

  describe("revokeAllForSession", () => {
    it("removes all grants involving the session", () => {
      grantDm(1, 2);
      grantDm(2, 1);
      grantDm(3, 1);
      grantDm(1, 3);
      grantDm(2, 3);

      revokeAllForSession(1);

      expect(hasDmPermission(1, 2)).toBe(false);
      expect(hasDmPermission(2, 1)).toBe(false);
      expect(hasDmPermission(3, 1)).toBe(false);
      expect(hasDmPermission(1, 3)).toBe(false);
      // Unrelated grant survives
      expect(hasDmPermission(2, 3)).toBe(true);
    });
  });

  describe("dmTargetsFor", () => {
    it("returns empty when no permissions exist", () => {
      expect(dmTargetsFor(1)).toEqual([]);
    });

    it("returns sorted list of target SIDs", () => {
      grantDm(1, 3);
      grantDm(1, 2);
      expect(dmTargetsFor(1)).toEqual([2, 3]);
    });

    it("does not include reverse-direction grants", () => {
      grantDm(2, 1);
      expect(dmTargetsFor(1)).toEqual([]);
    });
  });

  describe("dmSendersFor", () => {
    it("returns sorted list of sender SIDs", () => {
      grantDm(3, 1);
      grantDm(2, 1);
      expect(dmSendersFor(1)).toEqual([2, 3]);
    });
  });
});
