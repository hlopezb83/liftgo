import { beforeEach, describe, expect, it, vi } from "vitest";

const { rpcMock } = vi.hoisted(() => ({ rpcMock: vi.fn() }));

vi.mock("@/integrations/supabase/client", () => ({
  supabase: { rpc: rpcMock },
}));

import {
  BANK_IMPORT_CHUNK_SIZE,
  importBankStatement,
  type ImportArgs,
} from "../useImportBankStatement";

function makeLine(index: number) {
  return {
    posted_date: "2026-08-03",
    description: `SPEI CLIENTE ${index}`,
    signed_amount: 1_250 + index,
    reference: `R-${index}`,
    line_seq: index,
    hash: `hash-cliente-${index}`,
    occurrence: 1,
  };
}

function makeArgs(lineCount = 1): ImportArgs {
  return {
    uploadId: "1f7790bb-9911-44b0-bd55-1bb0fa34910c",
    bankAccountId: "acc-1",
    fileName: "agosto.csv",
    periodStart: "2026-08-01",
    periodEnd: "2026-08-31",
    lines: Array.from({ length: lineCount }, (_, index) => makeLine(index)),
  };
}

const stagingBegin = {
  upload_id: "1f7790bb-9911-44b0-bd55-1bb0fa34910c",
  upload_state: "staging",
  staged_count: 0,
  result: null,
};

const finalizedResult = {
  import_id: "imp-1",
  inserted_count: 1,
  matched_count: 0,
  suggested_count: 1,
  unmatched_count: 0,
};

describe("importBankStatement · staging transaccional", () => {
  beforeEach(() => rpcMock.mockReset());

  it("envía bloques secuenciales de máximo 500 y finaliza una sola vez", async () => {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "begin_bank_statement_upload") return { data: [stagingBegin], error: null };
      if (name === "stage_bank_statement_chunk") return { data: 500, error: null };
      if (name === "finalize_bank_statement_upload") {
        return { data: [{ ...finalizedResult, inserted_count: 1_001 }], error: null };
      }
      return { data: null, error: null };
    });

    await expect(importBankStatement(makeArgs(1_001))).resolves.toEqual({
      insertedCount: 1_001,
      summary: { matched_count: 0, suggested_count: 1, unmatched_count: 0 },
    });

    expect(BANK_IMPORT_CHUNK_SIZE).toBe(500);
    expect(rpcMock.mock.calls.map(([name]) => name)).toEqual([
      "begin_bank_statement_upload",
      "stage_bank_statement_chunk",
      "stage_bank_statement_chunk",
      "stage_bank_statement_chunk",
      "finalize_bank_statement_upload",
    ]);
    const stageCalls = rpcMock.mock.calls.filter(([name]) => name === "stage_bank_statement_chunk");
    expect(stageCalls.map(([, payload]) => payload.p_chunk_index)).toEqual([0, 1, 2]);
    expect(stageCalls.map(([, payload]) => payload.p_lines.length)).toEqual([500, 500, 1]);
    expect(stageCalls[0]?.[1].p_lines[0]).toEqual({
      posted_date: "2026-08-03",
      description: "SPEI CLIENTE 0",
      signed_amount: 1_250,
      reference: "R-0",
      line_seq: 0,
    });
    expect(JSON.stringify(stageCalls)).not.toContain("hash-cliente");
  });

  it("recupera el resultado guardado si se perdió la respuesta de finalize", async () => {
    rpcMock.mockResolvedValue({
      data: [{ ...stagingBegin, upload_state: "finalized", result: finalizedResult }],
      error: null,
    });

    await expect(importBankStatement(makeArgs())).resolves.toEqual({
      insertedCount: 1,
      summary: { matched_count: 0, suggested_count: 1, unmatched_count: 0 },
    });
    expect(rpcMock).toHaveBeenCalledTimes(1);
    expect(rpcMock).toHaveBeenCalledWith(
      "begin_bank_statement_upload",
      expect.objectContaining({ p_upload_id: makeArgs().uploadId }),
    );
  });

  it("reenvía con el mismo uploadId tras un fallo intermedio sin crear otra sesión", async () => {
    let failSecondChunk = true;
    rpcMock.mockImplementation(async (name: string, payload: Record<string, unknown>) => {
      if (name === "begin_bank_statement_upload") return { data: [stagingBegin], error: null };
      if (name === "stage_bank_statement_chunk" && payload.p_chunk_index === 1 && failSecondChunk) {
        return { data: null, error: { message: "network timeout" } };
      }
      if (name === "stage_bank_statement_chunk") return { data: 501, error: null };
      return { data: [{ ...finalizedResult, inserted_count: 501 }], error: null };
    });
    const retryArgs = makeArgs(501);

    await expect(importBankStatement(retryArgs)).rejects.toEqual({ message: "network timeout" });
    failSecondChunk = false;
    await expect(importBankStatement(retryArgs)).resolves.toEqual({
      insertedCount: 501,
      summary: { matched_count: 0, suggested_count: 1, unmatched_count: 0 },
    });

    const begins = rpcMock.mock.calls.filter(([name]) => name === "begin_bank_statement_upload");
    const stages = rpcMock.mock.calls.filter(([name]) => name === "stage_bank_statement_chunk");
    expect(begins).toHaveLength(2);
    expect(begins.map(([, payload]) => payload.p_upload_id)).toEqual([
      retryArgs.uploadId,
      retryArgs.uploadId,
    ]);
    expect(stages.map(([, payload]) => payload.p_chunk_index)).toEqual([0, 1, 0, 1]);
  });

  it("conserva la respuesta idempotente cuando no hay filas nuevas", async () => {
    rpcMock.mockImplementation(async (name: string) => {
      if (name === "begin_bank_statement_upload") return { data: [stagingBegin], error: null };
      if (name === "stage_bank_statement_chunk") return { data: 1, error: null };
      return {
        data: [{
          import_id: null,
          inserted_count: 0,
          matched_count: 0,
          suggested_count: 0,
          unmatched_count: 0,
        }],
        error: null,
      };
    });

    await expect(importBankStatement(makeArgs())).resolves.toEqual({
      insertedCount: 0,
      summary: null,
    });
  });
});
