// Synthetic read-model controls shared by UI and disposable PostgreSQL tests.
// Expected values are explicit decimal results, not a second calculator.
export const invoiceCreditBalanceCases = [
  { id: "NC alone is not cash", total: 100, currency: "MXN", rate: 1, payments: [], credit: 30, expected: 0 },
  { id: "NC full settlement is not cash", total: 100, currency: "MXN", rate: 1, payments: [], credit: 100, expected: 0 },
  { id: "cash at net invoice", total: 100, currency: "MXN", rate: 1, payments: [{ amount: 70, currency: "MXN", rate: 1 }], credit: 30, expected: 0 },
  { id: "paid then partial note", total: 100, currency: "MXN", rate: 1, payments: [{ amount: 100, currency: "MXN", rate: 1 }], credit: 30, expected: 30 },
  { id: "partial cash then note", total: 100, currency: "MXN", rate: 1, payments: [{ amount: 80, currency: "MXN", rate: 1 }], credit: 30, expected: 10 },
  { id: "legacy cash excess", total: 100, currency: "MXN", rate: 1, payments: [{ amount: 110, currency: "MXN", rate: 1 }], credit: 0, expected: 10 },
  { id: "per-payment conversion cents", total: 0.11, currency: "USD", rate: 17.5,
    payments: [{ amount: 1, currency: "MXN", rate: 1 }, { amount: 1, currency: "MXN", rate: 1 }], credit: 0, expected: 0.01 },
  { id: "no invented dollar conversion", total: 100, currency: "USD", rate: null,
    payments: [{ amount: 100, currency: "USD", rate: null }], credit: 30, expected: 30 },
  { id: "foreign conversion", total: 100, currency: "USD", rate: 17.5,
    payments: [{ amount: 100, currency: "EUR", rate: 19.6 }], credit: 0, expected: 12 },
  { id: "missing source FX is unknown", total: 100, currency: "MXN", rate: 1,
    payments: [{ amount: 100, currency: "MXN", rate: 1 }, { amount: 1, currency: "USD", rate: null }], credit: 30, expected: null },
  { id: "missing invoice FX is unknown", total: 100, currency: "USD", rate: null,
    payments: [{ amount: 2000, currency: "MXN", rate: 1 }], credit: 30, expected: null },
] as const;
