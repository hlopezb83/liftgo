// Credit-note motive constants used across InvoiceCreditNotesCard and CreateCreditNoteDialog.

export const CREDIT_NOTE_MOTIVES = [
  { value: "return", label: "Devolución de equipo / renta", desc: "El cliente devolvió equipo o renta" },
  { value: "discount", label: "Descuento / bonificación", desc: "Descuento posterior a la factura" },
  { value: "correction", label: "Corrección de monto", desc: "Reducción por error en el monto facturado" },
  { value: "credit_balance", label: "Saldo a favor", desc: "Saldo a favor del cliente" },
] as const;

export type CreditNoteMotive = (typeof CREDIT_NOTE_MOTIVES)[number]["value"];

export const CREDIT_NOTE_MOTIVE_LABELS: Record<string, string> = Object.fromEntries(
  CREDIT_NOTE_MOTIVES.map((m) => [m.value, m.label]),
);
