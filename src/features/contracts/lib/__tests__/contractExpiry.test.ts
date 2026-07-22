import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { getContractExpiryState, getContractExpiryLabel } from "../contractExpiry";

describe("contractExpiry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    // Miércoles 22/07/2026 12:00 America/Monterrey (UTC-6) ≈ 18:00 UTC.
    vi.setSystemTime(new Date("2026-07-22T18:00:00Z"));
  });
  afterEach(() => vi.useRealTimers());

  it("devuelve null cuando el contrato está cancelado", () => {
    expect(getContractExpiryState("2026-07-01", "cancelled")).toBeNull();
  });

  it("marca 'expired' cuando end_date es ayer", () => {
    expect(getContractExpiryState("2026-07-21", "signed")).toBe("expired");
  });

  it("marca 'expiring_soon' dentro de 30 días", () => {
    expect(getContractExpiryState("2026-08-15", "signed")).toBe("expiring_soon");
  });

  it("devuelve null cuando faltan más de 30 días", () => {
    expect(getContractExpiryState("2026-12-31", "signed")).toBeNull();
  });

  it("etiquetas es-MX", () => {
    expect(getContractExpiryLabel("expired")).toBe("Vencido");
    expect(getContractExpiryLabel("expiring_soon")).toBe("Por vencer");
    expect(getContractExpiryLabel(null)).toBeNull();
  });
});
