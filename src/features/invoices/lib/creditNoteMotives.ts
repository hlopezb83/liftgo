// Credit-note motive constants used across InvoiceCreditNotesCard and CreateCreditNoteDialog.

export const CREDIT_NOTE_MOTIVES = [
  {
    value: "return",
    label: "Devolución de equipo / renta",
    shortLabel: "Devolución",
    desc: "El cliente devolvió equipo o renta",
  },
  {
    value: "discount",
    label: "Descuento / bonificación",
    shortLabel: "Descuento",
    desc: "Descuento posterior a la factura",
  },
  {
    value: "correction",
    label: "Corrección de monto",
    shortLabel: "Corrección",
    desc: "Reducción por error en el monto facturado",
  },
  {
    value: "credit_balance",
    label: "Saldo a favor",
    shortLabel: "Saldo a favor",
    desc: "Saldo a favor del cliente",
  },
] as const;

export const CREDIT_NOTE_MOTIVE_LABELS: Record<string, string> = Object.fromEntries(
  CREDIT_NOTE_MOTIVES.map((m) => [m.value, m.shortLabel]),
);
