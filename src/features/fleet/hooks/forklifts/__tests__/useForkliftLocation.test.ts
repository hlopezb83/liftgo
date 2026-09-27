import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { supabase } from "@/integrations/supabase/client";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import type { ChainCall } from "@/test/helpers/supabaseChain";
import { fleetLocationsQueries } from "../useFleetLocations";
import { forkliftLocationQueries, useForkliftLocation } from "../useForkliftLocation";

let calls: ChainCall[] = [];
let location: string | null = "Av. Industria 428 · Andén 3";
let error: { message: string } | null = null;
vi.mock("@/integrations/supabase/client", async () => ({
  supabase: (await import("@/test/helpers/supabaseChain")).createSupabaseChainMock({
    tableResolvers: {
      forklift_current_location: (chain) => {
        calls = chain;
        return { data: chain.some((c) => c.method === "maybeSingle")
          ? { location } : [{ forklift_id: "f-1", location, has_active_policy: false }], error };
      },
    },
  }),
}));

beforeEach(() => { calls = []; location = "Av. Industria 428 · Andén 3"; error = null; vi.clearAllMocks(); });

describe("ubicación registrada de flota", () => {
  it("listado y ficha usan la misma fuente y dirección", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useForkliftLocation("f-1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    const detailCalls = [...calls];
    const list = await fleetLocationsQueries.list().queryFn!({} as never);
    expect(result.current.data).toBe(list.locationMap.get("f-1"));
    expect(result.current.data).toBe(location);
    expect(supabase.from).toHaveBeenCalledTimes(2);
    expect(supabase.from).toHaveBeenNthCalledWith(1, "forklift_current_location");
    expect(detailCalls).toContainEqual({ method: "eq", args: ["forklift_id", "f-1"] });
  });

  it("no inventa ubicación cuando la vista no tiene dirección", async () => {
    location = null;
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useForkliftLocation("f-1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBeNull();
  });

  it("distingue un rechazo de acceso de una ubicación ausente", async () => {
    error = { message: "Acceso denegado" };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useForkliftLocation("f-1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(error);
  });

  it("no consulta sin identidad de equipo y conserva la clave invalidada por movimientos", () => {
    const { Wrapper } = createQueryWrapper();
    renderHook(() => useForkliftLocation(undefined), { wrapper: Wrapper });
    expect(supabase.from).not.toHaveBeenCalled();
    expect(forkliftLocationQueries.detail("f-1").queryKey).toEqual(["forklift-location", "detail", "f-1"]);
  });
});
