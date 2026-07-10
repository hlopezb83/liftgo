import { supabase } from "@/integrations/supabase/client";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";
import { callRpc } from "@/lib/rpc";
import { supplierBillKeys } from "./useSupplierBills";

const invalidationKeys = (billId?: string | null) => {
  const base = [supplierBillKeys.all, ["accounts_payable_kpis"] as const];
  return billId ? [...base, supplierBillKeys.detail(billId)] : base;
};


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
  return useEntityMutation({
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
    invalidateKeysFn: (_d, vars) => invalidationKeys(vars.billId ?? null),
    successMsg: "REP recibido y validado",
    errorTitle: "No se pudo validar el REP",
  });
}

export function useRejectSupplierRep() {
  return useEntityMutation({
    mutationFn: async ({ paymentId, notes }: { paymentId: string; notes: string; billId?: string | null }) =>
      callRpc<null>("mark_supplier_rep_rejected", { p_payment_id: paymentId, p_notes: notes }),
    invalidateKeysFn: (_d, vars) => invalidationKeys(vars.billId ?? null),
    successMsg: "REP marcado como rechazado",
    errorTitle: "No se pudo rechazar el REP",
  });
}

export function useResetSupplierRep() {
  return useEntityMutation({
    mutationFn: async ({ paymentId }: { paymentId: string; billId?: string | null }) =>
      callRpc<null>("reset_supplier_rep_pending", { p_payment_id: paymentId }),
    invalidateKeysFn: (_d, vars) => invalidationKeys(vars.billId ?? null),
    successMsg: "REP reiniciado a pendiente",
    errorTitle: "No se pudo reiniciar el REP",
  });
}
