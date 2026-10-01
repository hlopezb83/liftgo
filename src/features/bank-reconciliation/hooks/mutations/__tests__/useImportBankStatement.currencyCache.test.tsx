import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";
import { createSupabaseChainMock } from "@/test/helpers/supabaseChain";
import { useBankAccountHasLines } from "../../useBankStatementLines";
import { useImportBankStatement } from "../useImportBankStatement";

let lineCount = 0;
vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: { bank_statement_lines: () => ({ data: null, error: null, count: lineCount }) },
    rpcResolvers: {
      begin_bank_statement_upload: () => ({ data: [{ upload_state: "staging" }], error: null }),
      stage_bank_statement_chunk: () => ({ data: 1, error: null }),
      finalize_bank_statement_upload: () => {
        lineCount = 1;
        return { data: [{ inserted_count: 1, matched_count: 0, suggested_count: 0, unmatched_count: 1 }], error: null };
      },
    },
  }),
}));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: vi.fn(), notifySuccess: vi.fn() }));
beforeEach(() => { lineCount = 0; });

describe("currency guard cache after import", () => {
  it("turns the existing empty-history observer into a locked-history state immediately", async () => {
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => ({
      history: useBankAccountHasLines("bank-1"),
      upload: useImportBankStatement(),
    }), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.history.isSuccess).toBe(true));
    expect(result.current.history.data).toBe(false);
    await act(async () => { await result.current.upload.mutateAsync({
      uploadId: "upload-1", bankAccountId: "bank-1", fileName: "comision.csv",
      periodStart: "2026-09-30", periodEnd: "2026-09-30",
      lines: [{
        posted_date: "2026-09-30", description: "Comisión", signed_amount: -185.6,
        reference: null, hash: "line-1", line_seq: 0, occurrence: 1,
      }],
    }); });
    await waitFor(() => expect(result.current.history.data).toBe(true));
  });
});
