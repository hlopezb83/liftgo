import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";

const callRpcMock = vi.fn();

vi.mock("@/lib/rpc", () => ({
  callRpc: (...args: unknown[]) => callRpcMock(...args),
}));

import { useSaleAvailableForklifts } from "../useSaleAvailableForklifts";

describe("useSaleAvailableForklifts", () => {
  beforeEach(() => callRpcMock.mockReset());

  it("recorre todas las páginas de la fuente canónica sin el límite del listado general", async () => {
    const firstPage = Array.from({ length: 200 }, (_, index) => ({ id: `f-${index}` }));
    callRpcMock
      .mockResolvedValueOnce(firstPage)
      .mockResolvedValueOnce([{ id: "f-200" }]);

    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSaleAvailableForklifts(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toHaveLength(201);
    expect(callRpcMock).toHaveBeenNthCalledWith(1, "get_sale_available_forklifts", {
      p_limit: 200,
      p_offset: 0,
    });
    expect(callRpcMock).toHaveBeenNthCalledWith(2, "get_sale_available_forklifts", {
      p_limit: 200,
      p_offset: 200,
    });
  });

  it("propaga errores de la consulta canónica", async () => {
    callRpcMock.mockRejectedValueOnce(new Error("permission denied"));

    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useSaleAvailableForklifts(), { wrapper: Wrapper });

    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toEqual(new Error("permission denied"));
  });
});
