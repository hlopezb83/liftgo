import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import { createQueryWrapper } from "@/test/helpers/queryClient";

const maybeSingle = vi.fn();
const eq = vi.fn(() => ({ maybeSingle }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { from: (...args: unknown[]) => from(...args) },
}));

import { useBreadcrumbEntityLabel } from "../useBreadcrumbEntityLabel";

const UUID = "11111111-2222-3333-4444-555555555555";

describe("useBreadcrumbEntityLabel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("no consulta cuando el segmento no tiene resolver", () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(
      () => useBreadcrumbEntityLabel(`/unknown/${UUID}`),
      { wrapper: Wrapper },
    );
    expect(from).not.toHaveBeenCalled();
    expect(result.current.targetSegment).toBeNull();
    expect(result.current.label).toBeNull();
  });

  it("no consulta cuando el segundo segmento no es UUID-like", () => {
    const { Wrapper } = createQueryWrapper();
    renderHook(() => useBreadcrumbEntityLabel("/invoices/new"), { wrapper: Wrapper });
    expect(from).not.toHaveBeenCalled();
  });

  it("resuelve y formatea label para una factura existente", async () => {
    maybeSingle.mockResolvedValueOnce({ data: { invoice_number: "FAC-0042" }, error: null });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(
      () => useBreadcrumbEntityLabel(`/invoices/${UUID}`),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.label).toBe("FAC-0042"));
    expect(from).toHaveBeenCalledWith("invoices");
    expect(result.current.targetSegment).toBe(UUID);
  });

  it("combina manufacturer + model para fleet, con fallback a name", async () => {
    maybeSingle.mockResolvedValueOnce({
      data: { manufacturer: "Toyota", model: "8FGCU25", name: "MX-001" },
      error: null,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(
      () => useBreadcrumbEntityLabel(`/fleet/${UUID}`),
      { wrapper: Wrapper },
    );
    await waitFor(() => expect(result.current.label).toBe("Toyota 8FGCU25"));
  });
});
