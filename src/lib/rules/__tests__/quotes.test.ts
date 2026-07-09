import { describe, it, expect } from "vitest";
import { isQuoteEditable, isQuoteAccepted, canConvertQuote, canActOnPortalQuote } from "../quotes";

const q = (status: string, extra: Record<string, unknown> = {}) =>
  ({ status, ...extra } as Parameters<typeof isQuoteEditable>[0]);

describe("rules/quotes", () => {
  it("isQuoteEditable: draft/sent only", () => {
    expect(isQuoteEditable(q("draft"))).toBe(true);
    expect(isQuoteEditable(q("sent"))).toBe(true);
    expect(isQuoteEditable(q("accepted"))).toBe(false);
    expect(isQuoteEditable(q("declined"))).toBe(false);
  });

  it("isQuoteAccepted: status accepted or accepted_at present", () => {
    expect(isQuoteAccepted(q("accepted"))).toBe(true);
    expect(isQuoteAccepted(q("sent", { accepted_at: "2026-01-01" }))).toBe(true);
    expect(isQuoteAccepted(q("draft"))).toBe(false);
  });

  it("canConvertQuote: rental in draft/sent/accepted, not already converted", () => {
    expect(canConvertQuote(q("sent"), { isSale: false, alreadyConverted: false })).toBe(true);
    expect(canConvertQuote(q("accepted"), { isSale: false, alreadyConverted: false })).toBe(true);
    expect(canConvertQuote(q("sent"), { isSale: true, alreadyConverted: false })).toBe(false);
    expect(canConvertQuote(q("sent"), { isSale: false, alreadyConverted: true })).toBe(false);
    expect(canConvertQuote(q("declined"), { isSale: false, alreadyConverted: false })).toBe(false);
  });

  it("canActOnPortalQuote: only sent", () => {
    expect(canActOnPortalQuote(q("sent"))).toBe(true);
    expect(canActOnPortalQuote(q("accepted"))).toBe(false);
    expect(canActOnPortalQuote(q("draft"))).toBe(false);
  });
});
