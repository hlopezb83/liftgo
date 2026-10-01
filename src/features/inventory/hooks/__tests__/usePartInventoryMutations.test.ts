import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";

/**
 * Mutaciones simples de parts_inventory (refacciones).
 * Riesgo: stock incorrecto rompe planeación de mantenimiento y costo de ROI.
 */

const { notifyErrorMock } = vi.hoisted(() => ({ notifyErrorMock: vi.fn() }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: notifyErrorMock,
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

const inserts: unknown[] = [];
const updates: Array<{ patch: unknown; eqArgs: unknown[] }> = [];
const activationArgs: unknown[] = [];
const metadataArgs: unknown[] = [];
const adjustmentArgs: unknown[] = [];

let insertResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "p-1", sku: "SKU-001" }, error: null,
};
let updateResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "p-1" }, error: null,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    rpcResolvers: {
      activate_parts_catalog: (args) => {
        activationArgs.push(args);
        return { data: "local-part-id", error: null };
      },
      update_part_inventory_metadata: (args) => { metadataArgs.push(args); return updateResp; },
      adjust_part_stock: (args) => { adjustmentArgs.push(args); return updateResp; },
    },
    tableResolvers: {
      parts_inventory: (calls) => {
        const ins = calls.find((c) => c.method === "insert");
        if (ins) { inserts.push(ins.args[0]); return insertResp; }
        const upd = calls.find((c) => c.method === "update");
        if (upd) {
          const eq = calls.find((c) => c.method === "eq");
          updates.push({ patch: upd.args[0], eqArgs: eq?.args ?? [] });
          return updateResp;
        }
        return { data: null, error: null };
      },
    },
  }),
}));

import {
  useActivateCatalogPart, useCreatePart, useUpdatePart, useDeletePart, useAdjustPartStock,
} from "../usePartInventoryMutations";

beforeEach(() => {
  inserts.length = 0; updates.length = 0; activationArgs.length = 0;
  metadataArgs.length = 0; adjustmentArgs.length = 0;
  notifyErrorMock.mockReset();
  insertResp = { data: { id: "p-1", sku: "SKU-001" }, error: null };
  updateResp = { data: { id: "p-1" }, error: null };
});

describe("useActivateCatalogPart", () => {
  it("envía al RPC sólo el SKU global y la configuración local", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useActivateCatalogPart(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        catalogPartId: "10000000-0000-4000-8000-000000000001",
        stockQuantity: 12,
        minStockLevel: 3,
        unitCost: 480,
        location: "Pasillo A",
      });
    });

    expect(activationArgs[0]).toEqual({
      p_catalog_part_id: "10000000-0000-4000-8000-000000000001",
      p_stock_quantity: 12,
      p_min_stock_level: 3,
      p_unit_cost: 480,
      p_location: "Pasillo A",
    });
  });
});

describe("useCreatePart", () => {
  it("inserta refacción y devuelve fila con id generado", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreatePart(), { wrapper: Wrapper });

    let created: unknown;
    await act(async () => {
      created = await result.current.mutateAsync({
        sku: "SKU-001", name: "Filtro aceite", stock_quantity: 10, unit_cost: 250,
      } as never);
    });

    expect(inserts[0]).toMatchObject({ sku: "SKU-001", name: "Filtro aceite" });
    expect(created).toMatchObject({ id: "p-1" });
  });

  it("propaga error con título localizado (unique SKU)", async () => {
    insertResp = { data: null, error: { message: "duplicate key parts_inventory_sku_key" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useCreatePart(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ sku: "SKU-001", name: "x" } as never).catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(notifyErrorMock.mock.calls[0][0]).toMatchObject({ title: "Error al crear refacción" });
  });
});

describe("useUpdatePart", () => {
  it("editar ubicación no puede reenviar las existencias antiguas", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useUpdatePart(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "p-1", min_stock_level: 2, unit_cost: 250, location: "Rack B1", stock_quantity: 10 } as never);
    });

    expect(metadataArgs[0]).toEqual({ p_part_id: "p-1", p_min_stock_level: 2, p_unit_cost: 250, p_location: "Rack B1" });
    expect(updates).toHaveLength(0);
  });
});

describe("useAdjustPartStock", () => {
  it("envía conteo esperado y motivo para el ajuste atómico", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAdjustPartStock(), { wrapper: Wrapper });
    await act(async () => { await result.current.mutateAsync({ id: "p-1", expectedQuantity: 10, newQuantity: 8, reason: "Conteo físico" }); });
    expect(adjustmentArgs[0]).toEqual({ p_part_id: "p-1", p_expected_stock_quantity: 10, p_new_stock_quantity: 8, p_reason: "Conteo físico" });
  });
  it("un conflicto de consumo rechaza el guardado y no invalida datos como éxito", async () => {
    updateResp = { data: null, error: { message: "Las existencias cambiaron" } };
    const { Wrapper, queryClient } = createQueryWrapper();
    queryClient.setDefaultOptions({ queries: { retry: false, gcTime: Infinity } });
    queryClient.setQueryData(["parts_inventory", "list"], { stock_quantity: 9 });
    const { result } = renderHook(() => useAdjustPartStock(), { wrapper: Wrapper });
    await act(async () => { await expect(result.current.mutateAsync({ id: "p-1", expectedQuantity: 10, newQuantity: 11, reason: "Conteo" })).rejects.toMatchObject({ message: "Las existencias cambiaron" }); });
    expect(queryClient.getQueryState(["parts_inventory", "list"])?.isInvalidated).toBe(false);
    expect(queryClient.getQueryData(["parts_inventory", "list"])).toEqual({ stock_quantity: 9 });
  });
});

describe("useDeletePart", () => {
  it("desactiva localmente sin borrar el SKU global", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useDeletePart(), { wrapper: Wrapper });

    await act(async () => { await result.current.mutateAsync("p-1"); });

    expect(updates[0]).toEqual({ patch: { is_active: false }, eqArgs: ["id", "p-1"] });
  });

  it("propaga error al desactivar con título localizado", async () => {
    updateResp = { data: null, error: { message: "update rejected" } };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useDeletePart(), { wrapper: Wrapper });

    await act(async () => {
      await result.current.mutateAsync("p-1").catch(() => {});
    });

    await waitFor(() => expect(notifyErrorMock).toHaveBeenCalled());
    expect(notifyErrorMock.mock.calls[0][0]).toMatchObject({ title: "Error al desactivar refacción" });
  });
});
