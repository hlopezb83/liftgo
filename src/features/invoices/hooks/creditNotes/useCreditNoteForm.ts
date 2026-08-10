import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { applyDiscountToBase, lineItemTotal } from "@/lib/domain/invoiceHelpers";
import { parseLineItems } from "@/lib/domain/lineItems";
import { roundMoney, sumMoney } from "@/lib/money";
import { useCreateCreditNote } from "./useCreditNotes";

export type EditableCreditNoteLine = LineItem & { _selected: boolean };

export function useCreditNoteForm(
  invoice: Tables<"invoices">,
  maxCreditable: number,
  onClose: () => void,
) {
  const original = parseLineItems<LineItem>(invoice.line_items);
  const [motive, setMotive] = useState<string>("return");
  const [reason, setReason] = useState("");
  const [lines, setLines] = useState<EditableCreditNoteLine[]>(() =>
    original.map((li) => ({ ...li, _selected: true })),
  );
  const createMutation = useCreateCreditNote();

  const taxRate = Number(invoice.tax_rate) || 0;
  // BL-001: sumMoney/roundMoney evitan drift IEEE-754 acumulado en el subtotal
  // y en el redondeo final del IVA (currency.js internamente).
  // M24: la base de cada línea es qty×price MENOS su descuento (mismo criterio
  // que el timbrado BL-02). Ignorarlo inflaba la NC sobre facturas con descuento.
  const subtotal = sumMoney(
    lines
      .filter((l) => l._selected)
      .map((l) =>
        applyDiscountToBase(
          lineItemTotal(l.quantity, l.unit_price),
          l.discount,
          l.discount_type,
        )
      ),
  );
  const taxAmount = roundMoney(subtotal * (taxRate / 100));
  const total = roundMoney(subtotal + taxAmount);
  const exceedsMax = total > maxCreditable + 0.01;
  const canSubmit =
    reason.trim().length > 0 && total > 0 && !exceedsMax && !createMutation.isPending;

  const reset = () => {
    setMotive("return");
    setReason("");
    setLines(original.map((li) => ({ ...li, _selected: true })));
  };

  const updateLine = (idx: number, patch: Partial<EditableCreditNoteLine>) => {
    setLines((prev) => prev.map((l, i) => (i === idx ? { ...l, ...patch } : l)));
  };

  const submit = (stamp: boolean) => {
    const selectedLines = lines
      .filter((l) => l._selected && Number(l.quantity) > 0 && Number(l.unit_price) > 0)
      // M24: persistir el total NETO de línea (con descuento aplicado) para que
      // la NC y su CFDI reflejen lo realmente acreditado.
      .map(({ _selected: _s, ...rest }) => ({
        ...rest,
        total: applyDiscountToBase(
          lineItemTotal(rest.quantity, rest.unit_price),
          rest.discount,
          rest.discount_type,
        ),
      }));

    createMutation.mutate(
      {
        invoice_id: invoice.id,
        customer_id: invoice.customer_id,
        motive,
        reason_text: reason.trim(),
        line_items: selectedLines as unknown as Tables<"credit_notes">["line_items"],
        subtotal, tax_rate: taxRate, tax_amount: taxAmount, total,
        currency: invoice.moneda || "MXN",
        stamp,
      },
      {
        onSuccess: () => {
          reset();
          onClose();
        },
      },
    );
  };

  return {
    motive, setMotive, reason, setReason, lines, updateLine,
    taxRate, subtotal, taxAmount, total, exceedsMax, canSubmit,
    isPending: createMutation.isPending,
    submit, reset,
  };
}
