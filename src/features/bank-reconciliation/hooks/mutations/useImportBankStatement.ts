import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { bankImportKeys } from "../../lib/queryKeys";
import { bankLinesKey } from "../useBankStatementLines";
import type { ParsedBankLine } from "../../lib/csvParsers";

export interface ImportArgs {
  uploadId: string;
  bankAccountId: string;
  fileName: string;
  lines: ParsedBankLine[];
  periodStart: string | null;
  periodEnd: string | null;
}

interface ImportRpcRow {
  import_id: string | null;
  inserted_count: number;
  matched_count: number;
  suggested_count: number;
  unmatched_count: number;
}

interface BeginUploadRpcRow {
  upload_id: string;
  upload_state: "staging" | "finalized";
  staged_count: number;
  result: Record<string, unknown> | null;
}

export interface ImportResult {
  insertedCount: number;
  summary: null | {
    matched_count: number;
    suggested_count: number;
    unmatched_count: number;
  };
}

type UntypedRpc = (
  name: string,
  args: Record<string, unknown>,
) => PromiseLike<{ data: unknown; error: { message: string } | null }>;

export const BANK_IMPORT_CHUNK_SIZE = 500;

function normalizeImportResult(row: ImportRpcRow | Record<string, unknown> | null): ImportResult {
  if (!row) throw new Error("La importación no devolvió un resultado.");
  const insertedCount = Number(row.inserted_count ?? 0);
  return {
    insertedCount,
    summary: insertedCount === 0 ? null : {
      matched_count: Number(row.matched_count ?? 0),
      suggested_count: Number(row.suggested_count ?? 0),
      unmatched_count: Number(row.unmatched_count ?? 0),
    },
  };
}

function rpcRow<T>(data: unknown): T | null {
  return ((Array.isArray(data) ? data[0] : data) ?? null) as T | null;
}

/**
 * Staging reintentable en bloques pequeños. Sólo `finalize` toca las tablas
 * canónicas y lo hace dentro de una única transacción de base de datos.
 */
export async function importBankStatement(args: ImportArgs): Promise<ImportResult> {
  const rpc = supabase.rpc.bind(supabase) as unknown as UntypedRpc;
  const { data: beginData, error: beginError } = await rpc("begin_bank_statement_upload", {
    p_upload_id: args.uploadId,
    p_bank_account_id: args.bankAccountId,
    p_file_name: args.fileName,
    p_period_start: args.periodStart,
    p_period_end: args.periodEnd,
    p_expected_count: args.lines.length,
  });
  if (beginError) throw beginError;

  const begin = rpcRow<BeginUploadRpcRow>(beginData);
  if (!begin) throw new Error("No se pudo iniciar la carga del estado de cuenta.");
  if (begin.upload_state === "finalized") {
    return normalizeImportResult(begin.result);
  }

  const serializedLines = args.lines.map((line) => ({
    posted_date: line.posted_date,
    description: line.description,
    signed_amount: line.signed_amount,
    reference: line.reference,
    line_seq: line.line_seq,
  }));

  for (let offset = 0; offset < serializedLines.length; offset += BANK_IMPORT_CHUNK_SIZE) {
    const { error: stageError } = await rpc("stage_bank_statement_chunk", {
      p_upload_id: args.uploadId,
      p_chunk_index: Math.floor(offset / BANK_IMPORT_CHUNK_SIZE),
      p_lines: serializedLines.slice(offset, offset + BANK_IMPORT_CHUNK_SIZE),
    });
    if (stageError) throw stageError;
  }

  const { data: finalizeData, error: finalizeError } = await rpc(
    "finalize_bank_statement_upload",
    { p_upload_id: args.uploadId },
  );
  if (finalizeError) throw finalizeError;

  return normalizeImportResult(rpcRow<ImportRpcRow>(finalizeData));
}

export function useImportBankStatement() {
  return useEntityMutation({
    mutationFn: importBankStatement,
    invalidateKeysFn: (_res, vars) => [bankImportKeys.all, bankLinesKey(vars.bankAccountId)],
    errorTitle: "Error al importar estado de cuenta",
    onSuccess: (res) => {
      if (res.insertedCount === 0) {
        notifySuccess("Archivo ya importado: no había movimientos nuevos.");
        return;
      }
      const summary = res.summary;
      if (summary) {
        notifySuccess(
          `Importación lista: ${summary.matched_count ?? 0} conciliados, ${summary.suggested_count ?? 0} sugeridos, ${summary.unmatched_count ?? 0} sin emparejar.`,
        );
      } else {
        notifySuccess("Importación completada");
      }
    },
  });
}
