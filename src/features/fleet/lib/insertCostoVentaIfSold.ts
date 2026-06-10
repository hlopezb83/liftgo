import { supabase } from "@/integrations/supabase/client";
import { notifyWarning } from "@/lib/ui/appFeedback";
import { nowMty } from "@/lib/utils";
import { toYMD } from "@/lib/date/toYMD";

/**
 * Registra automáticamente un asiento de costo de venta cuando un montacargas
 * pasa a estado "sold". No es una CxP real, por eso se marca pagada con saldo 0.
 */
export async function insertCostoVentaIfSold(forkliftId: string, toStatus: string) {
  if (toStatus !== "sold") return;
  const { data: fl } = await supabase
    .from("forklifts").select("name, acquisition_cost").eq("id", forkliftId).single();
  const cost = Number(fl?.acquisition_cost ?? 0);
  if (cost <= 0) return;
  const today = toYMD(nowMty()) ?? "";
  const { data: created, error: billError } = await supabase.from("supplier_bills").insert({
    bill_number: "",
    category: "costo_venta",
    description: `Costo de venta: ${fl?.name ?? "Montacargas"}`,
    subtotal: cost,
    tax_amount: 0,
    total: cost,
    currency: "MXN",
    issue_date: today,
    due_date: today,
  }).select("id").single();
  if (billError) {
    notifyWarning({ title: "No se pudo registrar el costo de venta automáticamente", description: billError.message });
    return;
  }
  await supabase.from("supplier_bills").update({ status: "paid", balance: 0 }).eq("id", created.id);
}
