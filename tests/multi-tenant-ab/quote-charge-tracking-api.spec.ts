import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Tables } from "../../src/integrations/supabase/types";
import { todayKeyMty } from "../../src/lib/format/dateFormats";
import { readAbContext, type AbSide } from "./fixtures/abSeed";
import { createLocalUserClient } from "./fixtures/localBackend";

function required<T>(result: { data: T | null; error: { message: string } | null }, label: string): T {
  expect(result.error, label).toBeNull();
  if (result.data == null) throw new Error(`${label}: missing API data`);
  return result.data;
}
async function login(side: AbSide) {
  const client = await createLocalUserClient("quote charge Auth regression", side.internal.email, side.internal.password);
  const identity = await client.auth.getUser();
  expect(identity.error).toBeNull();
  expect(identity.data.user?.id).toBe(side.internal.userId);
  expect(identity.data.user?.role).toBe("authenticated");
  expect(required(await client.rpc("current_internal_organization_id"), "owned organization")).toBe(side.organizationId);
  return client;
}

// These tests are auto-discovered by the existing local-only multi-tenant gate.
// Every business write, assertion and cleanup uses normal Auth/PostgREST. Genuine
// pre-0107 legacy rows are tested by migration/SQL fixtures, not fabricated here.
test("quote charge Auth: scoped availability, partial reservations and atomic overconsumption", async () => {
  const { A, B } = readAbContext();
  const owner = await login(A);
  const other = await login(B);
  const quoteId = randomUUID();
  const lineId = randomUUID();
  const invoiceIds: string[] = [];
  let quoteCreated = false;
  const date = todayKeyMty();
  const line = (quantity: number) => ({
    line_kind: "charge", description: "Synthetic delivery", quantity,
    unit_price: 100, total: quantity * 100,
    source_quote_id: quoteId, source_quote_line_id: lineId,
  });
  const save = (quantity: number) => owner.rpc("save_invoice_with_bookings", {
    p_invoice: {
      customer_id: A.customerId, customer_name: "Synthetic source charge", quote_id: quoteId,
      line_items: [line(quantity)], subtotal: quantity * 100, tax_rate: 0, tax_amount: 0, total: quantity * 100,
      issued_at: date, status: "draft", moneda: "MXN", tipo_cambio: 1,
      metodo_pago: "PPD", forma_pago: "99", uso_cfdi: "G03",
    }, p_booking_ids: [],
  });
  try {
    const quote = required(await owner.from("quotes").insert({
      id: quoteId, organization_id: A.organizationId, customer_id: A.customerId,
      customer_name: "Synthetic source charge", quote_number: "", quote_type: "rental",
      status: "draft", start_date: date, end_date: date, currency: "MXN", tipo_cambio: 1,
      subtotal: 300, tax_rate: 0, tax_amount: 0, total: 300,
      line_items: [{ quote_line_id: lineId, line_kind: "charge", description: "Synthetic delivery", quantity: 3, unit_price: 100, total: 300 }],
    }).select("id,organization_id,is_e2e,line_items").single(), "create normal source quote");
    quoteCreated = true;
    expect(quote).toMatchObject({ id: quoteId, organization_id: A.organizationId, is_e2e: false });
    const available = () => owner.rpc("get_quote_charge_availability", { p_quote_ids: [quoteId] });
    expect(required(await available(), "initial complete availability")).toMatchObject({ complete: true, quotes: [{
      quote_id: quoteId, legacy_review_required: false,
      lines: [{ quote_line_id: lineId, quoted_quantity: 3, consumed_quantity: 0, remaining_quantity: 3 }],
    }] });
    const denied = await other.rpc("get_quote_charge_availability", { p_quote_ids: [quoteId] });
    expect(denied.error?.code).toBe("42501");
    expect(denied.data).toBeNull();
    const incomplete = await owner.rpc("get_quote_charge_availability", { p_quote_ids: [quoteId, randomUUID()] });
    expect(incomplete.error?.code).toBe("42501");
    expect(incomplete.data).toBeNull();

    const first = required<Tables<"invoices">[]>(await save(2), "reserve partial source through production save RPC");
    expect(first).toHaveLength(1);
    invoiceIds.push(first[0].id);
    expect(first[0]).toMatchObject({ quote_charge_tracking_version: 1, status: "draft", is_e2e: false });
    expect(required(await available(), "draft quantities counted")).toMatchObject({ quotes: [{ lines: [{ consumed_quantity: 2, remaining_quantity: 1 }] }] });
    expect(required(await owner.rpc("get_quote_charge_availability", {
      p_quote_ids: [quoteId], p_exclude_invoice_id: first[0].id,
    }), "own invoice edit exclusion")).toMatchObject({ quotes: [{ lines: [{ remaining_quantity: 3 }] }] });

    const duplicate = await save(2);
    expect(duplicate.error?.code).toBe("23514");
    expect(duplicate.error?.message).toContain("saldo disponible");
    expect(duplicate.data).toBeNull();
    const rows = required(await owner.from("invoices").select("id").eq("quote_id", quoteId), "failed transaction leaves no extra invoice");
    expect(rows).toEqual([{ id: first[0].id }]);
    const last = required<Tables<"invoices">[]>(await save(1), "reserve exact remaining quantity");
    invoiceIds.push(last[0].id);
    expect(required(await available(), "source fully reserved")).toMatchObject({ quotes: [{ lines: [{ consumed_quantity: 3, remaining_quantity: 0 }] }] });

    const stripMarker = await owner.from("invoices").update({ quote_charge_tracking_version: null }).eq("id", first[0].id).select("id");
    expect(stripMarker.error?.code).toBe("23514");
    const nullMarker = await owner.from("invoices").insert({ organization_id: A.organizationId,
      customer_id: A.customerId, invoice_number: `AB-NULL-${randomUUID()}`, quote_charge_tracking_version: null });
    expect(nullMarker.error?.code).toBe("23514");
  } finally {
    const remaining = required<{ id: string }[]>(await owner.from("invoices").select("id").eq("quote_id", quoteId).eq("organization_id", A.organizationId), "read synthetic invoice cleanup scope");
    const cleanupIds = new Set([...invoiceIds, ...remaining.map((row) => row.id)]);
    for (const id of cleanupIds) {
      expect(required(await owner.from("invoices").delete().eq("id", id).eq("organization_id", A.organizationId).select("id"), "normal draft cleanup")).toEqual([{ id }]);
    }
    if (quoteCreated) expect(required(await owner.from("quotes").delete().eq("id", quoteId).eq("organization_id", A.organizationId).select("id"), "normal quote cleanup")).toEqual([{ id: quoteId }]);
    await Promise.all([owner.auth.signOut({ scope: "local" }), other.auth.signOut({ scope: "local" })]);
  }
});
