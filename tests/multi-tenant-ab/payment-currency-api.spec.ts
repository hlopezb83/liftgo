import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../src/integrations/supabase/types";
import { todayKeyMty } from "../../src/lib/format/dateFormats";
import { readAbContext, type AbSide } from "./fixtures/abSeed";
import { createLocalUserClient } from "./fixtures/localBackend";

type Client = SupabaseClient<Database>;
type InvoiceInsert = Database["public"]["Tables"]["invoices"]["Insert"];
type PaymentInsert = Database["public"]["Tables"]["payments"]["Insert"];
type InvoiceRow = Database["public"]["Tables"]["invoices"]["Row"];
type PaymentRow = Database["public"]["Tables"]["payments"]["Row"];
type BalanceRow = Database["public"]["Views"]["v_invoices_with_balance"]["Row"];
type Membership = Pick<Database["public"]["Tables"]["organization_memberships"]["Row"], "auth_user_id" | "organization_id" | "member_type">;
type Organization = Pick<Database["public"]["Tables"]["organizations"]["Row"], "id" | "is_active">;

function dataOrThrow<T>(result: { data: T | null; error: { message: string } | null }, label: string): T {
  expect(result.error, label).toBeNull();
  if (result.data === null || result.data === undefined) throw new Error(`${label}: missing API data`);
  return result.data;
}

async function authenticatedClient(side: AbSide, label: string) {
  const client: Client = await createLocalUserClient(label, side.internal.email, side.internal.password);
  const identity = await client.auth.getUser();
  expect(identity.error, `${label}: authenticated identity`).toBeNull();
  const user = identity.data.user;
  if (!user) throw new Error(`${label}: missing authenticated user`);
  expect(user.id).toBe(side.internal.userId);
  expect(user.role).toBe("authenticated");
  const membership = dataOrThrow<Membership>(await client.from("organization_memberships")
    .select("auth_user_id, organization_id, member_type")
    .eq("auth_user_id", user.id).eq("organization_id", side.organizationId).single(), `${label}: membership`);
  expect(membership).toEqual({ auth_user_id: user.id, organization_id: side.organizationId, member_type: "internal" });
  const organization = dataOrThrow<Organization>(await client.from("organizations")
    .select("id, is_active").eq("id", side.organizationId).single(), `${label}: active organization`);
  expect(organization).toEqual({ id: side.organizationId, is_active: true });
  return { client, userId: user.id };
}

async function createInvoice(client: Client, side: AbSide, invoiceId: string, date: string, label: string) {
  const payload: InvoiceInsert = {
    id: invoiceId,
    organization_id: side.organizationId,
    customer_id: side.customerId,
    invoice_number: `AB-FX-${label}-${invoiceId}`,
    customer_name: `Synthetic payment-currency ${label}`,
    issued_at: date,
    due_date: null,
    status: "sent",
    moneda: "USD",
    tipo_cambio: 17.5,
    metodo_pago: "PPD",
    forma_pago: "99",
    uso_cfdi: "G03",
    line_items: [{ description: `Synthetic payment-currency ${label}`, quantity: 1, unit_price: 100, total: 100 }],
    subtotal: 100,
    tax_rate: 0,
    tax_amount: 0,
    total: 100,
  };
  const invoice = dataOrThrow<InvoiceRow>(await client.from("invoices").insert(payload).select("*").single(), `${label}: create invoice`);
  expect(invoice).toMatchObject({ id: invoiceId, organization_id: side.organizationId, status: "sent", is_e2e: false });
  return invoice;
}

async function createPayment(client: Client, side: AbSide, userId: string, invoiceId: string, paymentId: string, amount: number, date: string) {
  const payload: PaymentInsert = {
    id: paymentId,
    invoice_id: invoiceId,
    amount,
    currency: "MXN",
    exchange_rate: 1,
    payment_date: date,
    payment_form_sat: "03",
  };
  const payment = dataOrThrow<PaymentRow>(await client.from("payments").insert(payload).select("*").single(), "create ordinary MXN payment");
  expect(payment).toMatchObject({
    id: paymentId, invoice_id: invoiceId, organization_id: side.organizationId,
    created_by: userId, amount, amount_mxn: amount, currency: "MXN", exchange_rate: 1, is_e2e: false,
  });
  return payment;
}

async function snapshot(client: Client, invoiceId: string, organizationId: string) {
  const [invoice, payments, balance] = await Promise.all([
    client.from("invoices").select("*").eq("id", invoiceId).eq("organization_id", organizationId).single(),
    client.from("payments").select("*").eq("invoice_id", invoiceId).eq("organization_id", organizationId).order("id"),
    // This security-invoker view exposes the invoice id, not organization_id.
    client.from("v_invoices_with_balance").select("*").eq("id", invoiceId).single(),
  ]);
  return {
    invoice: dataOrThrow<InvoiceRow>(invoice, "read own invoice"),
    payments: dataOrThrow<PaymentRow[]>(payments, "read own payments"),
    balance: dataOrThrow<BalanceRow>(balance, "read canonical invoice balance"),
  };
}

type Snapshot = Awaited<ReturnType<typeof snapshot>>;

function expectBalance(state: Snapshot, organizationId: string, userId: string, paid: number, balance: number, status: string) {
  expect(state.invoice).toMatchObject({
    organization_id: organizationId, moneda: "USD", tipo_cambio: 17.5,
    metodo_pago: "PPD", forma_pago: "99", subtotal: 100, tax_amount: 0, tax_rate: 0, total: 100,
    status, is_e2e: false, cfdi_uuid: null, facturapi_invoice_id: null, stamping_attempts: 0,
  });
  expect(state.invoice.cfdi_status).not.toBe("stamped");
  expect(state.balance).toMatchObject({
    id: state.invoice.id, moneda: "USD", tipo_cambio: 17.5, status, total: 100,
    paid_amount: paid, balance, credited_amount: 0, payments_fx_missing: 0,
  });
  for (const payment of state.payments) {
    expect(payment).toMatchObject({
      invoice_id: state.invoice.id, organization_id: organizationId, created_by: userId,
      currency: "MXN", exchange_rate: 1, is_e2e: false,
      rep_cfdi_status: "none", rep_cfdi_uuid: null, rep_facturapi_id: null,
      rep_stamping_attempts: 0, rep_stamping_started_at: null,
      prior_balance: null, installment_number: null,
    });
    expect(payment.amount_mxn).toBe(payment.amount);
  }
}

async function expectForeignPaymentBlocked(owner: Client, foreign: Client, invoiceId: string, paymentId: string, organizationId: string) {
  const before = await snapshot(owner, invoiceId, organizationId);
  // The immediately preceding A update accepted this same valid amount.
  const denied = await foreign.from("payments").update({ amount: 350 })
    .eq("id", paymentId).eq("organization_id", organizationId).select("id");
  expect(denied.error, "B cannot update A's payment").toBeNull();
  expect(denied.data).toEqual([]);
  const [invoices, payments, balances] = await Promise.all([
    foreign.from("invoices").select("id").eq("id", invoiceId),
    foreign.from("payments").select("id").eq("invoice_id", invoiceId),
    foreign.from("v_invoices_with_balance").select("id").eq("id", invoiceId),
  ]);
  expect(dataOrThrow(invoices, "B cannot read A's invoice")).toEqual([]);
  expect(dataOrThrow(payments, "B cannot read A's payment")).toEqual([]);
  expect(dataOrThrow(balances, "B cannot read A's balance view")).toEqual([]);
  expect(await snapshot(owner, invoiceId, organizationId)).toEqual(before);
}

async function cleanup(client: Client, invoiceId: string, paymentIds: string[], organizationId: string) {
  // Normal authenticated SDK only. Failure is visible; no privileged fallback,
  // E2E flag, teardown RPC, bypass context or schema change is allowed here.
  const presentPayments = dataOrThrow(await client.from("payments").select("id")
    .in("id", paymentIds).eq("invoice_id", invoiceId).eq("organization_id", organizationId), "cleanup: list own payments");
  const deletedPayments = dataOrThrow(await client.from("payments").delete()
    .in("id", paymentIds).eq("invoice_id", invoiceId).eq("organization_id", organizationId).select("id"), "cleanup: delete own payments");
  expect(deletedPayments.map((row) => row.id).sort()).toEqual(presentPayments.map((row) => row.id).sort());
  const remainingPayments = dataOrThrow(await client.from("payments").select("id")
    .eq("invoice_id", invoiceId).eq("organization_id", organizationId), "cleanup: verify payments absent");
  expect(remainingPayments).toEqual([]);
  const presentInvoices = dataOrThrow(await client.from("invoices").select("id, status")
    .eq("id", invoiceId).eq("organization_id", organizationId), "cleanup: list own invoice");
  for (const invoice of presentInvoices) expect(invoice.status).toBe("sent");
  const deletedInvoices = dataOrThrow(await client.from("invoices").delete()
    .eq("id", invoiceId).eq("organization_id", organizationId).select("id"), "cleanup: delete own invoice");
  expect(deletedInvoices.map((row) => row.id)).toEqual(presentInvoices.map((row) => row.id));
  const remainingInvoices = dataOrThrow(await client.from("invoices").select("id")
    .eq("id", invoiceId).eq("organization_id", organizationId), "cleanup: verify invoice absent");
  expect(remainingInvoices).toEqual([]);
}

test("N7 authenticated API: two MXN1 payments each round into USD cents", async () => {
  const { A } = readAbContext();
  const { client, userId } = await authenticatedClient(A, "payment-currency N7 A");
  const invoiceId = randomUUID();
  const paymentIds = [randomUUID(), randomUUID()];
  const date = todayKeyMty();
  try {
    await createInvoice(client, A, invoiceId, date, "N7");
    expectBalance(await snapshot(client, invoiceId, A.organizationId), A.organizationId, userId, 0, 100, "sent");
    await createPayment(client, A, userId, invoiceId, paymentIds[0], 1, date);
    expectBalance(await snapshot(client, invoiceId, A.organizationId), A.organizationId, userId, 0.06, 99.94, "partial");
    await createPayment(client, A, userId, invoiceId, paymentIds[1], 1, date);
    const final = await snapshot(client, invoiceId, A.organizationId);
    expect(final.payments.map((payment) => payment.amount)).toEqual([1, 1]);
    expectBalance(final, A.organizationId, userId, 0.12, 99.88, "partial");
  } finally {
    await cleanup(client, invoiceId, paymentIds, A.organizationId);
  }
});

test("N8 authenticated API: MXN edits respect USD balance and reject one converted cent of overpayment", async () => {
  const { A, B } = readAbContext();
  const { client, userId } = await authenticatedClient(A, "payment-currency N8 A");
  const { client: foreign } = await authenticatedClient(B, "payment-currency N8 B");
  const invoiceId = randomUUID();
  const paymentId = randomUUID();
  const date = todayKeyMty();
  try {
    await createInvoice(client, A, invoiceId, date, "N8");
    await createPayment(client, A, userId, invoiceId, paymentId, 175, date);
    expectBalance(await snapshot(client, invoiceId, A.organizationId), A.organizationId, userId, 10, 90, "partial");
    const edited = dataOrThrow<PaymentRow>(await client.from("payments").update({ amount: 350 })
      .eq("id", paymentId).eq("invoice_id", invoiceId).eq("organization_id", A.organizationId).select("*").single(), "A edits MXN175 to MXN350");
    expect(edited.amount).toBe(350);
    expectBalance(await snapshot(client, invoiceId, A.organizationId), A.organizationId, userId, 20, 80, "partial");
    await expectForeignPaymentBlocked(client, foreign, invoiceId, paymentId, A.organizationId);
    const settled = dataOrThrow<PaymentRow>(await client.from("payments").update({ amount: 1750.08 })
      .eq("id", paymentId).eq("invoice_id", invoiceId).eq("organization_id", A.organizationId).select("*").single(), "A edits to the canonical USD100 boundary");
    expect(settled.amount).toBe(1750.08);
    const beforeOverpayment = await snapshot(client, invoiceId, A.organizationId);
    expectBalance(beforeOverpayment, A.organizationId, userId, 100, 0, "paid");
    const rejected = await client.from("payments").update({ amount: 1750.09 })
      .eq("id", paymentId).eq("invoice_id", invoiceId).eq("organization_id", A.organizationId).select("*");
    expect(rejected.error?.code, "MXN1750.09 converts to USD100.01 and must be rejected").toBe("23514");
    expect(rejected.data).toBeNull();
    // Includes every invoice/payment/view field, timestamps, derived MXN,
    // currency/rate, REP metadata and status: the failed write is atomic.
    expect(await snapshot(client, invoiceId, A.organizationId)).toEqual(beforeOverpayment);
  } finally {
    await cleanup(client, invoiceId, [paymentId], A.organizationId);
  }
});
