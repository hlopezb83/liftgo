import { renderHook } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";

const { transport } = vi.hoisted(() => ({ transport: vi.fn() }));
vi.mock("@/contexts/OrganizationContext", () => ({ useVerifiedOrganizationId: () => "org-a" }));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: () => "actor-a:org-a" }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("https://invoice-equipment.invalid", "offline-fixture", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: transport },
  }) };
});

import { useInvoiceRentalEquipment } from "../useInvoiceRentalEquipment";

it("reads just the selected equipment and retries an incomplete response without relying on the active catalog", async () => {
  const equipment = (id: string) => ({ id, name: id, model: "Model", manufacturer: null, serial_number: null,
    equipment_model_id: null, daily_rate: 100, weekly_rate: 600, monthly_rate: 1500 });
  const active = equipment("active");
  const archived = equipment("archived");
  const response = (rows: ReturnType<typeof equipment>[]) => new Response(JSON.stringify(rows), {
    headers: { "Content-Type": "application/json" },
  });
  transport.mockResolvedValueOnce(response([active])).mockResolvedValueOnce(response([active, archived]));
  const { Wrapper } = createQueryWrapper();
  const { result } = renderHook(() => useInvoiceRentalEquipment([]), { wrapper: Wrapper });
  expect(transport).not.toHaveBeenCalled();
  await expect(result.current.loadForIds([active.id, archived.id])).rejects.toThrow(/verificar todos los equipos/);
  await expect(result.current.loadForIds([archived.id, active.id])).resolves.toEqual([active, archived]);
  expect(transport).toHaveBeenCalledTimes(2);
  for (const [input, init] of transport.mock.calls) {
    const request = new URL(input);
    expect(request.pathname).toBe("/rest/v1/forklifts");
    expect(request.searchParams.get("organization_id")).toBe("eq.org-a");
    expect(request.searchParams.get("id")).toBe("in.(active,archived)");
    expect(request.searchParams.has("deleted_at")).toBe(false);
    expect(request.searchParams.has("limit")).toBe(false);
    expect(request.searchParams.get("select")).not.toContain("acquisition_cost");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  }
});
