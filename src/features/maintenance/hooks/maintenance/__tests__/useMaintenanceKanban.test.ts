import { renderHook, act, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";
import type { DragEndEvent } from "@dnd-kit/core";

/**
 * R9-21: la mutación optimista del kanban de mantenimiento parcheaba SIEMPRE
 * la query key con `archived:false`, aunque el usuario estuviera en la vista
 * de archivados de `MaintenancePage`. Esto dejaba la vista de archivados sin
 * feedback optimista y de paso contaminaba la lista activa con datos que no
 * le pertenecían. `useMaintenanceKanban(archived)` ahora recibe el filtro
 * visible y debe tocar EXACTAMENTE esa caché.
 */

vi.mock("@/lib/ui/appFeedback", () => ({
  notifyError: vi.fn(),
  notifySuccess: vi.fn(),
  notifyInfo: vi.fn(),
  notifyWarning: vi.fn(),
  notifyValidation: vi.fn(),
  notifyAsync: vi.fn(),
}));

let updateResp: { data: unknown; error: { message: string } | null } = {
  data: { id: "log-1", work_status: "in_progress" },
  error: null,
};

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      maintenance_logs: (calls) => {
        const upd = calls.find((c) => c.method === "update");
        if (upd) return updateResp;
        return { data: null, error: null };
      },
    },
  }),
}));

import { maintenanceLogQueries } from "../useMaintenanceLogs";
import { useMaintenanceKanban } from "../useMaintenanceKanban";

const ACTIVE_KEY = maintenanceLogQueries.list({ forkliftId: null, archived: false }).queryKey;
const ARCHIVED_KEY = maintenanceLogQueries.list({ forkliftId: null, archived: true }).queryKey;

function makeLog(id: string, work_status: string) {
  return { id, work_status, forklift_id: "f-1" } as never;
}

function dragEvent(id: string, sourceStatus: string, targetStatus: string): DragEndEvent {
  return {
    active: { id, data: { current: { status: sourceStatus } } },
    over: { id: targetStatus, data: { current: { type: "column" } } },
  } as unknown as DragEndEvent;
}

beforeEach(() => {
  updateResp = { data: { id: "log-1", work_status: "in_progress" }, error: null };
});

describe("useMaintenanceKanban · vista activa", () => {
  it("parchea solo la key activa (archived:false) y no toca la de archivados", async () => {
    const { Wrapper, queryClient } = createQueryWrapper();
    queryClient.setQueryData(ACTIVE_KEY, [makeLog("log-1", "pending")]);
    queryClient.setQueryData(ARCHIVED_KEY, [makeLog("log-9", "pending")]);

    const { result } = renderHook(() => useMaintenanceKanban(false), { wrapper: Wrapper });

    act(() => {
      result.current.onDragEnd(dragEvent("log-1", "pending", "in_progress"));
    });

    // Optimistic update inmediato en la key activa.
    expect(queryClient.getQueryData(ACTIVE_KEY)).toEqual([
      { id: "log-1", work_status: "in_progress", forklift_id: "f-1" },
    ]);
    // La caché de archivados no se contamina.
    expect(queryClient.getQueryData(ARCHIVED_KEY)).toEqual([
      { id: "log-9", work_status: "pending", forklift_id: "f-1" },
    ]);

    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });
});

describe("useMaintenanceKanban · vista de archivados", () => {
  it("parchea solo la key archivada (archived:true) y no toca la vista activa", async () => {
    const { Wrapper, queryClient } = createQueryWrapper();
    queryClient.setQueryData(ACTIVE_KEY, [makeLog("log-5", "pending")]);
    queryClient.setQueryData(ARCHIVED_KEY, [makeLog("log-1", "pending")]);

    const { result } = renderHook(() => useMaintenanceKanban(true), { wrapper: Wrapper });

    act(() => {
      result.current.onDragEnd(dragEvent("log-1", "pending", "in_progress"));
    });

    expect(queryClient.getQueryData(ARCHIVED_KEY)).toEqual([
      { id: "log-1", work_status: "in_progress", forklift_id: "f-1" },
    ]);
    // La caché de la vista activa no se contamina.
    expect(queryClient.getQueryData(ACTIVE_KEY)).toEqual([
      { id: "log-5", work_status: "pending", forklift_id: "f-1" },
    ]);

    await waitFor(() => expect(queryClient.isMutating()).toBe(0));
  });

  it("en error, la invalidación apunta a maintenanceLogKeys.all (cubre ambas vistas) sin dejar un parche fantasma", async () => {
    updateResp = { data: null, error: { message: "db down" } };
    const { Wrapper, queryClient } = createQueryWrapper();
    queryClient.setQueryData(ARCHIVED_KEY, [makeLog("log-1", "pending")]);
    const invalidateSpy = vi.spyOn(queryClient, "invalidateQueries");

    const { result } = renderHook(() => useMaintenanceKanban(true), { wrapper: Wrapper });

    act(() => {
      result.current.onDragEnd(dragEvent("log-1", "pending", "in_progress"));
    });

    await waitFor(() => expect(invalidateSpy).toHaveBeenCalled());
    const calledKeys = invalidateSpy.mock.calls.map((c) => (c[0] as { queryKey: unknown[] }).queryKey);
    // La invalidación en error usa `maintenanceLogKeys.all` (["maintenance_logs"]),
    // que es prefijo tanto de la key activa como de la archivada — refresca
    // ambas vistas desde el server en vez de dejar un parche optimista roto.
    expect(calledKeys).toEqual([["maintenance_logs"]]);
    expect(JSON.stringify(ARCHIVED_KEY).startsWith(JSON.stringify(calledKeys[0]).slice(0, -1))).toBe(true);
  });
});
