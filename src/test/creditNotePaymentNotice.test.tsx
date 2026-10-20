import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Tables } from "@/integrations/supabase/types";
import { computeCreditNoteLimits } from "@/features/invoices/lib/creditNoteLimits";

vi.mock("@/features/users", () => ({ useHasModuleAccess: () => false }));
import { CreditNoteNotices } from "@/features/invoices/components/invoice-detail/InvoiceCreditNotesParts";

afterEach(cleanup);

function paymentFixture(overrides: Partial<Tables<"payments">>): Tables<"payments"> {
  return {
    id: "qa-payment", invoice_id: "qa-invoice", organization_id: "qa-organization",
    amount: 0, amount_mxn: null, currency: "MXN", exchange_rate: 1,
    payment_date: "2026-10-20", created_at: "2026-10-20T12:00:00Z", created_by: null,
    payment_form_sat: null, payment_method: null, reference_number: null,
    installment_number: null, prior_balance: null, notes: null, is_e2e: true, e2e_scope: "billing-regression",
    rep_cfdi_status: "pending", rep_cfdi_uuid: null, rep_facturapi_id: null,
    rep_cancellation_status: "none", rep_cancellation_motive: null, rep_cancellation_reason: null,
    rep_cancellation_requested_at: null, rep_cancelled_at: null, rep_substitution_uuid: null,
    rep_number: null, rep_folio: null, rep_pdf_url: null, rep_xml_url: null, rep_xml_pending: false,
    rep_error_message: null, rep_lookup_attempts: 0, rep_stamping_attempts: 0, rep_stamping_started_at: null,
    ...overrides,
  };
}

describe("BF02: rendered non-REP notice", () => {
  it("presents a USD50 payment as MXN1000, not MXN50", () => {
    const payments = [paymentFixture({ amount: 50, currency: "USD", exchange_rate: 20 })];
    const limits = computeCreditNoteLimits(1160, [], payments, { moneda: "MXN" });
    render(<CreditNoteNotices {...limits} invoiceTotal={1160} priorCredits={0} currency="MXN" />);
    expect(screen.getByText(/cobrados sin complemento/)).toHaveTextContent("$1,000.00");
    expect(screen.queryByText(/\$50\.00/)).not.toBeInTheDocument();
  });

  it("does not label a known partial sum as total when another payment has no usable FX rate", () => {
    const payments = [
      paymentFixture({ id: "qa-unknown-fx", amount: 50, currency: "USD", exchange_rate: 0 }),
      paymentFixture({ id: "qa-known-mxn", amount: 100, currency: "MXN" }),
    ];
    const limits = computeCreditNoteLimits(1160, [], payments, { moneda: "MXN" });
    render(<CreditNoteNotices {...limits} invoiceTotal={1160} priorCredits={0} currency="MXN" />);
    expect(screen.getByText(/no se pueden convertir a MXN/)).toHaveTextContent("1 pago(s)");
    expect(screen.queryByText(/cobrados sin complemento/)).not.toBeInTheDocument();
    expect(screen.queryByText("No se puede emitir una nota de crédito")).not.toBeInTheDocument();
  });
});
