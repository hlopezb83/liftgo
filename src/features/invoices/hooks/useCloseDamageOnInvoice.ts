import { supabase } from "@/integrations/supabase/client";
import { notifyError } from "@/lib/ui/appFeedback";

export interface CloseDamageOnInvoiceResult {
  readonly closedRows: { id: string }[] | null;
  readonly alreadyInvoiced: boolean;
}

/**
 * N4-r3 / FIX-03 (H9): cierra un daño como facturado vinculándolo a la
 * factura recién creada, pero solo si nadie más lo facturó antes.
 * UPDATE condicional: afecta 0 filas cuando otro proceso ya marcó el daño.
 */
export async function closeDamageOnInvoice(
  damageId: string,
  invoiceId: string,
  invoiceNumber: string,
): Promise<CloseDamageOnInvoiceResult> {
  const { data: closedRows, error: closeError } = await supabase
    .from("damage_records")
    .update({ status: "invoiced", invoice_id: invoiceId })
    .eq("id", damageId)
    .neq("status", "invoiced")
    .is("invoice_id", null)
    .select("id");

  if (closeError) {
    notifyError({
      error: closeError,
      title: `Factura ${invoiceNumber} creada, pero no se pudo ligar el daño`,
    });
    return { closedRows: null, alreadyInvoiced: false };
  }

  if (!closedRows || closedRows.length === 0) {
    notifyError({
      title: "Este daño ya fue facturado",
      error: new Error(
        `La factura ${invoiceNumber} puede ser un duplicado: otro proceso ya marcó el daño como facturado. Verifica y cancela la que sobre.`,
      ),
    });
    return { closedRows: null, alreadyInvoiced: true };
  }

  return { closedRows, alreadyInvoiced: false };
}

/**
 * Hook que expone el helper de cierre de daño. No mantiene estado propio
 * porque la operación es una llamada directa a backend.
 */
export function useCloseDamageOnInvoice() {
  return { closeDamageOnInvoice };
}
