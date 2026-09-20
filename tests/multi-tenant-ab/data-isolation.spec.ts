/**
 * Aislamiento de DATOS por API real (PostgREST local), token de usuario.
 * No duplica las suites SQL: aquí se ejercita el camino HTTP completo.
 */

import { expect, test } from "@playwright/test";
import { readAbContext } from "./fixtures/abSeed";
import { createLocalUserClient } from "./fixtures/localBackend";

const ctx = readAbContext();

test.describe("datos A/B", () => {
  test("el personal interno de A solo lee sus propias facturas", async () => {
    const client = await createLocalUserClient("internalA", ctx.A.internal.email, ctx.A.internal.password);
    const { data, error } = await client.from("invoices").select("id, invoice_number, organization_id");
    expect(error).toBeNull();
    const ids = (data ?? []).map((row) => row.id as string);
    expect(ids).toContain(ctx.A.invoiceId);
    expect(ids).not.toContain(ctx.B.invoiceId);
  });

  test("consultar por id una factura de B devuelve vacío", async () => {
    const client = await createLocalUserClient("internalA", ctx.A.internal.email, ctx.A.internal.password);
    const { data } = await client.from("invoices").select("id, total").eq("id", ctx.B.invoiceId);
    expect(data ?? []).toHaveLength(0);
  });

  test("A no puede modificar una factura de B", async () => {
    const client = await createLocalUserClient("internalA", ctx.A.internal.email, ctx.A.internal.password);
    const { data, error } = await client
      .from("invoices")
      .update({ status: "paid" })
      .eq("id", ctx.B.invoiceId)
      .select("id");
    expect(data ?? []).toHaveLength(0);
    if (error) expect(error.message).toBeTruthy();

    const verify = await createLocalUserClient("internalB", ctx.B.internal.email, ctx.B.internal.password);
    const { data: after } = await verify.from("invoices").select("status").eq("id", ctx.B.invoiceId).single();
    expect(after?.status).toBe("sent");
  });

  test("A no puede insertar filas atribuidas a B", async () => {
    const client = await createLocalUserClient("internalA", ctx.A.internal.email, ctx.A.internal.password);
    const { error } = await client.from("invoices").insert({
      organization_id: ctx.B.organizationId,
      customer_id: ctx.B.customerId,
      invoice_number: "AB-INTRUSO-0001",
      total: 1,
    });
    expect(error).not.toBeNull();
  });

  test("A no lee el padrón de clientes ni los documentos de B", async () => {
    const client = await createLocalUserClient("internalA", ctx.A.internal.email, ctx.A.internal.password);
    const { data: orgCustomers } = await client
      .from("organization_customers")
      .select("customer_id")
      .eq("organization_id", ctx.B.organizationId);
    expect(orgCustomers ?? []).toHaveLength(0);

    const { data: docs } = await client.from("documents").select("id").eq("id", ctx.B.documentId);
    expect(docs ?? []).toHaveLength(0);
  });

  test("A sí opera sobre sus propios recursos según su rol", async () => {
    const client = await createLocalUserClient("internalA", ctx.A.internal.email, ctx.A.internal.password);
    const { data, error } = await client
      .from("invoices")
      .update({ notes: "revisado por el gate A/B" })
      .eq("id", ctx.A.invoiceId)
      .select("id, notes");
    expect(error).toBeNull();
    expect(data ?? []).toHaveLength(1);
  });
});
