import { useEffect, useRef } from "react";
import type { UseFormReturn } from "react-hook-form";
import type { InvoiceFormValues } from "../lib/invoiceFormSchema";

interface Params {
  isEdit: boolean;
  damageId: string | null;
  damageCustomerId: string | null;
  damageAmount: string | null;
  form: UseFormReturn<InvoiceFormValues>;
  handleCustomerSelect: (id: string) => void;
}

/**
 * R18-A3: al llegar desde "Facturar daño", prefillamos cliente + una partida
 * por el costo estimado. Evita que el usuario tenga que capturar de nuevo.
 */
export function useDamagePrefill({
  isEdit, damageId, damageCustomerId, damageAmount, form, handleCustomerSelect,
}: Params) {
  const prefilledRef = useRef(false);
  useEffect(() => {
    if (prefilledRef.current) return;
    if (isEdit || !damageId || !damageCustomerId) return;
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
  }, [isEdit, damageId, damageCustomerId, damageAmount, form, handleCustomerSelect]);
}
