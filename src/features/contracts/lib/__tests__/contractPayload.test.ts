import { describe, it, expect } from "vitest";
import { buildContractPayload } from "../contractPayload";
import { defaultContractForm } from "../../hooks/contractForm/contractFormDefaults";

describe("buildContractPayload", () => {
  it("aplica defaults sensatos cuando los campos están vacíos", () => {
    const form = { ...defaultContractForm, customer_id: "c1", forklift_id: "f1" };
    const payload = buildContractPayload(form, null);

    expect(payload.customer_id).toBe("c1");
    expect(payload.forklift_id).toBe("f1");
    expect(payload.status).toBe("draft");
    expect(payload.signed_at).toBeNull();
    expect(payload.booking_id).toBeNull();
    expect(payload.start_date).toBeNull();
    expect(payload.end_date).toBeNull();
    expect(payload.terms_text).toBeNull();
    expect(payload.payment_frequency).toBe("Mensual");
    expect(payload.contract_city).toBe("San Pedro Garza García, N.L.");
    expect(payload.late_interest_rate).toBe(5);
    expect(payload.max_hours_per_month).toBeNull();
    expect(payload.extra_hour_rate).toBeNull();
  });

  it("convierte numéricos y propaga booking_id", () => {
    const form = {
      ...defaultContractForm,
      customer_id: "c1",
      forklift_id: "f1",
      daily_rate: "100",
      weekly_rate: "600",
      monthly_rate: "2400",
      deposit_amount: "5000",
      max_hours_per_month: "200",
      extra_hour_rate: "50",
      late_interest_rate: "10",
      start_date: "2026-01-01",
      end_date: "2026-12-31",
    };
    const payload = buildContractPayload(form, "BK-1");

    expect(payload.daily_rate).toBe(100);
    expect(payload.monthly_rate).toBe(2400);
    expect(payload.deposit_amount).toBe(5000);
    expect(payload.max_hours_per_month).toBe(200);
    expect(payload.extra_hour_rate).toBe(50);
    expect(payload.late_interest_rate).toBe(10);
    expect(payload.booking_id).toBe("BK-1");
    expect(payload.start_date).toBe("2026-01-01");
  });

  it("usa fallback 5% si late_interest_rate es vacío", () => {
    const form = { ...defaultContractForm, customer_id: "c1", forklift_id: "f1", late_interest_rate: "" };
    const payload = buildContractPayload(form, null);
    expect(payload.late_interest_rate).toBe(5);
  });
});
