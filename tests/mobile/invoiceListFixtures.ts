// Synthetic, read-only list rows. Detail payloads and payment writes are absent.
export const invoiceListFixtures = [
  { id: "00000000-0000-4000-8000-000000000041", invoice_number: "QA-FAC-041", status: "partial", cfdi_status: "stamped", cancellation_status: null, moneda: "MXN" },
  { id: "00000000-0000-4000-8000-000000000042", invoice_number: "QA-FAC-042", status: "paid", cfdi_status: "pending", cancellation_status: null, moneda: "USD" },
  { id: "00000000-0000-4000-8000-000000000043", invoice_number: "QA-FAC-043", status: "sent", cfdi_status: "stamped", cancellation_status: "accepted", moneda: "MXN" },
  { id: "00000000-0000-4000-8000-000000000044", invoice_number: "QA-FAC-044", status: "sent", cfdi_status: "stamped", cancellation_status: "pending", moneda: "MXN" },
].map((row) => ({ ...row, customer_name: "QA Cliente ficticio para lista", total: 1234.56, issued_at: "2026-10-01", due_date: "2026-10-31" }));
