import { describe, it, expect } from "vitest";
import {
  FORKLIFT_STATUSES,
  DAMAGE_STATUSES,
  INSPECTION_CONDITIONS,
  STATUS_LABELS,
} from "@/lib/constants";

describe("STATUS_LABELS coverage", () => {
  it("covers all FORKLIFT_STATUSES", () => {
    for (const s of FORKLIFT_STATUSES) {
      expect(STATUS_LABELS[s]).toBeDefined();
      expect(STATUS_LABELS[s].length).toBeGreaterThan(0);
    }
  });

  it("covers all DAMAGE_STATUSES", () => {
    for (const s of DAMAGE_STATUSES) {
      expect(STATUS_LABELS[s]).toBeDefined();
    }
  });

  it("covers all INSPECTION_CONDITIONS", () => {
    for (const s of INSPECTION_CONDITIONS) {
      expect(STATUS_LABELS[s]).toBeDefined();
    }
  });

  it("includes common UI statuses", () => {
    const uiStatuses = ["all", "draft", "sent", "paid", "overdue", "confirmed", "accepted", "declined", "expired", "completed", "signed", "cancelled", "partial", "pending"];
    for (const s of uiStatuses) {
      expect(STATUS_LABELS[s]).toBeDefined();
    }
  });
});
