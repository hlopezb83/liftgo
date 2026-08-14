import { useState } from "react";
import type { Tables } from "@/integrations/supabase/types";
import type { LineItem } from "@/lib/domain/invoiceHelpers";
import { applyDiscountToBase, computeTotals, lineItemTotal } from "@/lib/domain/invoiceHelpers";
import { parseLineItems } from "@/lib/domain/lineItems";
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
  // BL-001: el cálculo vía currency.js (dentro de computeTotals) evita drift
  // IEEE-754 acumulado en el subtotal y en el redondeo final del IVA.
  // M24: la base de cada línea es qty×price MENOS su descuento (mismo criterio
  // que el timbrado BL-02) — computeTotals aplica el descuento vía applyDiscount.
  // F4 (Sprint M1): el IVA se calcula LÍNEA POR LÍNEA con el mismo criterio que
  // la factura (computeTotals): las líneas `objeto_imp === "01"` no generan IVA
  // y cada línea puede traer su propia `tax_rate`. Antes se aplicaba la tasa
  // global sobre todo el subtotal, inflando el IVA de NCs con líneas exentas.
  const selectedItems: LineItem[] = lines
    .filter((l) => l._selected)
    .map((l) => ({
      ...l,
      total: lineItemTotal(l.quantity, l.unit_price),
    }));
  const totals = computeTotals(selectedItems, taxRate);
  const subtotal = totals.subtotal;
  const taxAmount = totals.taxAmount;
  const total = totals.total;
  const exceedsMax = total > maxCreditable + 0.01;
  const canSubmit =
    reason.trim().length > 0 && total > 0 && !exceedsMax && !createMutation.isPending;

  const reset = () => {
    setMotive("return");
    setReason("");
    setLines(original.map((li) => ({ ...li, _selected: true })));
  };

  // Fix 8.1: cap por línea contra la factura original. Sin esto se puede
  // subir cantidad/precio de una línea por encima de lo facturado (y
  // des-seleccionar otra) para "colar" un importe mayor al credited real.
  const updateLine = (idx: number, patch: Partial<EditableCreditNoteLine>) => {
    setLines((prev) =>
      prev.map((l, i) => {
        if (i !== idx) return l;
        const merged = { ...l, ...patch };
        const src = original[idx];
        if (!src) return merged;
        if (patch.quantity !== undefined) {
          merged.quantity = Math.min(Number(patch.quantity) || 0, Number(src.quantity) || 0);
        }
        if (patch.unit_price !== undefined) {
          merged.unit_price = Math.min(Number(patch.unit_price) || 0, Number(src.unit_price) || 0);
        }
        return merged;
      }),
    );
  };

  /** Máximo facturado por línea (para hints "Máximo: N unidades facturadas"). */
  const lineMax = (idx: number) => ({
    quantity: Number(original[idx]?.quantity) || 0,
    unit_price: Number(original[idx]?.unit_price) || 0,
  });

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
    motive, setMotive, reason, setReason, lines, updateLine, lineMax,
    taxRate, subtotal, taxAmount, total, exceedsMax, canSubmit,
    isPending: createMutation.isPending,
    submit, reset,
  };
}
