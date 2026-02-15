/** Application-wide configuration constants */
export const APP_CONFIG = {
  /** Default tax rate percentage applied to invoices */
  DEFAULT_TAX_RATE: 16,
  /** Currency code for formatting */
  CURRENCY: "MXN",
  /** Currency symbol for display */
  CURRENCY_SYMBOL: "$",
  /** Number of items per page in data tables */
  PAGE_SIZE: 25,
  /** Locale for number formatting */
  LOCALE: "es-MX",
} as const;
