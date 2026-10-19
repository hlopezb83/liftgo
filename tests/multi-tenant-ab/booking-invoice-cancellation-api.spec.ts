import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import type { Tables, TablesInsert } from "../../src/integrations/supabase/types";
import { todayKeyMty } from "../../src/lib/format/dateFormats";
import { DRAFT_FISCAL_CASES, readAbContext, type AbSide } from "./fixtures/abSeed";
import { createLocalUserClient } from "./fixtures/localBackend";
import { withLocalRowLock } from "./fixtures/localLockCoordinator";

type Client = Awaited<ReturnType<typeof createLocalUserClient>>;
type Link = "direct" | "pivot";
type Invoice = Tables<"invoices">;
type Booking = Tables<"bookings">;
type Scenario = {
  owner: Client; dispatcher: Client; side: AbSide;
  invoiceId: string; bookingId: string; forkliftId: string;
  additionalBookings: { bookingId: string; forkliftId: string }[];
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
  // Delete the invoice before ANY booking: a baseline that exposes an invalid
  // direct link may still reference a sibling when the primary assertion fails.
  for (const [table, id] of [
    ["invoices", s.invoiceId],
    ...s.additionalBookings.map(({ bookingId }) => ["bookings", bookingId] as const),
    ["bookings", s.bookingId],
    ...s.additionalBookings.map(({ forkliftId }) => ["forklifts", forkliftId] as const),
    ["forklifts", s.forkliftId],
  ] as const) {
    const present = dataOrThrow(await s.owner.from(table).select("id").eq("id", id)
      .eq("organization_id", s.side.organizationId), `cleanup read ${table}`);
    const deleted = dataOrThrow(await s.owner.from(table).delete().eq("id", id)
      .eq("organization_id", s.side.organizationId).select("id"), `cleanup delete ${table}`);
    expect(deleted).toEqual(present);
    expect(dataOrThrow(await s.owner.from(table).select("id").eq("id", id), `cleanup verify ${table}`)).toEqual([]);
  }
  await Promise.all([s.owner.auth.signOut({ scope: "local" }), s.dispatcher.auth.signOut({ scope: "local" })]);
}

function fixtureFailureSummary(error: unknown) {
  return { kind: error instanceof Error ? error.name : typeof error,
    sqlStates: error instanceof Error ? [...new Set(error.message.match(/\b(?:23503|23505|23514|42501|55P03|40P01)\b/g) ?? [])] : [] };
}

async function withScenario(
  link: Link | "none",
  invoiceStatus: "draft" | "sent" | "cancelled",
  run: (scenario: Scenario) => Promise<void>,
  side = readAbContext().A,
  fiscalSnapshot?: { id: string; status: "none" | "pending" | "accepted"; cfdiStatus?: string },
  bookingId?: string,
) {
  const A = side;
  const owner = await login(A, "internal");
  const dispatcher = await login(A, "dispatcher");
  const s: Scenario = {
    owner, dispatcher, side: A, invoiceId: fiscalSnapshot?.id ?? randomUUID(), bookingId: bookingId ?? randomUUID(), forkliftId: randomUUID(),
    additionalBookings: [],
  };
  const start = todayKeyMty();
  const endDate = new Date(`${start}T12:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const end = endDate.toISOString().slice(0, 10);
  let primaryFailure: { error: unknown } | undefined;
  try {
    const forklift = dataOrThrow(await owner.from("forklifts").insert({
      id: s.forkliftId, organization_id: A.organizationId, name: `Synthetic cancellation unit ${s.forkliftId}`,
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
      status: invoiceStatus === "cancelled" ? "sent" : invoiceStatus, issued_at: start, due_date: null,
      booking_id: link === "direct" ? s.bookingId : null,
      billing_period_start: start, billing_period_end: end,
      moneda: "MXN", tipo_cambio: 1, metodo_pago: "PPD", forma_pago: "99",
      line_items: [{ description: "Synthetic rental", quantity: 1, unit_price: 100, total: 100 }],
      subtotal: 100, tax_rate: 0, tax_amount: 0, total: 100,
    };
    let invoice = dataOrThrow(fiscalSnapshot
      ? await owner.from("invoices").update({ booking_id: payload.booking_id,
        billing_period_start: start, billing_period_end: end }).eq("id", s.invoiceId)
        .eq("organization_id", A.organizationId).select("*").single()
      : await owner.from("invoices").insert(payload).select("*").single(), "prepare invoice through ordinary SDK");
    if (invoiceStatus === "cancelled") {
      invoice = dataOrThrow(await owner.from("invoices").update({ status: "cancelled",
        cancellation_reason: "Synthetic unstamped cancellation fixture" })
        .eq("id", s.invoiceId).eq("organization_id", A.organizationId).select("*").single(), "cancel synthetic unstamped invoice through ordinary SDK");
    }
    expect(invoice).toMatchObject({ id: s.invoiceId, organization_id: A.organizationId, status: invoiceStatus,
      is_e2e: false, cfdi_uuid: null, facturapi_invoice_id: null, cancellation_status: fiscalSnapshot?.status ?? "none" });
    if (fiscalSnapshot?.cfdiStatus) expect(invoice).toMatchObject({ cfdi_status: fiscalSnapshot.cfdiStatus });
    if (link === "pivot") await attach(s);
    await run(s);
  } catch (error) {
    primaryFailure = { error };
    throw error;
  } finally {
    try {
      await cleanup(s);
    } catch (error) {
      if (!primaryFailure) throw error;
      // Keep the operation/assertion as the test failure. The secondary cleanup
      // diagnostic records kinds/SQLSTATEs only, never row data or credentials.
      const diagnostic = JSON.stringify({ primaryFailurePreserved: true,
        primary: fixtureFailureSummary(primaryFailure.error), secondaryCleanup: fixtureFailureSummary(error) });
      test.info().annotations.push({ type: "secondary-fixture-cleanup-failure", description: diagnostic });
      try {
        await test.info().attach("secondary-fixture-cleanup-failure", { contentType: "application/json", body: diagnostic });
      } catch {
        // The annotation remains available even if the artifact writer fails;
        // never replace the original operation/assertion with an attachment error.
      }
    }
  }
}

async function withAdditionalBooking(s: Scenario, run: (bookingId: string) => Promise<void>, bookingId: string = randomUUID()) {
  const forkliftId = randomUUID();
  const original = (await readState(s)).booking;
  // Registration precedes inserts so partial setup is also removed by the
  // outer scenario's finally, AFTER its invoice and the unchanged assertions.
  s.additionalBookings.push({ bookingId, forkliftId });
  dataOrThrow(await s.owner.from("forklifts").insert({ id: forkliftId, organization_id: s.side.organizationId,
    name: `Synthetic sibling unit ${forkliftId}`, model: "SYNTHETIC", status: "available" }).select("id").single(), "create sibling unit");
  const booking = dataOrThrow(await s.owner.from("bookings").insert({
    id: bookingId, organization_id: s.side.organizationId, forklift_id: forkliftId, customer_id: s.side.customerId,
    customer_name: "Synthetic sibling booking", booking_number: `AB-SIBLING-${bookingId}`,
    start_date: original.start_date, end_date: original.end_date, status: "confirmed", currency: "MXN", tipo_cambio: 1,
  }).select("id, organization_id, status, is_e2e").single(), "create sibling booking");
  expect(booking).toMatchObject({ id: bookingId, organization_id: s.side.organizationId, status: "confirmed", is_e2e: false });
  await run(bookingId);
}

async function expectOccupiedFiscalSnapshot(s: Scenario) {
  const before = await readState(s);
  for (const [actor, operation] of [["owner", "rpc"], ["dispatcher", "rpc"], ["dispatcher", "update"]] as const) {
    expect((await cancel(s, actor, operation)).error?.code).toBe("23514");
    expect(await readState(s)).toEqual(before);
  }
  await expectHiddenInvoice(s);
}

async function expectFreeFiscalSnapshot(s: Scenario) {
  const before = await readState(s);
  expect((await cancel(s, "dispatcher", "rpc")).error).toBeNull();
  const after = await readState(s);
  expect(after.booking.status).toBe("cancelled");
  expect(after.invoice).toEqual(before.invoice);
  expect(after.links).toEqual(before.links);
}

for (const link of ["direct", "pivot"] as const) {
  test(`R2 pre-PAC attachment: ordinary SDK cannot attach draft stamping through ${link} to cancelled booking`, async () => {
    const context = readAbContext();
    await withScenario("none", "draft", async (s) => {
      await withAdditionalBooking(s, async (cancelledBookingId) => {
        expect((await s.dispatcher.rpc("cancel_booking", { p_booking_id: cancelledBookingId,
          p_reason: "Synthetic attachment rejection control" })).error).toBeNull();
        const readTarget = async () => dataOrThrow(await s.owner.from("bookings").select("*")
          .eq("id", cancelledBookingId).eq("organization_id", s.side.organizationId).single(), "read cancelled attachment target");
        const targetBefore = await readTarget();
        expect(targetBefore).toMatchObject({ status: "cancelled", is_e2e: false });
        const before = await readState(s);
        const rejected = link === "direct"
          ? await s.owner.from("invoices").update({ booking_id: cancelledBookingId }).eq("id", s.invoiceId).select("id")
          : await s.owner.from("invoice_bookings").insert({ invoice_id: s.invoiceId,
            booking_id: cancelledBookingId, organization_id: s.side.organizationId }).select("invoice_id");
        expect(rejected.error?.code).toBe("23514");
        expect(rejected.error?.message).toBe("No se puede emitir ni ligar una factura vigente a una reserva cancelada.");
        expect(await readState(s)).toEqual(before);
        expect(await readTarget()).toEqual(targetBefore);
      });
    }, context.A, { id: context.draftFiscalAttachmentInvoices[link], status: "none", cfdiStatus: "stamping" });
  });

  for (const state of DRAFT_FISCAL_CASES) {
    const exercise = state.occupied ? expectOccupiedFiscalSnapshot : expectFreeFiscalSnapshot;

    test(`R2 pre-PAC cancellation: draft ${state.key} ${link} is ${state.occupied ? "occupied" : "free"}`, async () => {
      const context = readAbContext();
      await withScenario(link, "draft", async (s) => {
        await expectHiddenInvoice(s);
        expect((await readState(s)).invoice).toMatchObject({ status: "draft",
          cfdi_status: state.cfdiStatus, cancellation_status: state.cancellationStatus });
        await exercise(s);
      }, context.A, { id: context.draftFiscalInvoiceSnapshots[state.key][link],
        status: state.cancellationStatus, cfdiStatus: state.cfdiStatus });
    });
  }

  test(`R2 invoice cancellation: pending fiscal cancellation remains active for ${link} link`, async () => {
    const context = readAbContext();
    await withScenario(link, "sent", async (s) => {
      await expectHiddenInvoice(s);
      const before = await readState(s);
      expect(before.invoice.cancellation_status).toBe("pending");
      const fiscalWrite = await s.owner.from("invoices").update({ cancellation_status: "accepted" })
        .eq("id", s.invoiceId).select("id");
      // DB4-06 column ACL denies fiscal writes before the legacy trigger.
      expect(fiscalWrite.error?.code, "SDK cannot elude existing fiscal column ACL").toBe("42501");
      expect(fiscalWrite.error?.message).toMatch(/permission denied.*invoices/i);
      expect((await cancel(s, "owner", "rpc")).error?.code).toBe("23514");
      expect((await cancel(s, "dispatcher", "rpc")).error?.code).toBe("23514");
      expect((await cancel(s, "dispatcher", "update")).error?.code).toBe("23514");
      expect(await readState(s)).toEqual(before);
    }, context.A, { id: context.cancellationInvoiceSnapshots.pending[link], status: "pending" });
  });

  test(`R2 invoice cancellation: accepted fiscal cancellation permits ${link} booking cancellation`, async () => {
    const context = readAbContext();
    await withScenario(link, "sent", async (s) => {
      expect((await readState(s)).invoice.cancellation_status).toBe("accepted");
      expect((await cancel(s, "dispatcher", "rpc")).error).toBeNull();
      expect((await readState(s)).booking.status).toBe("cancelled");
    }, context.A, { id: context.cancellationInvoiceSnapshots.accepted[link], status: "accepted" });
  });
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
    } finally { await foreign.auth.signOut({ scope: "local" }); }
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

for (const first of ["save-rpc", "issue"] as const) {
  test(`R2 invoice cancellation concurrency: existing billing RPC and direct issue, ${first} holds invoice first`, async () => {
    await withScenario("pivot", "draft", async (s) => {
      const before = await readState(s);
      const save = () => s.owner.rpc("save_invoice_with_bookings", {
        p_invoice: JSON.parse(JSON.stringify(before.invoice)), p_booking_ids: [s.bookingId],
        p_invoice_id: s.invoiceId, p_expected_version: before.invoice.version,
      }).then((result) => result);
      await withLocalRowLock("bookings", s.bookingId, s.side.organizationId, async (gate) => {
        const started: PromiseLike<unknown>[] = [];
        try {
          const initial = first === "save-rpc" ? save() : issue(s);
          started.push(initial);
          await gate.waitForBlocked(first === "save-rpc" ? "save_invoice_with_bookings" : "invoices");
          const following = first === "save-rpc" ? issue(s) : save();
          started.push(following);
          await gate.waitForBlocked(first === "save-rpc" ? "invoices" : "save_invoice_with_bookings");
          gate.release();
          const [initialResult, followingResult] = await Promise.all([initial, following]);
          expect(initialResult.error).toBeNull();
          expect(followingResult.error?.code ?? null).toBe(first === "save-rpc" ? null : "55000");
        } finally {
          gate.release();
          await Promise.allSettled(started);
        }
      });
      const state = await readState(s);
      expect(state.booking.status).toBe("confirmed");
      expect(state.invoice.status).toBe("sent");
      expect(state.links.map((link) => link.booking_id)).toEqual([s.bookingId]);
    });
  });
}

test("R2 invoice cancellation: billing create RPC infers organization on invoice and pivots", async () => {
  await withScenario("none", "draft", async (s) => {
    const source = (await readState(s)).invoice;
    const { organization_id: omittedOrganization, ...payload } = source;
    let createdId: string | undefined;
    try {
      const created = dataOrThrow<Invoice[]>(await s.owner.rpc("save_invoice_with_bookings", {
        p_invoice: { ...payload, booking_id: s.bookingId }, p_booking_ids: [s.bookingId],
        p_invoice_id: null, p_expected_version: null,
      }), "create through existing invoice RPC without organization field");
      createdId = created[0]?.id;
      expect(created).toHaveLength(1);
      expect(created[0]).toMatchObject({ organization_id: s.side.organizationId, booking_id: s.bookingId,
        status: "draft", is_e2e: false });
      const links = dataOrThrow(await s.owner.from("invoice_bookings").select("invoice_id, booking_id, organization_id")
        .eq("invoice_id", createdId), "RPC sync inferred pivot organization");
      expect(links).toEqual([{ invoice_id: createdId, booking_id: s.bookingId, organization_id: s.side.organizationId }]);
      expect((await s.owner.from("invoices").update({ status: "sent" }).eq("id", createdId).select("id")).error).toBeNull();
    } finally {
      if (createdId) dataOrThrow(await s.owner.from("invoices").delete().eq("id", createdId)
        .eq("organization_id", s.side.organizationId).select("id"), "cleanup RPC-created invoice");
    }
  });
});

test("R2 invoice cancellation: legitimate active pivot UPDATE succeeds with a free invoice", async () => {
  await withScenario("pivot", "sent", async (s) => {
    await withAdditionalBooking(s, async (otherBookingId) => {
      const updated = dataOrThrow(await s.owner.from("invoice_bookings").update({ booking_id: otherBookingId })
        .eq("invoice_id", s.invoiceId).eq("booking_id", s.bookingId).select("invoice_id, booking_id, organization_id"),
      "ordinary legitimate pivot UPDATE");
      expect(updated).toEqual([{ invoice_id: s.invoiceId, booking_id: otherBookingId, organization_id: s.side.organizationId }]);
      expect((await readState(s)).invoice.status).toBe("sent");
    });
  });
});

test("R2 invoice cancellation: contended pivot UPDATE returns only 55P03 without drift and billing RPC advances", async () => {
  await withScenario("pivot", "draft", async (s) => {
    await withAdditionalBooking(s, async (otherBookingId) => {
      const before = await readState(s);
      await withLocalRowLock("invoices", s.invoiceId, s.side.organizationId, async (gate) => {
        const saving = s.owner.rpc("save_invoice_with_bookings", {
          p_invoice: JSON.parse(JSON.stringify(before.invoice)), p_booking_ids: [s.bookingId],
          p_invoice_id: s.invoiceId, p_expected_version: before.invoice.version,
        }).then((result) => result);
        try {
          await gate.waitForBlocked("save_invoice_with_bookings");
          const unchanged = await s.owner.from("invoice_bookings").update({ booking_id: s.bookingId })
            .eq("invoice_id", s.invoiceId).eq("booking_id", s.bookingId).select("booking_id");
          expect(unchanged.error).toBeNull();
          const rejected = await s.owner.from("invoice_bookings").update({ booking_id: otherBookingId })
            .eq("invoice_id", s.invoiceId).eq("booking_id", s.bookingId).select("*");
          expect(rejected.error?.code).toBe("55P03");
          expect(rejected.error?.message).toMatch(/reintenta/i);
          expect(await readState(s)).toEqual(before);
          gate.release();
          expect((await saving).error).toBeNull();
        } finally {
          gate.release();
          await Promise.allSettled([saving]);
        }
      });
      expect((await readState(s)).links.map((link) => link.booking_id)).toEqual([s.bookingId]);
    });
  });
});

function dayAfter(date: string, days: number) {
  const parsed = new Date(`${date}T12:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

async function withTwoBookings(run: (s: Scenario, ids: [string, string]) => Promise<void>) {
  const suffix = randomUUID().slice(24);
  const low = `00000000-0000-4000-8000-${suffix}`;
  const high = `ffffffff-ffff-4fff-8fff-${suffix}`;
  // Physical insertion order is high -> low, opposite the UUID lock order.
  await withScenario("none", "draft", async (s) => {
    await withAdditionalBooking(s, async () => {
      const current = await readState(s);
      const laterStart = dayAfter(current.booking.start_date, 2);
      dataOrThrow(await s.owner.from("invoices").update({ billing_period_start: laterStart })
        .eq("id", s.invoiceId).select("id"), "set distinct second billing period");
      expect((await s.owner.rpc("sync_invoice_bookings", { p_invoice_id: s.invoiceId,
        p_booking_ids: [low, high] })).error).toBeNull();
      await run(s, [low, high]);
    }, low);
  }, readAbContext().A, undefined, high);
}

test("R2 invoice cancellation concurrency: reverse-order recurring RPC cursor waits while two-booking issue completes", async () => {
  await withTwoBookings(async (s, ids) => {
    const [low, high] = ids;
    const before = await readState(s);
    const periodStart = before.booking.start_date;
    const periodEnd = dayAfter(periodStart, 1);
    dataOrThrow(await s.owner.from("bookings").update({ recurring_billing: true,
      end_date: dayAfter(periodStart, 40) }).in("id", ids)
      .eq("organization_id", s.side.organizationId).select("id"), "enable synthetic recurring fixtures");
    let createdId: string | undefined;
    try {
      await withLocalRowLock("bookings", ids, s.side.organizationId, async (gate) => {
        let billingSettled = false;
        let issuedResult: Awaited<ReturnType<typeof issue>> | undefined;
        const billing = s.owner.rpc("create_recurring_invoice", {
          p_booking_ids: [high, low], p_customer_id: s.side.customerId, p_customer_name: "Synthetic recurring customer",
          p_line_items: [{ description: "Synthetic recurring period", quantity: 1, unit_price: 100, total: 100 }],
          p_subtotal: 100, p_tax_rate: 0, p_tax_amount: 0, p_total: 100,
          p_billing_period_start: periodStart, p_billing_period_end: periodEnd,
          p_receptor_rfc: "AAA010101AAA", p_receptor_razon_social: "SYNTHETIC", p_receptor_regimen_fiscal: "601",
          p_receptor_domicilio_fiscal_cp: "64000", p_uso_cfdi: "G03", p_moneda: "MXN", p_tipo_cambio: 1,
        }).then((result) => {
          billingSettled = true;
          if (!result.error && Array.isArray(result.data)) createdId = result.data[0]?.invoice_id;
          return result;
        });
        const started: PromiseLike<unknown>[] = [billing];
        try {
          // SHARE barriers on BOTH books stop the cursor's first UPDATE,
          // independent of its physical/query-plan order, while billing's
          // own SHARE readers can pass both parents in reversed input order.
          await gate.waitForBlocked("create_recurring_invoice");
          const issuance = issue(s).then((result) => { issuedResult = result; return result; });
          started.push(issuance);
          await expect.poll(() => issuedResult !== undefined, { timeout: 5_000,
            message: "two-booking issue commits while recurring cursor is still blocked" }).toBe(true);
          expect(issuedResult?.error).toBeNull();
          expect(billingSettled).toBe(false);
          gate.release();
          const created = dataOrThrow<{ invoice_id: string; already_existed: boolean }[]>(await billing, "recurring RPC advances");
          createdId = created[0]?.invoice_id;
          expect(created).toHaveLength(1);
          expect(created[0].already_existed).toBe(false);
        } finally {
          gate.release();
          await Promise.allSettled(started);
        }
      }, "share");
      const books = dataOrThrow(await s.owner.from("bookings").select("id, last_billed_date, is_e2e")
        .in("id", ids).order("id"), "recurring cursor committed on both books");
      expect(books).toEqual(ids.map((id) => ({ id, last_billed_date: periodEnd, is_e2e: false })));
      expect((await readState(s)).invoice.status).toBe("sent");
    } finally {
      if (createdId) dataOrThrow(await s.owner.from("invoices").delete().eq("id", createdId)
        .eq("organization_id", s.side.organizationId).select("id"), "cleanup recurring invoice");
    }
  });
});

test("R2 invoice cancellation concurrency: two multi-booking invoices issue under shared parent barriers", async () => {
  await withTwoBookings(async (s, ids) => {
    const before = await readState(s);
    const { organization_id: omittedOrganization, ...source } = before.invoice;
    let createdId: string | undefined;
    try {
      const created = dataOrThrow<Invoice[]>(await s.owner.rpc("save_invoice_with_bookings", {
        p_invoice: { ...source, booking_id: null, billing_period_start: before.booking.start_date,
          billing_period_end: dayAfter(before.booking.start_date, 1) },
        p_booking_ids: [...ids].reverse(), p_invoice_id: null, p_expected_version: null,
      }), "create separate period with reversed multi-booking input");
      createdId = created[0]?.id;
      expect(created).toHaveLength(1);
      await withLocalRowLock("bookings", ids, s.side.organizationId, async (gate) => {
        let finished = 0;
        const first = issue(s).then((result) => { finished += 1; return result; });
        const second = s.owner.from("invoices").update({ status: "sent" }).eq("id", createdId)
          .eq("organization_id", s.side.organizationId).select("id").then((result) => { finished += 1; return result; });
        try {
          await expect.poll(() => finished, { timeout: 5_000,
            message: "both issuance readers complete despite parent SHARE barriers" }).toBe(2);
          const results = await Promise.all([first, second]);
          expect(results.map((result) => result.error)).toEqual([null, null]);
        } finally {
          gate.release();
          await Promise.allSettled([first, second]);
        }
      }, "share");
    } finally {
      if (createdId) dataOrThrow(await s.owner.from("invoices").delete().eq("id", createdId)
        .eq("organization_id", s.side.organizationId).select("id"), "cleanup second issued invoice");
    }
  });
});
