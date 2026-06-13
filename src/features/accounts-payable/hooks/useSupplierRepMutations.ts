import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { notifyError } from "@/lib/ui/appFeedback";
import { callRpc } from "@/lib/rpc";
import { SUPPLIER_BILLS_QK } from "./useSupplierBills";

function invalidate(qc: ReturnType<typeof useQueryClient>, billId?: string | null) {
  qc.invalidateQueries({ queryKey: SUPPLIER_BILLS_QK });
  qc.invalidateQueries({ queryKey: ["accounts_payable_kpis"] });
  if (billId) qc.invalidateQueries({ queryKey: ["supplier_bill", billId] });
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = String(reader.result ?? "");
      const idx = result.indexOf(",");
      resolve(idx >= 0 ? result.slice(idx + 1) : result);
    };
    reader.onerror = () => reject(reader.error ?? new Error("read error"));
    reader.readAsDataURL(file);
  });
}

function parseFunctionsError(error: unknown): never {
  type FnErr = Error & { context?: { body?: unknown } };
  const ctxBody = (error as FnErr).context?.body;
  if (typeof ctxBody === "string" && ctxBody.length > 0) {
    try {
      const parsed = JSON.parse(ctxBody) as { error?: string };
      if (parsed?.error) throw new Error(parsed.error);
    } catch (e: unknown) {
      if (e instanceof Error && e.message) throw e;
    }
  }
  throw error;
}

export function useUploadSupplierRep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      paymentId, xmlFile, pdfFile,
    }: { paymentId: string; xmlFile: File; pdfFile?: File | null; billId?: string | null }) => {
      const xml_base64 = await fileToBase64(xmlFile);
      const pdf_base64 = pdfFile ? await fileToBase64(pdfFile) : null;
      const { data, error } = await supabase.functions.invoke("validate-supplier-rep", {
        body: { payment_id: paymentId, xml_base64, pdf_base64 },
      });
      if (error) parseFunctionsError(error);
      if (data?.error) throw new Error(data.error);
      return data;
    },
    onSuccess: (_d, vars) => {
      invalidate(qc, vars.billId ?? null);
      toast.success("REP recibido y validado");
    },
    onError: (e: unknown) => notifyError({ error: e, message: "No se pudo validar el REP" }),
  });
}

export function useRejectSupplierRep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ paymentId, notes }: { paymentId: string; notes: string; billId?: string | null }) =>
      callRpc<null>("mark_supplier_rep_rejected", { p_payment_id: paymentId, p_notes: notes }),
    onSuccess: (_d, vars) => {
      invalidate(qc, vars.billId ?? null);
      toast.success("REP marcado como rechazado");
    },
    onError: (e: unknown) => notifyError({ error: e, message: "No se pudo rechazar el REP" }),
  });
}

export function useResetSupplierRep() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ paymentId }: { paymentId: string; billId?: string | null }) =>
      callRpc<null>("reset_supplier_rep_pending", { p_payment_id: paymentId }),
    onSuccess: (_d, vars) => {
      invalidate(qc, vars.billId ?? null);
      toast.success("REP reiniciado a pendiente");
    },
    onError: (e: unknown) => notifyError({ error: e, message: "No se pudo reiniciar el REP" }),
  });
}
