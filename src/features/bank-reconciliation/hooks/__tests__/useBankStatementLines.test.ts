import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";
import { vi } from "vitest";

let mockCount = 0;

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      bank_statement_lines: () => ({ data: null, error: null, count: mockCount } as never),
    },
  }),
}));

import { useBankAccountHasLines } from "../useBankStatementLines";

describe("useBankAccountHasLines", () => {
  // F8: bloquear cambio de moneda depende de este conteo head-only.
  it("devuelve false cuando no hay líneas importadas", async () => {
    mockCount = 0;
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useBankAccountHasLines("acc-1"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(false);
  });

  it("devuelve true cuando hay líneas importadas", async () => {
    mockCount = 3;
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useBankAccountHasLines("acc-2"), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
  });

  it("no ejecuta la query si no hay bankAccountId", () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useBankAccountHasLines(null), { wrapper: Wrapper });
    expect(result.current.fetchStatus).toBe("idle");
  });
});
