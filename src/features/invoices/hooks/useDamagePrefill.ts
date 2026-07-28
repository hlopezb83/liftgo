import { useEffect, useRef } from "react";
import type { Tables } from "@/integrations/supabase/types";
import type { InvoiceFormValues } from "../lib/invoiceFormSchema";
import type { UseFormReturn } from "react-hook-form";

interface Params {
  isEdit: boolean;
  damageId: string | null;
  damageCustomerId: string | null;
  damageAmount: string | null;
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
 */
export function useDamagePrefill({
  isEdit, damageId, damageCustomerId, damageAmount, customers, form, handleCustomerSelect,
}: Params) {
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    // R19-D · C-4: el string "null" (daño sin cliente) no es un uuid válido.
    if (isEdit || !damageId || !damageCustomerId || damageCustomerId === "null") return;
    // R19-D: esperar a que cargue el catálogo de clientes.
    if (!customers?.length) return;
    prefilledRef.current = true;
    handleCustomerSelect(damageCustomerId);
    const amt = Number(damageAmount);
    if (Number.isFinite(amt) && amt > 0) {
      form.setValue(
        "lineItems",
        [{ description: `Cobro de daño (ref. ${damageId.slice(0, 8)})`, quantity: 1, unit_price: amt, total: amt }],
        { shouldDirty: true },
      );
    }
  }, [isEdit, damageId, damageCustomerId, damageAmount, customers, form, handleCustomerSelect]);
}
