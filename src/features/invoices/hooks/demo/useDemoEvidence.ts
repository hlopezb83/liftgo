import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { EXCLUDE_E2E_FILTER } from "@/lib/supabase/constants";
import { isDemoInvoice, verifyDemoScenario, type DemoInvoice, type DemoPayment, type DemoScenario } from "../../lib/demoTour";

export type DemoRequest = { folio: string; scenario: DemoScenario };
const INVOICE_COLUMNS = "id, organization_id, invoice_number, customer_name, status, total, moneda, tipo_cambio, issued_at, cfdi_status, facturapi_env, cancellation_status, is_e2e";

async function fetchDemoEvidence(organizationId: string, request: DemoRequest) {
  // Exact parameter, not a catalog scan or an embedded tenant/fixture ID.
  const { data: invoices, error } = await supabase.from("invoices")
    .select(INVOICE_COLUMNS).eq("organization_id", organizationId)
    .eq("invoice_number", request.folio).or(EXCLUDE_E2E_FILTER).limit(2).returns<DemoInvoice[]>();
  if (error) throw error;
  const invoice = invoices?.length === 1 ? invoices[0] : undefined;
  if (!invoice || !isDemoInvoice(invoice, organizationId)) return null;

  // Exclude credit-note examples rather than presenting a credit as a payment.
  const { data: credits, error: creditError } = await supabase.from("credit_notes")
    .select("id").eq("organization_id", organizationId).eq("invoice_id", invoice.id)
    .eq("cfdi_status", "stamped").neq("status", "cancelled")
    .or("cancellation_status.is.null,cancellation_status.neq.accepted").limit(1);
  if (creditError) throw creditError;
  if (credits?.length) return null;

  const payments: DemoPayment[] = [];
  // Read every page, including when PostgREST imposes a smaller row cap.
  for (;;) {
    const { data: page, error: paymentError } = await supabase.from("payments")
      .select("id, amount, currency, exchange_rate, payment_date")
      .eq("organization_id", organizationId).eq("invoice_id", invoice.id)
      .order("id").range(payments.length, payments.length + 499).returns<DemoPayment[]>();
    if (paymentError) throw paymentError;
    if (!page?.length) break;
    payments.push(...page);
  }
  return verifyDemoScenario(invoice, payments, request.scenario);
}

export function useDemoEvidence(organizationId: string, userId: string, request: DemoRequest | null) {
  return useQuery({
    queryKey: ["demo-evidence", organizationId, userId, request],
    enabled: !!organizationId && !!userId && !!request,
    queryFn: () => {
      if (!organizationId || !userId || !request) throw new Error("Falta el contexto verificado de la demo");
      return fetchDemoEvidence(organizationId, request);
    },
    staleTime: 0,
    gcTime: 0,
    retry: false,
    meta: { silent: true },
  });
}
