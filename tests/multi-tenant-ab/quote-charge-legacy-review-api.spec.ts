import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { todayKeyMty } from "../../src/lib/format/dateFormats";
import { readAbContext } from "./fixtures/abSeed";
import { createLocalUserClient } from "./fixtures/localBackend";

/**
 * Auth/PostgREST boundary only; genuine pre-0107 history and ledger mutations
 * live in the rollback SQL and disposable PostgreSQL suites. Audit rows are
 * intentionally never deleted to make test cleanup easier.
 */
test("legacy charge review Auth: tenant isolation, existing roles and denied direct writes", async () => {
  const { A, B, roles } = readAbContext();
  const people = [A.internal, B.internal, roles.administrativo, roles.ventas, A.portal];
  const clients = await Promise.all(people.map((person) =>
    createLocalUserClient("legacy charge review boundary", person.email, person.password)));
  const [owner, other, administrative, sales, portal] = clients;
  const quoteId = randomUUID();
  const date = todayKeyMty();
  try {
    const inserted = await owner.from("quotes").insert({
      id: quoteId, organization_id: A.organizationId, customer_id: A.customerId,
      customer_name: "Synthetic legacy review boundary", quote_number: "",
      quote_type: "rental", status: "draft", start_date: date, end_date: date,
      currency: "MXN", tipo_cambio: 1, line_items: [], subtotal: 0,
      tax_rate: 0, tax_amount: 0, total: 0,
    }).select("id").single();
    expect(inserted.error).toBeNull();
    expect(inserted.data?.id).toBe(quoteId);

    const owned = await owner.rpc("get_quote_charge_legacy_review", { p_quote_id: quoteId });
    expect(owned.error).toBeNull();
    expect(owned.data).toMatchObject({ complete: true, quote_id: quoteId, can_reconcile: false, charges: [], invoices: [] });
    const readOnly = await administrative.rpc("get_quote_charge_legacy_review", { p_quote_id: quoteId });
    expect(readOnly.error).toBeNull();
    expect(readOnly.data).toMatchObject({ complete: true, quote_id: quoteId, can_reconcile: false });

    const chargeId = randomUUID();
    const updated = await owner.from("quotes").update({
      line_items: [{ quote_line_id: chargeId, line_kind: "charge", description: "Synthetic boundary charge", quantity: 1, unit_price: 100, total: 100 }],
      subtotal: 100, total: 100,
    }).eq("id", quoteId).eq("organization_id", A.organizationId).select("id").single();
    expect(updated.error).toBeNull();
    expect(updated.data?.id).toBe(quoteId);
    const charged = await owner.rpc("get_quote_charge_legacy_review", { p_quote_id: quoteId });
    expect(charged.error).toBeNull();
    expect(charged.data).toMatchObject({
      complete: true, quote_id: quoteId, can_reconcile: true, invoices: [],
      charges: [{ quote_line_id: chargeId, quoted_quantity: 1, consumed_quantity: 0, remaining_quantity: 1 }],
    });
    const chargedReadOnly = await administrative.rpc("get_quote_charge_legacy_review", { p_quote_id: quoteId });
    expect(chargedReadOnly.error).toBeNull();
    expect(chargedReadOnly.data).toMatchObject({
      complete: true, quote_id: quoteId, can_reconcile: false, invoices: [],
      charges: [{ quote_line_id: chargeId, quoted_quantity: 1, consumed_quantity: 0, remaining_quantity: 1 }],
    });

    for (const client of [other, sales, portal]) {
      const denied = await client.rpc("get_quote_charge_legacy_review", { p_quote_id: quoteId });
      expect(denied.error?.code).toBe("42501");
      expect(denied.data).toBeNull();
    }
    const hidden = await owner.rpc("get_quote_charge_legacy_review", { p_quote_id: randomUUID() });
    expect(hidden.error?.code).toBe("42501");
    expect(hidden.data).toBeNull();

    // The endpoint derives tenant and actor. No non-admin receives a write path,
    // even with structurally valid evidence and an owned quote in the payload.
    for (const client of [other, administrative, sales, portal]) {
      const denied = await client.rpc("reconcile_quote_charge_history", {
        p_quote_id: quoteId, p_invoice_id: A.invoiceId, p_line_index: 0,
        p_expected_hash: "0".repeat(64), p_classification: "not_quote_charge",
        p_quote_line_id: null, p_quantity: null,
        p_reason: "Synthetic authorization assertion", p_evidence: "Synthetic local fixture",
        p_request_key: randomUUID(),
      });
      expect(denied.error?.code).toBe("42501");
      expect(denied.data).toBeNull();
    }
    for (const client of [owner, other, administrative, sales, portal]) {
      const denied = await client.from("quote_charge_legacy_reviews").insert({});
      expect(denied.error?.code).toBe("42501");
      expect(denied.data).toBeNull();
      const reversed = await client.from("quote_charge_legacy_reversals").insert({});
      expect(reversed.error?.code).toBe("42501");
      expect(reversed.data).toBeNull();
    }
    const unchanged = await owner.rpc("get_quote_charge_legacy_review", { p_quote_id: quoteId });
    expect(unchanged.error).toBeNull();
    expect(unchanged.data).toEqual(charged.data);
  } finally {
    const cleanup = await owner.from("quotes").delete().eq("id", quoteId)
      .eq("organization_id", A.organizationId).select("id");
    expect(cleanup.error).toBeNull();
    await Promise.all(clients.map((client) => client.auth.signOut({ scope: "local" })));
  }
});
