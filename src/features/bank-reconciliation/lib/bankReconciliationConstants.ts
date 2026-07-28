export const BANK_LINE_STATUSES = ["unmatched", "suggested", "matched", "ignored"] as const;
export type BankLineStatus = (typeof BANK_LINE_STATUSES)[number];

export const BANK_LINE_STATUS_LABELS: Record<BankLineStatus, string> = {
  unmatched: "Sin emparejar",
  suggested: "Sugerido",
  matched: "Conciliado",
  ignored: "Ignorado",
};

export const CSV_PROFILES = ["generico", "bbva", "banorte", "santander", "bbva_xml"] as const;
export type StatementProfile = (typeof CSV_PROFILES)[number];
/** @deprecated usar StatementProfile */
export type CsvProfile = StatementProfile;

export const CSV_PROFILE_LABELS: Record<StatementProfile, string> = {
  generico: "Genérico (Fecha, Descripción, Monto, Referencia)",
  bbva: "BBVA México (CSV)",
  banorte: "Banorte (CSV)",
  santander: "Santander (CSV)",
  bbva_xml: "BBVA México (XML)",
};

/** Perfiles que esperan un archivo XML en lugar de CSV. */
export const XML_PROFILES: readonly StatementProfile[] = ["bbva_xml"];
