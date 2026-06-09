export const BANK_LINE_STATUSES = ["unmatched", "suggested", "matched", "ignored"] as const;
export type BankLineStatus = (typeof BANK_LINE_STATUSES)[number];

export const BANK_LINE_STATUS_LABELS: Record<BankLineStatus, string> = {
  unmatched: "Sin emparejar",
  suggested: "Sugerido",
  matched: "Conciliado",
  ignored: "Ignorado",
};

export const CSV_PROFILES = ["generico", "bbva", "banorte", "santander"] as const;
export type CsvProfile = (typeof CSV_PROFILES)[number];

export const CSV_PROFILE_LABELS: Record<CsvProfile, string> = {
  generico: "Genérico (Fecha, Descripción, Monto, Referencia)",
  bbva: "BBVA México",
  banorte: "Banorte",
  santander: "Santander",
};
