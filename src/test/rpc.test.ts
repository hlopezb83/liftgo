import { describe, it, expect, vi, beforeEach } from "vitest";

const rpcMock = vi.fn();
vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: (...a: unknown[]) => rpcMock(...a) },
}));

import { callRpc } from "@/lib/rpc";

describe("callRpc", () => {
  beforeEach(() => rpcMock.mockReset());

  it("retorna data tipada cuando no hay error", async () => {
    rpcMock.mockResolvedValue({ data: { id: "x" }, error: null });
    const r = await callRpc<{ id: string }>("create_booking", { p_x: 1 });
    expect(r.id).toBe("x");
    expect(rpcMock).toHaveBeenCalledWith("create_booking", { p_x: 1 });
  });

  it("envía {} por defecto cuando no se pasan args", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });
    await callRpc("create_booking");
    expect(rpcMock).toHaveBeenCalledWith("create_booking", {});
  });

  it("lanza el error de Supabase", async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: "boom" } });
    await expect(callRpc("create_booking")).rejects.toEqual({ message: "boom" });
  });
});
