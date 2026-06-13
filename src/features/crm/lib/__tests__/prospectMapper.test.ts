import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { mapProspectRow } from "../prospectMapper";
import type { ProspectRow } from "../prospectTypes";

const FIXED_NOW = new Date("2026-06-08T12:00:00-06:00");

const baseRow: ProspectRow = {
  id: "p1",
  company_name: "Acme SA",
  contact_person: "Juan",
  email: "a@a.com",
  phone: "555",
  deal_value: 12500.5,
  stage: "negociacion",
  notes: null,
  stage_order: 0,
  quote_id: null,
  customer_id: null,
  created_by: "u1",
  created_at: "2026-05-01T10:00:00Z",
  updated_at: "2026-05-20T10:00:00Z",
  closed_at: null,
  lost_reason: null,
  final_amount: null,
};

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(FIXED_NOW);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("mapProspectRow", () => {
  it("convierte snake_case a camelCase y formatea MXN/fecha", () => {
    const p = mapProspectRow(baseRow, { creatorName: "Ana" });
    expect(p.companyName).toBe("Acme SA");
    expect(p.contactPerson).toBe("Juan");
    expect(p.dealValue).toBe(12500.5);
    expect(p.dealValueLabel).toMatch(/12,500/);
    expect(p.createdAtLabel).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
    expect(p.createdByName).toBe("Ana");
  });

  it("marca isStale cuando supera 14 días y no está cerrado", () => {
    const p = mapProspectRow(baseRow, { creatorName: null });
    expect(p.staleDays).toBeGreaterThan(14);
    expect(p.isStale).toBe(true);
    expect(p.isClosed).toBe(false);
  });

  it("nunca marca isStale en prospectos cerrados", () => {
    const p = mapProspectRow(
      { ...baseRow, stage: "cerrado_ganado", closed_at: "2026-05-25T10:00:00Z" },
      { creatorName: null },
    );
    expect(p.isClosed).toBe(true);
    expect(p.isStale).toBe(false);
    expect(p.closedAtLabel).toMatch(/^\d{2}\/\d{2}\/\d{4}$/);
  });

  it("acepta creatorName nulo", () => {
    const p = mapProspectRow(baseRow, { creatorName: null });
    expect(p.createdByName).toBeNull();
  });
});
