import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { readAbContext } from "./fixtures/abSeed";
import { createLocalUserClient } from "./fixtures/localBackend";

const ctx = readAbContext();

for (const [label, own, foreign] of [["A", ctx.A, ctx.B], ["B", ctx.B, ctx.A]] as const) {
  test.describe(`datos ${label} → empresa ajena`, () => {
    test("el personal sólo lee sus propias facturas", async () => {
      const client = await createLocalUserClient(label, own.internal.email, own.internal.password);
      const result = await client.from("invoices").select("id, invoice_number, organization_id");
      expect(result.error).toBeNull();
      expect(result.data?.map((row) => row.id)).toContain(own.invoiceId);
      expect(result.data?.map((row) => row.id)).not.toContain(foreign.invoiceId);
    });

    test("consultar un id ajeno devuelve vacío sin error de API", async () => {
      const client = await createLocalUserClient(label, own.internal.email, own.internal.password);
      const positive = await client.from("invoices").select("id, total").eq("id", own.invoiceId);
      expect(positive.error).toBeNull();
      expect(positive.data).toHaveLength(1);
      const denied = await client.from("invoices").select("id, total").eq("id", foreign.invoiceId);
      expect(denied.error).toBeNull();
      expect(denied.data).toEqual([]);
    });

    test("no modifica una factura ajena con un update válido", async () => {
      const client = await createLocalUserClient(label, own.internal.email, own.internal.password);
      const owner = await createLocalUserClient("propietario", foreign.internal.email, foreign.internal.password);
      const before = await owner.from("invoices").select("notes").eq("id", foreign.invoiceId).single();
      expect(before.error).toBeNull();
      const payload = { notes: `control positivo ${label}` };
      const positive = await client.from("invoices").update(payload).eq("id", own.invoiceId).select("id, notes");
      expect(positive.error).toBeNull();
      expect(positive.data).toEqual([{ id: own.invoiceId, ...payload }]);
      const denied = await client.from("invoices").update(payload).eq("id", foreign.invoiceId).select("id");
      expect(denied.error).toBeNull();
      expect(denied.data).toEqual([]);
      const after = await owner.from("invoices").select("notes").eq("id", foreign.invoiceId).single();
      expect(after.error).toBeNull();
      expect(after.data).toEqual(before.data);
    });

    test("el mismo INSERT válido propio se rechaza por organización ajena", async () => {
      const client = await createLocalUserClient(label, own.internal.email, own.internal.password);
      const id = randomUUID();
      const payload = { id, organization_id: own.organizationId, customer_id: own.customerId,
        invoice_number: `AB-CONTROL-${label}`, status: "draft", subtotal: 1, total: 1, tax_rate: 0, tax_amount: 0 };
      try {
        const positive = await client.from("invoices").insert(payload).select("id").single();
        expect(positive.error).toBeNull();
        expect(positive.data?.id).toBe(id);
        const deniedId = randomUUID();
        const denied = await client.from("invoices").insert({ ...payload, id: deniedId,
          organization_id: foreign.organizationId, customer_id: foreign.customerId,
          invoice_number: `AB-INTRUSO-${label}` });
        expect(denied.error?.code).toBe("42501");
        const owner = await createLocalUserClient("propietario", foreign.internal.email, foreign.internal.password);
        const after = await owner.from("invoices").select("id").eq("id", deniedId);
        expect(after.error).toBeNull();
        expect(after.data).toEqual([]);
      } finally {
        const cleanup = await client.from("invoices").delete().eq("id", id);
        expect(cleanup.error).toBeNull();
      }
    });

    test("clientes y documentos propios existen y los ajenos no son visibles", async () => {
      const client = await createLocalUserClient(label, own.internal.email, own.internal.password);
      for (const [table, column, ownId, foreignId] of [
        ["organization_customers", "organization_id", own.organizationId, foreign.organizationId],
        ["documents", "id", own.documentId, foreign.documentId],
      ]) {
        const positive = await client.from(table).select("*").eq(column, ownId);
        expect(positive.error).toBeNull();
        expect(positive.data?.length).toBeGreaterThan(0);
        const denied = await client.from(table).select("*").eq(column, foreignId);
        expect(denied.error).toBeNull();
        expect(denied.data).toEqual([]);
      }
    });
  });
}
