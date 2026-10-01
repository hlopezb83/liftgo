import { useEffect, useRef } from "react";
import { chargeableDamageCost } from "@/features/damage";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { notifyError, notifyWarning } from "@/lib/ui/appFeedback";
import type { InvoiceFormValues } from "../lib/invoiceFormSchema";
import type { UseFormReturn } from "react-hook-form";

interface Params {
  isEdit: boolean;
  damageId: string | null;
  damageCustomerId: string | null;
  customers?: Tables<"customers">[];
  form: UseFormReturn<InvoiceFormValues>;
  handleCustomerSelect: (id: string) => void;
}

/**
 * Al llegar desde "Facturar daño", sugiere el costo interno real registrado.
 * El usuario revisa el precio al cliente antes de emitir la factura.
 *
 * R19-D: en caché frío `useCustomers` todavía no tiene el catálogo → Radix
 * Select dispara `onValueChange("")` porque el `SelectItem` no existe y borra
 * el prefill. Esperamos a que cargue.
 *
 * R20-1: verificar que el daño no esté ya facturado — una URL artesanal
 * podía re-prellenar y permitir una 2ª factura por el mismo daño.
 *
 * El monto y su procedencia se leen de la BD. El presupuesto y los parámetros
 * de URL no sustituyen una valoración real, incluyendo cero intencional.
 */
export function useDamagePrefill({
  isEdit, damageId, damageCustomerId, customers, form, handleCustomerSelect,
}: Params) {
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    if (isEdit || !damageId || !damageCustomerId || damageCustomerId === "null") return;
    if (!customers?.length) return;

    let cancelled = false;
    supabase
      .from("damage_records")
      .select("status, estimated_cost, actual_cost, actual_cost_source, repaired_at")
      .eq("id", damageId)
      .is("deleted_at", null)
      .maybeSingle()
      .then(({ data: damage, error }) => {
        if (cancelled || prefilledRef.current) return;
        if (error || !damage) return;
        prefilledRef.current = true;
        if (damage.status === "invoiced") {
          notifyError({ title: "Este daño ya fue facturado" });
          return;
        }
        if (damage.status !== "repaired" || !damage.repaired_at) {
          notifyError({
            title: "Primero completa la reparación",
            description: "El daño debe estar reparado antes de crear su factura.",
          });
          return;
        }
        handleCustomerSelect(damageCustomerId);
        // El costo interno sólo sugiere un precio; no se emite ningún cobro aquí.
        const amt = chargeableDamageCost(damage);
        if (amt != null && Number.isFinite(amt) && amt > 0) {
          form.setValue(
            "lineItems",
            [{ description: `Cobro de daño (ref. ${damageId.slice(0, 8)})`, quantity: 1, unit_price: amt, total: amt }],
            { shouldDirty: true },
          );
        } else {
          notifyWarning({
            title: amt === 0 ? "Reparación con costo interno de $0" : "Sin costo real de reparación registrado",
            description: amt === 0
              ? "Revisa el precio a cobrar al cliente antes de crear la factura."
              : "Cierra la orden de trabajo o solicita una valoración antes de facturar este daño.",
          });
        }
      });
    return () => { cancelled = true; };
  }, [isEdit, damageId, damageCustomerId, customers, form, handleCustomerSelect]);
}
