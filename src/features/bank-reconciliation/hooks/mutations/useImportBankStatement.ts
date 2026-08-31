import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { bankImportKeys } from "../../lib/queryKeys";
import { bankLinesKey } from "../useBankStatementLines";
import { assignOccurrences } from "../../lib/bankParseUtils";
import type { ParsedBankLine } from "../../lib/csvParsers";

interface ImportArgs {
  bankAccountId: string;
  fileName: string;
  lines: ParsedBankLine[];
  periodStart: string | null;
  periodEnd: string | null;
}

export function useImportBankStatement() {
  return useEntityMutation({
    mutationFn: async (args: ImportArgs) => {
      const { data: imp, error: impErr } = await supabase
        .from("bank_statement_imports")
        .insert({
          bank_account_id: args.bankAccountId,
          file_name: args.fileName,
          period_start: args.periodStart,
          period_end: args.periodEnd,
          lines_count: args.lines.length,
        })
        .select("id")
        .single();
      if (impErr) throw impErr;

      // A5-09: la dedup es (bank_account_id, hash, occurrence). `occurrence`
      // numera las repeticiones de un movimiento identico dentro del archivo,
      // asi que el resultado no depende del orden de las lineas.
      const rows = assignOccurrences(args.lines).map((l) => ({
        import_id: imp.id,
        bank_account_id: args.bankAccountId,
        posted_date: l.posted_date,
        description: l.description,
        signed_amount: l.signed_amount,
        reference: l.reference,
        line_seq: l.line_seq,
        hash: l.hash,
        occurrence: l.occurrence,
      }));

      // M-12: upsert en lotes de 1000 filas. Un único upsert con archivos
      // grandes excede los límites de payload / statement_timeout de PostgREST.
      // Si cualquier lote falla, se borran las líneas ya insertadas y el header
      // para no dejar importaciones a medias.
      const CHUNK_SIZE = 1000;
      let insertedCount = 0;
      try {
        for (let offset = 0; offset < rows.length; offset += CHUNK_SIZE) {
          const chunk = rows.slice(offset, offset + CHUNK_SIZE);
          // R23-11: `select()` nos dice cuántas líneas eran realmente nuevas.
          const { data: inserted, error: insErr } = await supabase
            .from("bank_statement_lines")
            .upsert(chunk, { onConflict: "bank_account_id,hash,occurrence", ignoreDuplicates: true })
            .select("id");
          if (insErr) throw insErr;
          insertedCount += inserted?.length ?? 0;
        }
      } catch (chunkErr) {
        const { error: cleanupLinesErr } = await supabase
          .from("bank_statement_lines").delete().eq("import_id", imp.id);
        const { error: cleanupImpErr } = await supabase
          .from("bank_statement_imports").delete().eq("id", imp.id);
        if (cleanupLinesErr || cleanupImpErr) {
          const cleanupError = new Error(
            "La importación falló y no se pudo limpiar por completo. Revisa el estado de cuenta antes de reintentar.",
          );
          (cleanupError as Error & { cause?: unknown }).cause = chunkErr;
          throw cleanupError;
        }
        throw chunkErr;
      }

      if (insertedCount === 0) {
        // Reimportación del mismo archivo: no dejamos un import huérfano en 0.
        // N-24: borramos también las líneas del import previo (si las hubiera)
        // antes del header, para no dejar líneas huérfanas.
        await supabase.from("bank_statement_lines").delete().eq("import_id", imp.id);
        await supabase.from("bank_statement_imports").delete().eq("id", imp.id);
        return { summary: null, insertedCount: 0 };
      }

      if (insertedCount !== args.lines.length) {
        await supabase
          .from("bank_statement_imports")
          .update({ lines_count: insertedCount })
          .eq("id", imp.id);
      }

      // N-24: si el emparejamiento falla, limpiamos líneas + header igual que en
      // el fallo del upsert, para no dejar importaciones a medias.
      try {
        const { data: matchRes, error: matchErr } = await supabase.rpc("match_bank_statement_lines", {
          p_import_id: imp.id,
        });
        if (matchErr) throw matchErr;
        return { summary: Array.isArray(matchRes) && matchRes[0] ? matchRes[0] : null, insertedCount };
      } catch (matchErr) {
        await supabase.from("bank_statement_lines").delete().eq("import_id", imp.id);
        await supabase.from("bank_statement_imports").delete().eq("id", imp.id);
        throw matchErr;
      }
    },
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

