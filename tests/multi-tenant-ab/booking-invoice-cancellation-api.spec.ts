import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Tables, TablesInsert } from "../../src/integrations/supabase/types";
import { todayKeyMty } from "../../src/lib/format/dateFormats";
import { readAbContext, type AbSide } from "./fixtures/abSeed";
import { createLocalUserClient } from "./fixtures/localBackend";
import { withLocalRowLock } from "./fixtures/localLockCoordinator";

type Client = Awaited<ReturnType<typeof createLocalUserClient>>;
type Link = "direct" | "pivot";
type Invoice = Tables<"invoices">;
type Booking = Tables<"bookings">;
type Scenario = {
  owner: Client; dispatcher: Client; side: AbSide;
  invoiceId: string; bookingId: string; forkliftId: string;
};

function dataOrThrow<T>(result: { data: T | null; error: { message: string } | null }, label: string): T {
  expect(result.error, label).toBeNull();
  if (result.data == null) throw new Error(`${label}: no data returned`);
  return result.data;
}

async function login(side: AbSide, actor: "internal" | "dispatcher"): Promise<Client> {
  const identity = side[actor];
  const client = await createLocalUserClient(`cancellation ${actor}`, identity.email, identity.password);
  const { data, error } = await client.auth.getUser();
  expect(error).toBeNull();
  expect(data.user?.id).toBe(identity.userId);
  expect(dataOrThrow(await client.rpc("current_internal_organization_id"), "verified organization")).toBe(side.organizationId);
  const roles = dataOrThrow(await client.from("user_roles").select("role").eq("user_id", identity.userId), "own role");
  expect(roles).toEqual([{ role: actor === "internal" ? "admin" : "dispatcher" }]);
  return client;
}

async function readState(s: Scenario) {
  const [booking, invoice, links] = await Promise.all([
    s.owner.from("bookings").select("*").eq("id", s.bookingId).eq("organization_id", s.side.organizationId).single(),
    s.owner.from("invoices").select("*").eq("id", s.invoiceId).eq("organization_id", s.side.organizationId).single(),
    s.owner.from("invoice_bookings").select("*").eq("invoice_id", s.invoiceId).eq("organization_id", s.side.organizationId).order("booking_id"),
  ]);
  return {
    booking: dataOrThrow<Booking>(booking, "owned booking"),
    invoice: dataOrThrow<Invoice>(invoice, "owned invoice"),
    links: dataOrThrow<Tables<"invoice_bookings">[]>(links, "owned links"),
  };
}

async function cleanup(s: Scenario) {
  // Ordinary authenticated SDK only, including cleanup. No service fallback,
  // privileged teardown RPC, is_e2e=true or bypass context is used by a case.
  for (const [table, id] of [
    ["invoices", s.invoiceId], ["bookings", s.bookingId], ["forklifts", s.forkliftId],
  ] as const) {
    const present = dataOrThrow(await s.owner.from(table).select("id").eq("id", id)
      .eq("organization_id", s.side.organizationId), `cleanup read ${table}`);
    const deleted = dataOrThrow(await s.owner.from(table).delete().eq("id", id)
      .eq("organization_id", s.side.organizationId).select("id"), `cleanup delete ${table}`);
    expect(deleted).toEqual(present);
    expect(dataOrThrow(await s.owner.from(table).select("id").eq("id", id), `cleanup verify ${table}`)).toEqual([]);
  }
  await Promise.all([s.owner.auth.signOut(), s.dispatcher.auth.signOut()]);
}

async function withScenario(
  link: Link | "none",
  invoiceStatus: "draft" | "sent" | "cancelled",
  run: (scenario: Scenario) => Promise<void>,
  side = readAbContext().A,
) {
  const A = side;
  const owner = await login(A, "internal");
  const dispatcher = await login(A, "dispatcher");
  const s: Scenario = {
    owner, dispatcher, side: A, invoiceId: randomUUID(), bookingId: randomUUID(), forkliftId: randomUUID(),
  };
  const start = todayKeyMty();
  const endDate = new Date(`${start}T12:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const end = endDate.toISOString().slice(0, 10);
  try {
    const forklift = dataOrThrow(await owner.from("forklifts").insert({
      id: s.forkliftId, organization_id: A.organizationId, name: "Synthetic cancellation unit",
      model: "SYNTHETIC", serial_number: s.forkliftId, status: "available", daily_rate: 100,
    }).select("id, organization_id, is_e2e").single(), "create ordinary forklift");
    expect(forklift).toMatchObject({ id: s.forkliftId, organization_id: A.organizationId, is_e2e: false });
    const booking = dataOrThrow(await owner.from("bookings").insert({
      id: s.bookingId, organization_id: A.organizationId, forklift_id: s.forkliftId,
      customer_id: A.customerId, customer_name: "Synthetic cancellation customer",
      booking_number: `AB-CANCEL-${s.bookingId}`, start_date: start, end_date: end,
      status: "confirmed", currency: "MXN", tipo_cambio: 1, daily_rate: 100, recurring_billing: false,
    }).select("id, organization_id, status, is_e2e").single(), "create ordinary booking");
    expect(booking).toMatchObject({ id: s.bookingId, organization_id: A.organizationId, status: "confirmed", is_e2e: false });
    const payload: TablesInsert<"invoices"> = {
      id: s.invoiceId, organization_id: A.organizationId, customer_id: A.customerId,
      customer_name: "Synthetic cancellation customer", invoice_number: `AB-CANCEL-${s.invoiceId}`,
      status: invoiceStatus, issued_at: start, due_date: null,
      booking_id: link === "direct" ? s.bookingId : null,
      billing_period_start: start, billing_period_end: end,
      moneda: "MXN", tipo_cambio: 1, metodo_pago: "PPD", forma_pago: "99",
      line_items: [{ description: "Synthetic rental", quantity: 1, unit_price: 100, total: 100 }],
      subtotal: 100, tax_rate: 0, tax_amount: 0, total: 100,
    };
    const invoice = dataOrThrow(await owner.from("invoices").insert(payload).select("*").single(), "create ordinary invoice");
    expect(invoice).toMatchObject({ id: s.invoiceId, organization_id: A.organizationId, status: invoiceStatus,
      is_e2e: false, cfdi_uuid: null, facturapi_invoice_id: null, cancellation_status: "none" });
    if (link === "pivot") await attach(s);
    await run(s);
  } finally {
    await cleanup(s);
  }
}

async function attach(s: Scenario, bookingId = s.bookingId) {
  return s.owner.from("invoice_bookings").insert({
    invoice_id: s.invoiceId, booking_id: bookingId, organization_id: s.side.organizationId, line_index: 0,
  }).select("*").then((result) => {
    dataOrThrow(result, "attach ordinary booking pivot");
    return result;
  });
}

async function cancel(s: Scenario, actor: "owner" | "dispatcher", operation: "rpc" | "update") {
  const client = s[actor];
  if (operation === "rpc") return client.rpc("cancel_booking", {
    p_booking_id: s.bookingId, p_reason: "Synthetic audit cancellation only",
  }).then((result) => result);
  return client.from("bookings").update({ status: "cancelled" })
    .eq("id", s.bookingId).eq("organization_id", s.side.organizationId).select("id, status").then((result) => result);
}

async function issue(s: Scenario) {
  return s.owner.from("invoices").update({ status: "sent" }).eq("id", s.invoiceId)
    .eq("organization_id", s.side.organizationId).select("id, status").then((result) => result);
}

async function expectHiddenInvoice(s: Scenario) {
  expect(dataOrThrow(await s.dispatcher.from("invoices").select("id").eq("id", s.invoiceId),
    "dispatcher still cannot SELECT invoice")).toEqual([]);
  expect(dataOrThrow(await s.dispatcher.from("bookings").select("id, status").eq("id", s.bookingId),
    "dispatcher can read its operational booking")).toEqual([{ id: s.bookingId, status: "confirmed" }]);
}

for (const link of ["direct", "pivot"] as const) {
  for (const actor of ["owner", "dispatcher"] as const) {
    for (const operation of ["rpc", "update"] as const) {
      test(`R2 invoice cancellation: ${actor} ${operation} rejects active ${link} invoice without persistence drift`, async () => {
        await withScenario(link, "sent", async (s) => {
          await expectHiddenInvoice(s);
          const before = await readState(s);
          expect(before.invoice.status).toBe("sent");
          expect(before.booking.is_e2e).toBe(false);
          const rejected = await cancel(s, actor, operation);
          expect(rejected.error?.code, "active invoice must block booking cancellation").toBe("23514");
          expect(await readState(s)).toEqual(before);
          await expectHiddenInvoice(s);
        });
      });
    }
  }

  test(`R2 invoice cancellation: ${link} draft permits cancellation but later emission is rejected`, async () => {
    await withScenario(link, "draft", async (s) => {
      const cancelled = await cancel(s, "dispatcher", "rpc");
      expect(cancelled.error).toBeNull();
      expect((await readState(s)).booking.status).toBe("cancelled");
      const notes = await s.owner.from("invoices").update({ notes: "Synthetic draft remains editable" })
        .eq("id", s.invoiceId).select("id");
      expect(notes.error).toBeNull();
      const beforeIssue = await readState(s);
      const rejected = await issue(s);
      expect(rejected.error?.code).toBe("23514");
      expect(await readState(s)).toEqual(beforeIssue);
    });
  });

  test(`R2 invoice cancellation: ${link} cancelled invoice permits dispatcher cancellation`, async () => {
    await withScenario(link, "cancelled", async (s) => {
      const result = await cancel(s, "dispatcher", "rpc");
      expect(result.error).toBeNull();
      const state = await readState(s);
      expect(state.booking.status).toBe("cancelled");
      expect(state.invoice.status).toBe("cancelled");
    });
  });
}

test("R2 invoice cancellation: foreign dispatcher cannot cancel or observe A booking/invoice", async () => {
  await withScenario("direct", "sent", async (s) => {
    const { B } = readAbContext();
    const foreign = await login(B, "dispatcher");
    try {
      const before = await readState(s);
      for (const table of ["bookings", "invoices"] as const) {
        const id = table === "bookings" ? s.bookingId : s.invoiceId;
        expect(dataOrThrow(await foreign.from(table).select("id").eq("id", id), "foreign row hidden")).toEqual([]);
      }
      const rpc = await foreign.rpc("cancel_booking", { p_booking_id: s.bookingId });
      expect(rpc.error?.message).toBe("Reserva no encontrada");
      const direct = await foreign.from("bookings").update({ status: "cancelled" }).eq("id", s.bookingId).select("id");
      expect(direct.error).toBeNull();
      expect(direct.data).toEqual([]);
      expect(await readState(s)).toEqual(before);
    } finally { await foreign.auth.signOut(); }
  });
});

test("R2 invoice cancellation: attaching active invoice to already-cancelled booking fails atomically", async () => {
  await withScenario("none", "sent", async (s) => {
    expect((await cancel(s, "dispatcher", "rpc")).error).toBeNull();
    const before = await readState(s);
    const pivot = await s.owner.from("invoice_bookings").insert({ invoice_id: s.invoiceId,
      booking_id: s.bookingId, organization_id: s.side.organizationId }).select("*");
    expect(pivot.error?.code).toBe("23514");
    const direct = await s.owner.from("invoices").update({ booking_id: s.bookingId }).eq("id", s.invoiceId).select("id");
    expect(direct.error?.code).toBe("23514");
    expect(await readState(s)).toEqual(before);
  });
});

test("R2 invoice cancellation: active direct and pivot links cannot cross organizations", async () => {
  const { B } = readAbContext();
  await withScenario("none", "sent", async (own) => {
    await withScenario("none", "sent", async (foreign) => {
      const before = await readState(own);
      const foreignBefore = await readState(foreign);
      try {
        const pivot = await own.owner.from("invoice_bookings").insert({ invoice_id: own.invoiceId,
          booking_id: foreign.bookingId, organization_id: own.side.organizationId }).select("*");
        expect(pivot.error?.code).toBe("42501");
        const direct = await own.owner.from("invoices").update({ booking_id: foreign.bookingId })
          .eq("id", own.invoiceId).select("id");
        expect(direct.error?.code).toBe("42501");
        expect(await readState(own)).toEqual(before);
        expect(await readState(foreign)).toEqual(foreignBefore);
      } finally {
        // Baseline may expose the defect. Detach its synthetic rows through
        // the owner SDK before the nested foreign fixture is removed.
        expect((await own.owner.from("invoice_bookings").delete().eq("invoice_id", own.invoiceId)).error).toBeNull();
        expect((await own.owner.from("invoices").update({ booking_id: null }).eq("id", own.invoiceId)).error).toBeNull();
      }
    }, B);
  });
});

for (const operation of ["issue", "attach"] as const) {
  test(`R2 invoice cancellation concurrency: ${operation} locks booking first and cancellation loses`, async () => {
    await withScenario(operation === "issue" ? "direct" : "none", operation === "issue" ? "draft" : "sent", async (s) => {
      await withLocalRowLock("bookings", s.bookingId, s.side.organizationId, async (gate) => {
        const billing = operation === "issue" ? issue(s) : attach(s);
        const started: Promise<unknown>[] = [billing];
        try {
          await gate.waitForBlocked(operation === "issue" ? "invoices" : "invoice_bookings");
          const cancellation = cancel(s, "dispatcher", "rpc");
          started.push(cancellation);
          await gate.waitForBlocked("cancel_booking");
          gate.release();
          const [billed, cancelled] = await Promise.all([billing, cancellation]);
          expect(billed.error).toBeNull();
          expect(cancelled.error?.code).toBe("23514");
        } finally {
          gate.release();
          await Promise.allSettled(started);
        }
      });
      const state = await readState(s);
      expect(state.booking.status).toBe("confirmed");
      expect(state.invoice.status).toBe("sent");
    });
  });

  test(`R2 invoice cancellation concurrency: cancellation commits while ${operation} waits, then billing loses`, async () => {
    await withScenario(operation === "issue" ? "direct" : "none", operation === "issue" ? "draft" : "sent", async (s) => {
      await withLocalRowLock("invoices", s.invoiceId, s.side.organizationId, async (gate) => {
        const billing = operation === "issue" ? issue(s) : s.owner.from("invoice_bookings")
          .insert({ invoice_id: s.invoiceId, booking_id: s.bookingId, organization_id: s.side.organizationId })
          .select("id:invoice_id").then((result) => result);
        try {
          await gate.waitForBlocked(operation === "issue" ? "invoices" : "invoice_bookings");
          expect((await cancel(s, "dispatcher", "rpc")).error).toBeNull();
          gate.release();
          expect((await billing).error?.code).toBe("23514");
        } finally {
          gate.release();
          await Promise.allSettled([billing]);
        }
      });
      const state = await readState(s);
      expect(state.booking.status).toBe("cancelled");
      expect(state.invoice.status).toBe(operation === "issue" ? "draft" : "sent");
      expect(state.links).toEqual([]);
    });
  });
}

for (const first of ["issue", "attach"] as const) {
  test(`R2 invoice cancellation concurrency: draft without pivot, ${first} wins invoice lock before the other writer`, async () => {
    await withScenario("none", "draft", async (s) => {
      expect((await cancel(s, "dispatcher", "rpc")).error).toBeNull();
      await withLocalRowLock("invoices", s.invoiceId, s.side.organizationId, async (gate) => {
        const attachDraft = () => s.owner.from("invoice_bookings").insert({
          invoice_id: s.invoiceId, booking_id: s.bookingId, organization_id: s.side.organizationId,
        }).select("invoice_id").then((result) => result);
        const started: PromiseLike<unknown>[] = [];
        try {
          const initial = first === "issue" ? issue(s) : attachDraft();
          started.push(initial);
          await gate.waitForBlocked(first === "issue" ? "invoices" : "invoice_bookings");
          const following = first === "issue" ? attachDraft() : issue(s);
          started.push(following);
          await gate.waitForBlocked(first === "issue" ? "invoice_bookings" : "invoices");
          gate.release();
          const [accepted, rejected] = await Promise.all([initial, following]);
          expect(accepted.error).toBeNull();
          expect(rejected.error?.code).toBe("23514");
        } finally {
          gate.release();
          await Promise.allSettled(started);
        }
      });
      const state = await readState(s);
      expect(state.booking.status).toBe("cancelled");
      expect(state.invoice.status).toBe(first === "issue" ? "sent" : "draft");
      expect(state.links.map((link) => link.booking_id)).toEqual(first === "issue" ? [] : [s.bookingId]);
    });
  });
}
