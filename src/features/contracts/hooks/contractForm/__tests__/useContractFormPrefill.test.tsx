import { act, renderHook, waitFor } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/integrations/supabase/types";
import { defaultContractForm } from "../contractFormDefaults";
import { useContractFormPrefill } from "../useContractFormPrefill";

vi.mock("@/features/bookings", () => ({ useBooking: () => ({ data: null }) }));
vi.mock("@/features/company-settings", () => ({ useCompanySettings: () => ({ data: { razon_social: "LiftGo" } }) }));
vi.mock("../../useContractTemplates", () => ({
  useDefaultContractTemplate: () => ({ data: {
    body_text: "[NOMBRE_CLIENTE] renta por [MONTO_RENTA] desde [FECHA_INICIO]",
    local_overrides: {},
  } }),
}));

type Customer = Database["public"]["Tables"]["customers"]["Row"];
type Forklift = Database["public"]["Tables"]["forklifts"]["Row"];
const customer = { id: "customer-1", name: "Logística Álamo" } as Customer;
const forklift = { id: "forklift-1", model: "H50", daily_rate: 100 } as Forklift;
const customers = [customer];
const forklifts = [forklift];

describe("useContractFormPrefill", () => {
  it("updates generated terms when inputs change but preserves a manual edit", async () => {
    const { result } = renderHook(() => {
      const form = useForm({ defaultValues: {
        ...defaultContractForm,
        customer_id: customer.id,
        forklift_id: forklift.id,
        payment_frequency: "Diario",
        daily_rate: "100",
      } });
      useContractFormPrefill({
        isEdit: false, bookingId: null, form,
        customers, forklifts,
        templateApplied: false, setTemplateApplied: vi.fn(),
      });
      return form;
    });

    await waitFor(() => expect(result.current.getValues("terms_text")).toContain("por 100"));
    act(() => result.current.setValue("daily_rate", "150"));
    await waitFor(() => expect(result.current.getValues("terms_text")).toContain("por 150"));

    act(() => result.current.setValue("terms_text", "Texto negociado manualmente"));
    act(() => result.current.setValue("start_date", "2026-10-01"));
    expect(result.current.getValues("terms_text")).toBe("Texto negociado manualmente");
  });
});
