import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types";
import { todayKeyMty } from "../../src/lib/format/dateFormats";
import { readAbContext } from "./fixtures/abSeed";
import { createLocalUserClient } from "./fixtures/localBackend";

type Client = SupabaseClient<Database>;
type Payment = Database["public"]["Tables"]["payments"]["Row"];

function dataOrThrow<T>({ data, error }: { data: T | null; error: { message: string } | null }, label: string): T {
  expect(error, label).toBeNull();
  if (data === null) throw new Error(`${label}: missing API data`);
  return data;
}

test("REP claim: authenticated stale requests never reclaim uncertain stamping or identified documents", async () => {
  const { A, B, roles } = readAbContext();
  const owner: Client = await createLocalUserClient("REP claim A", A.internal.email, A.internal.password);
  const foreign: Client = await createLocalUserClient("REP claim B", B.internal.email, B.internal.password);
  const mechanic: Client = await createLocalUserClient("REP claim mechanic", roles.mecanico.email, roles.mecanico.password);
  const identity = await owner.auth.getUser();
  expect(identity.error).toBeNull();
  expect(identity.data.user).toMatchObject({ id: A.internal.userId, role: "authenticated" });
  const invoiceId = randomUUID();
  const paymentId = randomUUID();
  const readPayment = async () => dataOrThrow<Payment>(await owner.from("payments").select("*")
    .eq("id", paymentId).eq("organization_id", A.organizationId).single(), "read owned payment");
  const update = async (patch: Partial<Payment>) => dataOrThrow<Payment>(await owner.from("payments").update(patch)
    .eq("id", paymentId).eq("organization_id", A.organizationId).select("*").single(), "update synthetic REP state");
  const claim = async (client: Client = owner, minutes = 5) => dataOrThrow(await client.rpc("claim_payment_rep_stamping", {
    p_payment_id: paymentId, p_stale_minutes: minutes,
  }), "authenticated claim RPC");
  try {
    const date = todayKeyMty();
    dataOrThrow(await owner.from("invoices").insert({
      id: invoiceId, organization_id: A.organizationId, customer_id: A.customerId,
      invoice_number: `AB-REP-${invoiceId}`, customer_name: "Synthetic REP claim recovery",
      issued_at: date, due_date: null, status: "sent", moneda: "MXN", tipo_cambio: 1,
      metodo_pago: "PPD", forma_pago: "99", subtotal: 100, tax_rate: 16, tax_amount: 16, total: 116,
      line_items: [{ description: "Synthetic service", quantity: 1, unit_price: 100, total: 100 }],
    }).select("id").single(), "create ordinary invoice");
    const payment = dataOrThrow(await owner.from("payments").insert({
      id: paymentId, invoice_id: invoiceId, amount: 1, currency: "MXN", exchange_rate: 1,
      payment_date: date, payment_method: "transfer", payment_form_sat: "03",
    }).select("*").single(), "create ordinary payment");
    expect(payment).toMatchObject({
      organization_id: A.organizationId, created_by: A.internal.userId, is_e2e: false,
      rep_cfdi_status: "none", rep_facturapi_id: null, rep_cfdi_uuid: null,
    });
    expect(await claim()).toBe("claimed");
    const started = await readPayment();
    expect(started.rep_cfdi_status).toBe("stamping");
    expect(started.rep_stamping_started_at).not.toBeNull();

    // Only the existing isolated backend is used. Ordinary authenticated SDK
    // writes model the persisted uncertainty; no SQL, service user or PAC call.
    for (const age of [6, 60, 1440]) {
      const stale = await update({
        rep_stamping_started_at: new Date(Date.now() - age * 60_000).toISOString(),
        rep_error_message: "Synthetic lost response; reconciliation required",
      });
      expect(await claim(owner, 1)).toBe("stamping");
      expect(await readPayment()).toEqual(stale);
    }
    expect(await claim(foreign, -1)).toBe("not_found");
    const denied = await mechanic.rpc("claim_payment_rep_stamping", { p_payment_id: paymentId });
    expect(denied.error?.code).toBe("P0001");
    expect(denied.data).toBeNull();

    for (const status of ["none", "pending", "error"]) {
      for (const identityField of ["rep_facturapi_id", "rep_cfdi_uuid"] as const) {
        const identified = await update({
          rep_cfdi_status: status, rep_stamping_started_at: null,
          rep_facturapi_id: identityField === "rep_facturapi_id" ? "synthetic-pac-id" : null,
          rep_cfdi_uuid: identityField === "rep_cfdi_uuid" ? "aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa" : null,
        });
        expect(await claim()).toBe(status);
        expect(await readPayment()).toEqual(identified);
      }
    }

    // Pre-send pending remains recoverable. Two ordinary requests race against
    // the same atomic claim: exactly one acquires it, regardless of its age arg.
    await update({
      rep_cfdi_status: "pending", rep_facturapi_id: null, rep_cfdi_uuid: null,
      rep_stamping_started_at: null, rep_error_message: "Synthetic pre-PAC configuration failure",
    });
    const race = await Promise.all([claim(owner, -1), claim(owner, 0)]);
    expect(race.sort()).toEqual(["claimed", "stamping"]);
    const final = await readPayment();
    expect(final).toMatchObject({ rep_cfdi_status: "stamping", rep_facturapi_id: null, rep_cfdi_uuid: null });
    expect(await claim(owner, -1)).toBe("stamping");
    expect(await readPayment()).toEqual(final);
  } finally {
    const existing = dataOrThrow(await owner.from("payments").select("id")
      .eq("id", paymentId).eq("organization_id", A.organizationId), "cleanup list payment");
    const deleted = dataOrThrow(await owner.from("payments").delete()
      .eq("id", paymentId).eq("organization_id", A.organizationId).select("id"), "cleanup payment");
    expect(deleted).toEqual(existing);
    const invoices = dataOrThrow(await owner.from("invoices").select("id")
      .eq("id", invoiceId).eq("organization_id", A.organizationId), "cleanup list invoice");
    const deletedInvoices = dataOrThrow(await owner.from("invoices").delete()
      .eq("id", invoiceId).eq("organization_id", A.organizationId).select("id"), "cleanup invoice");
    expect(deletedInvoices).toEqual(invoices);
  }
});
