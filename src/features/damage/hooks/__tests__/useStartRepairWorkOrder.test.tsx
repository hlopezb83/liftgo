import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DamageRecordWithJoins } from "@/types/rental";
import { useStartRepairWorkOrder } from "../useStartRepairWorkOrder";

const mocks = vi.hoisted(() => ({
  rpc: vi.fn(),
  insertSingle: vi.fn(),
  updateSingle: vi.fn(),
  notifySuccess: vi.fn(),
  notifyError: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({
  useAuth: () => ({ user: { email: "tech@liftgo.mx" } }),
}));
vi.mock("@/lib/ui/appFeedback", () => ({
  notifySuccess: mocks.notifySuccess,
  notifyError: mocks.notifyError,
}));
vi.mock("@/integrations/supabase/client", () => ({
  supabase: {
    rpc: (...args: unknown[]) => mocks.rpc(...args),
    from: (table: string) => ({
      insert: () => ({
        select: () => ({
          single: () => mocks.insertSingle(table),
        }),
      }),
      update: () => ({
        eq: () => ({
          select: () => ({
            single: () => mocks.updateSingle(table),
          }),
        }),
      }),
    }),
  },
}));

const sampleRecord = {
  id: "dmg-1",
  forklift_id: "fk-1",
  description: "Golpe en mástil",
  estimated_cost: 1500,
  status: "reported",
} as unknown as DamageRecordWithJoins;

function createWrapper() {
  const client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

describe("useStartRepairWorkOrder", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("usa el RPC start_repair_work_order y expone isPending hasta terminar", async () => {
    let resolveRpc!: (value: { data: string; error: null }) => void;
    mocks.rpc.mockReturnValueOnce(new Promise((res) => { resolveRpc = res; }));
    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useStartRepairWorkOrder(), { wrapper });

    act(() => {
      result.current.mutate(sampleRecord);
    });
    await waitFor(() => expect(result.current.isPending).toBe(true));
    expect(mocks.notifySuccess).not.toHaveBeenCalled();

    await act(async () => {
      resolveRpc({ data: "maint-1", error: null });
    });
    await waitFor(() => expect(result.current.isPending).toBe(false));
    expect(mocks.notifySuccess).toHaveBeenCalledWith("Orden de mantenimiento creada");
  });

  it("revierte el maintenance_log si el fallback legado falla al enlazar damage_records", async () => {
    mocks.rpc
      .mockResolvedValueOnce({ data: null, error: { code: "PGRST202", message: "could not find the function" } })
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.insertSingle.mockResolvedValueOnce({ data: { id: "maint-fallback" }, error: null });
    mocks.updateSingle.mockResolvedValueOnce({ data: null, error: new Error("RLS denied") });

    const { wrapper } = createWrapper();
    const { result } = renderHook(() => useStartRepairWorkOrder(), { wrapper });

    await act(async () => {
      result.current.mutate(sampleRecord);
    });
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(mocks.notifySuccess).not.toHaveBeenCalled();
    expect(mocks.rpc).toHaveBeenCalledWith("soft_delete_maintenance_log", { p_log_id: "maint-fallback" });
  });
});
