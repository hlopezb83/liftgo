import { useState, type ReactNode } from "react";
import type { LegacyChargeReview } from "../../src/features/invoices/lib/quoteChargeLegacyReview";

const params = new URLSearchParams(location.search);
const role = params.get("role") ?? "admin";
const mode = params.get("mode") ?? "normal";
const id = (suffix: number) => `12300000-0000-4000-8000-${String(suffix).padStart(12, "0")}`;
const events: Array<{ requestKey: string; kind: string }> = [];
Object.assign(window, { quoteChargeReviewEvents: events });
let saveAttempt = 0;
let saved = false;
function fixture(): LegacyChargeReview {
  return {
    complete: true, quote_id: id(100), quote_number: "COT-QA", can_reconcile: role === "admin",
    charges: [{ quote_line_id: id(110), line: { description: "Entrega verificada", quantity: 3, unit_price: 100 }, quoted_quantity: 3, consumed_quantity: saved ? 1 : 0, remaining_quantity: saved ? 2 : 3 }],
    invoices: [{ invoice_id: id(300), invoice_number: "FAC-QA", status: "paid", cfdi_status: "stamped", cancellation_status: "pending", active: true, reviewable: true, empty_positive: false,
      lines: [{ line_index: 0, line: { description: "Partida histórica de entrega", quantity: 1, unit_price: 100, total: 100 }, line_hash: "a".repeat(64), pending: !saved, reviewable: true, blocked_reason: null,
        review: saved ? { id: id(400), classification: "charge", quote_line_id: id(110), quantity: 1, reason: "Entrega comprobada", evidence: "Documento sintético", actor_id: id(10), created_at: "2026-11-04T00:00:00Z" } : null, history: [] }],
    }],
  };
}
export function useUserRole() { return { data: role }; }
export function Link({ to, children, ...props }: { to: string; children: ReactNode; className?: string }) { return <a href={to} {...props}>{children}</a>; }

/** Only the data boundary is replaced. Dialog, form, validation and focus are real. */
export function useQuoteChargeLegacyReview() {
  const [data, setData] = useState(fixture);
  const [pending, setPending] = useState(false);
  const [fetching, setFetching] = useState(false);
  const [queryError, setQueryError] = useState(mode === "query-error");
  async function refresh() {
    setFetching(true);
    await new Promise((resolve) => setTimeout(resolve, 30));
    setData(fixture()); setQueryError(false); setFetching(false);
  }
  async function mutate(input: { requestKey: string }, kind: string) {
    events.push({ requestKey: input.requestKey, kind });
    setPending(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, mode === "slow" ? 600 : 30));
      if (mode === "save-error" && saveAttempt++ === 0) throw new Error("Fallo simulado de conexión; vuelve a verificar la solicitud");
      saved = kind === "reconcile";
      setData(fixture());
    } finally { setPending(false); }
  }
  return {
    data, isPending: false, isError: queryError, isFetching: fetching,
    error: queryError ? new Error("Consulta simulada no disponible") : null,
    refetch: refresh,
    reconcile: { isPending: pending, mutateAsync: (input: { requestKey: string }) => mutate(input, "reconcile") },
    reverse: { isPending: pending, mutateAsync: (input: { requestKey: string }) => mutate(input, "reverse") },
  };
}
