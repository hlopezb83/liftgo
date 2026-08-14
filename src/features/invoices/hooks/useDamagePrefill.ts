import { useEffect, useRef } from "react";
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
 * R18-A3: al llegar desde "Facturar daño", prefillamos cliente + una partida
 * por el costo estimado.
 *
 * R19-D: en caché frío `useCustomers` todavía no tiene el catálogo → Radix
 * Select dispara `onValueChange("")` porque el `SelectItem` no existe y borra
 * el prefill. Esperamos a que cargue.
 *
 * R20-1: verificar que el daño no esté ya facturado — una URL artesanal
 * podía re-prellenar y permitir una 2ª factura por el mismo daño.
 *
 * Fix 5.1: el monto se lee de `damage_records.estimated_cost` (BD), nunca de
 * un query param — antes se podía editar `damageAmount` en la URL y prellenar
 * cualquier monto.
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
      .select("status, estimated_cost")
      .eq("id", damageId)
      .maybeSingle()
      .then(({ data: damage, error }) => {
        if (cancelled || prefilledRef.current) return;
        if (error || !damage) return;
        prefilledRef.current = true;
        if (damage.status === "invoiced") {
          notifyError({ title: "Este daño ya fue facturado" });
          return;
        }
        handleCustomerSelect(damageCustomerId);
        const amt = Number(damage.estimated_cost);
        if (Number.isFinite(amt) && amt > 0) {
          form.setValue(
            "lineItems",
            [{ description: `Cobro de daño (ref. ${damageId.slice(0, 8)})`, quantity: 1, unit_price: amt, total: amt }],
            { shouldDirty: true },
          );
        } else {
          notifyWarning({
            title: "Sin costo estimado registrado",
            description: "Captura el monto a facturar manualmente.",
          });
        }
      });
    return () => { cancelled = true; };
  }, [isEdit, damageId, damageCustomerId, customers, form, handleCustomerSelect]);
}
