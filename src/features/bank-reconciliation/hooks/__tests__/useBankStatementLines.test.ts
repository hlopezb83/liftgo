import { renderHook, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";
import { vi } from "vitest";

let mockCount = 0;
let lastPageArgs: unknown;
let pagePayload: unknown;

const pageRows = [
  {
    id: "line-1",
    import_id: "import-1",
    bank_account_id: "acc-page",
    posted_date: "2026-09-01",
    description: "DEPÓSITO CLIENTE",
    signed_amount: "1234.56",
    reference: "REF-1",
    status: "unmatched",
    matched_payment_id: null,
    matched_supplier_payment_id: null,
    suggested_payment_id: null,
    suggested_supplier_payment_id: null,
    match_score: null,
    matched_at: null,
    ignored_reason: null,
  },
];

pagePayload = { rows: pageRows, total_count: "51" };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: {
      bank_statement_lines: () =>
        ({ data: null, error: null, count: mockCount }) as never,
    },
    rpcResolvers: {
      get_bank_statement_lines_page: (args) => {
        lastPageArgs = args;
        return { data: pagePayload, error: null };
      },
      get_bank_reconciliation_kpis: () => ({
        data: [
          {
            total_count: "87",
            matched_count: "40",
            pending_count: "42",
            ignored_count: "5",
            charges: "2300.50",
            credits: "1525.25",
          },
        ],
        error: null,
      }),
    },
  }),
}));

import {
  useBankAccountHasLines,
  useBankReconciliationKpis,
  useBankStatementLines,
} from "../useBankStatementLines";

describe("useBankAccountHasLines", () => {
  // F8: bloquear cambio de moneda depende de este conteo head-only.
  it("devuelve false cuando no hay líneas importadas", async () => {
    mockCount = 0;
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useBankAccountHasLines("acc-1"), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(false);
  });

  it("devuelve true cuando hay líneas importadas", async () => {
    mockCount = 3;
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useBankAccountHasLines("acc-2"), {
      wrapper: Wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toBe(true);
  });

  it("no ejecuta la query si no hay bankAccountId", () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useBankAccountHasLines(null), {
      wrapper: Wrapper,
    });
    expect(result.current.fetchStatus).toBe("idle");
  });
});

describe("bank reconciliation server aggregates", () => {
  it("pagina y filtra en el RPC sin truncar el resultado en cliente", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(
      () =>
        useBankStatementLines("acc-page", {
          status: "unmatched",
          search: "  cliente  ",
          page: 3,
          pageSize: 25,
        }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(lastPageArgs).toEqual({
      p_bank_account_id: "acc-page",
      p_status: "unmatched",
      p_search: "cliente",
      p_page_size: 25,
      p_offset: 50,
    });
    expect(result.current.totalCount).toBe(51);
    expect(result.current.data).toEqual([
      expect.objectContaining({ id: "line-1", signed_amount: 1234.56 }),
    ]);
  });

  it("obtiene KPIs globales del servidor, independientes de la página visible", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useBankReconciliationKpis("acc-page"), {
      wrapper: Wrapper,
    });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual({
      totalCount: 87,
      matchedCount: 40,
      pendingCount: 42,
      ignoredCount: 5,
      charges: 2300.5,
      credits: 1525.25,
    });
  });

  it("conserva total_count aunque la página solicitada esté vacía", async () => {
    pagePayload = { rows: [], total_count: "51" };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(
      () => useBankStatementLines("acc-page", { page: 99, pageSize: 25 }),
      { wrapper: Wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([]);
    expect(result.current.totalCount).toBe(51);
    pagePayload = { rows: pageRows, total_count: "51" };
  });
});
