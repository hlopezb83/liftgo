import { randomUUID } from "node:crypto";
import { writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { expect, test, vi } from "vitest";
import { todayKeyMty } from "../../../src/lib/format/dateFormats.ts";
import { readAbContext } from "./abSeed.ts";
import { assertLocalEphemeralBackend, createLocalUserClient, localSupabaseUrl } from "./localBackend.ts";
import { withLocalRowLock } from "./localLockCoordinator.ts";

const provider = vi.hoisted(() => {
  const deferred = () => {
    let resolve;
    const promise = new Promise((accept) => { resolve = accept; });
    return { promise, resolve };
  };
  return { entered: deferred(), release: deferred(), configCalls: 0, createCalls: 0, invoiceCalls: 0 };
});

// This is the external provider adapter only. Handler/auth/org/SQL are intact.
// Pause after the real committed claim, then fail safely before PAC. Returning
// test + null would emit the legacy fake CFDI, so use live + null: HTTP 400 and
// the handler's own releaseClaim(error), without changing DB company settings.
vi.mock("../../../supabase/functions/_shared/facturapi/client.ts", () => ({
  getFacturapiConfigForOrganization: async ({ organizationId }) => {
    provider.configCalls++;
    provider.entered.resolve();
    await provider.release.promise;
    return { mode: "live", apiKey: null, organizationId, fromEnvFallback: false };
  },
  createFacturapiClient: () => { provider.createCalls++; throw new Error("Unexpected provider construction"); },
  createInvoiceWithSignal: () => { provider.invoiceCalls++; throw new Error("Unexpected provider create"); },
  binaryToBytes: () => { throw new Error("Unexpected provider binary"); },
  binaryToText: () => { throw new Error("Unexpected provider text"); },
  retryOnFacturapi5xx: () => { throw new Error("Unexpected provider retry"); },
  describeFacturapiError: () => ({ status: 0, message: "Unexpected provider boundary", detail: "" }),
  isFacturapiConfigError: () => false,
}));

// Only CORS reads Deno.env at module load. Compile/import the actual handler;
// do not import its Deno.serve entry or substitute auth/claims/DB operations.
vi.stubGlobal("Deno", { env: { get: () => undefined } });
const { handleStampCfdi } = await import("../../../supabase/functions/stamp-cfdi/handler.ts");
const nativeFetch = globalThis.fetch.bind(globalThis);

function data(result, label) {
  expect(result.error?.code ?? null, label).toBeNull();
  expect(result.data == null, `${label}: returned data`).toBe(false);
  return result.data;
}

async function login(side, actor) {
  const user = side[actor];
  const client = await createLocalUserClient(`actual handler ${actor}`, user.email, user.password);
  const identity = await client.auth.getUser();
  expect(identity.error?.code ?? null, "real Auth getUser").toBeNull();
  expect(identity.data.user?.id).toBe(user.userId);
  expect(identity.data.user?.role).toBe("authenticated");
  expect(data(await client.rpc("current_internal_organization_id"), "real organization")).toBe(side.organizationId);
  expect(data(await client.from("user_roles").select("role").eq("user_id", user.userId), "real role"))
    .toEqual([{ role: actor === "internal" ? "admin" : "dispatcher" }]);
  return client;
}

async function snapshot(s) {
  const [booking, invoice, links] = await Promise.all([
    s.owner.from("bookings").select("*").eq("id", s.bookingId).eq("organization_id", s.side.organizationId).single(),
    s.owner.from("invoices").select("*").eq("id", s.invoiceId).eq("organization_id", s.side.organizationId).single(),
    s.owner.from("invoice_bookings").select("*").eq("invoice_id", s.invoiceId)
      .eq("organization_id", s.side.organizationId).order("booking_id"),
  ]);
  return { booking: data(booking, "booking snapshot"), invoice: data(invoice, "invoice snapshot"), links: data(links, "link snapshot") };
}

async function prepare(s, link) {
  const start = todayKeyMty();
  const endDate = new Date(`${start}T12:00:00Z`);
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  const end = endDate.toISOString().slice(0, 10);
  data(await s.owner.from("forklifts").insert({
    id: s.forkliftId, organization_id: s.side.organizationId, name: `Synthetic handler ${s.forkliftId}`,
    model: "SYNTHETIC", serial_number: s.forkliftId, status: "available", daily_rate: 100,
  }).select("id").single(), "create ordinary forklift");
  const booking = data(await s.owner.from("bookings").insert({
    id: s.bookingId, organization_id: s.side.organizationId, forklift_id: s.forkliftId,
    customer_id: s.side.customerId, customer_name: "Synthetic handler customer",
    booking_number: `AB-HANDLER-${s.bookingId}`, start_date: start, end_date: end,
    status: "confirmed", currency: "MXN", tipo_cambio: 1, daily_rate: 100, recurring_billing: false,
  }).select("id, is_e2e").single(), "create ordinary booking");
  expect(booking.is_e2e).toBe(false);
  const invoice = data(await s.owner.from("invoices").insert({
    id: s.invoiceId, organization_id: s.side.organizationId, customer_id: s.side.customerId,
    customer_name: "Synthetic handler customer", invoice_number: `AB-HANDLER-${s.invoiceId}`,
    status: "draft", issued_at: start, due_date: null,
    booking_id: link === "direct" ? s.bookingId : null,
    billing_period_start: start, billing_period_end: end,
    moneda: "MXN", tipo_cambio: 1, metodo_pago: "PPD", forma_pago: "99",
    line_items: [{ description: "Synthetic rental", quantity: 1, unit_price: 100, total: 100 }],
    subtotal: 100, tax_rate: 0, tax_amount: 0, total: 100,
  }).select("*").single(), "create ordinary draft");
  expect(invoice).toMatchObject({ status: "draft", is_e2e: false, cfdi_status: "pending",
    cfdi_uuid: null, facturapi_invoice_id: null });
  if (link === "pivot") data(await s.owner.from("invoice_bookings").insert({
    invoice_id: s.invoiceId, booking_id: s.bookingId, organization_id: s.side.organizationId,
  }).select("invoice_id"), "create ordinary pivot");
}

async function cleanup(s) {
  // Ordinary owner SDK only, never a service cleanup or a seed bypass.
  for (const [table, id] of [["invoices", s.invoiceId], ["bookings", s.bookingId], ["forklifts", s.forkliftId]]) {
    const present = data(await s.owner.from(table).select("id").eq("id", id)
      .eq("organization_id", s.side.organizationId), `cleanup read ${table}`);
    expect(data(await s.owner.from(table).delete().eq("id", id)
      .eq("organization_id", s.side.organizationId).select("id"), `cleanup delete ${table}`)).toEqual(present);
    expect(data(await s.owner.from(table).select("id").eq("id", id), `cleanup verify ${table}`)).toEqual([]);
  }
}

test("real authenticated fiscal handler claim versus booking cancellation", async () => {
  const proof = { phase: "preflight", authVerified: false, cleanupVerified: false,
    callerFactoryCalls: 0, callerUsesRequestBearer: false, serviceFactoryCalls: 0,
    claimResponses: [], configCalls: 0, providerCreateCalls: 0, providerInvoiceCalls: 0,
    blockedRemoteCalls: 0, claimQueuedBehindCancellation: false,
    cancelResult: null, handlerStatus: null, snapshotUnchanged: false };
  let s;
  let handlerWork;
  try {
    // Before any SDK client, login, fixture read or network request.
    assertLocalEphemeralBackend("actual fiscal handler integration");
    const link = process.env.AB_STAMP_CLAIM_LINK;
    const order = process.env.AB_STAMP_CLAIM_ORDER;
    expect(["direct", "pivot"].includes(link), "explicit link scenario").toBe(true);
    expect(["cancel-first", "claim-first"].includes(order), "explicit order scenario").toBe(true);
    const url = localSupabaseUrl("actual fiscal handler SDK ports");
    const base = new URL(url);
    vi.stubGlobal("fetch", async (input, init) => {
      const target = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (target.origin !== base.origin) {
        proof.blockedRemoteCalls++;
        throw new Error("Non-local API request blocked before transport");
      }
      const response = await nativeFetch(input, init);
      // Observe actual SDK HTTP responses without altering them. Retain ONLY
      // HTTP status, SQL error code and presence of a returned claim row.
      if (init?.method?.toUpperCase() === "PATCH" && target.pathname === "/rest/v1/invoices") {
        const patch = typeof init.body === "string" ? JSON.parse(init.body) : null;
        if (patch?.cfdi_status === "stamping") {
          const body = await response.clone().json();
          proof.claimResponses.push({ status: response.status, code: typeof body?.code === "string" ? body.code : null,
            claimedRow: Array.isArray(body) ? body.length > 0 : typeof body?.id === "string" });
        }
      }
      return response;
    });
    const side = readAbContext().A;
    proof.phase = "real Auth and role verification";
    const owner = await login(side, "internal");
    const dispatcher = await login(side, "dispatcher");
    proof.authVerified = true;
    s = { owner, dispatcher, side, invoiceId: randomUUID(), bookingId: randomUUID(), forkliftId: randomUUID() };
    proof.phase = "ordinary synthetic fixtures";
    await prepare(s, link);
    const original = await snapshot(s);
    const session = await owner.auth.getSession();
    expect(Boolean(session.data.session?.access_token), "real login session available").toBe(true);
    const authHeader = `Bearer ${session.data.session.access_token}`;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anonKey = process.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    expect(Boolean(serviceKey && anonKey), "existing local CLI keys available").toBe(true);
    // These are real SDK clients supplied through the existing production DI
    // ports. Service access is internal to the authenticated handler only.
    const invoke = () => handleStampCfdi(new Request("http://localhost:8080/stamp-cfdi", {
      method: "POST", headers: { Authorization: authHeader, "Content-Type": "application/json" },
      body: JSON.stringify({ invoice_id: s.invoiceId }),
    }), {
      createCallerClient: (header) => {
        proof.callerFactoryCalls++;
        proof.callerUsesRequestBearer = header === authHeader;
        expect(proof.callerUsesRequestBearer).toBe(true); // Never print a JWT in a failed equality.
        return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false },
          global: { headers: { Authorization: header } } });
      },
      createServiceClient: () => {
        proof.serviceFactoryCalls++;
        return createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
      },
      fetchImpl: globalThis.fetch,
      env: () => undefined,
    });
    const cancel = () => Promise.resolve(dispatcher.rpc("cancel_booking", {
      p_booking_id: s.bookingId, p_reason: "Synthetic handler claim ordering",
    }));

    if (order === "cancel-first") {
      proof.phase = "cancellation queues before actual claim";
      await withLocalRowLock("bookings", s.bookingId, side.organizationId, async (gate) => {
        const cancelling = cancel();
        try {
          await gate.waitForBlocked("cancel_booking");
          handlerWork = invoke();
          // The read-only coordinator is existing A/B infrastructure. It
          // holds B FOR UPDATE; business writes remain authenticated HTTP.
          const blocked = gate.waitForBlocked("invoices").then(() => true, () => false);
          proof.claimQueuedBehindCancellation = await Promise.race([
            blocked, provider.entered.promise.then(() => false),
          ]);
          gate.release();
          provider.release.resolve();
          const [cancelled, response] = await Promise.all([cancelling, handlerWork]);
          proof.cancelResult = { code: cancelled.error?.code ?? null };
          proof.handlerStatus = response.status;
          await blocked; // Settle the observer before closing its connection, including on the red baseline.
          expect(cancelled.error?.code ?? null, "authenticated cancellation commits first").toBeNull();
          expect(response.status, "SQL-aborted real claim").toBe(409);
          expect(proof.claimQueuedBehindCancellation).toBe(true);
        } finally {
          gate.release(); provider.release.resolve();
          await Promise.allSettled([cancelling, ...(handlerWork ? [handlerWork] : [])]);
        }
      });
      const after = await snapshot(s);
      expect(after.booking.status).toBe("cancelled");
      expect(after.invoice).toEqual(original.invoice);
      expect(after.links).toEqual(original.links);
      proof.snapshotUnchanged = true;
      expect(proof.claimResponses).toEqual([{ status: 400, code: "23514", claimedRow: false }]);
      expect(provider.configCalls).toBe(0);
    } else {
      proof.phase = "actual committed claim reaches configuration barrier";
      handlerWork = invoke();
      await Promise.race([provider.entered.promise, handlerWork.then((response) => {
        throw new Error(`Handler ended before configuration barrier: HTTP ${response.status}`);
      })]);
      const claimed = await snapshot(s);
      expect(claimed.invoice).toMatchObject({ status: "draft", cfdi_status: "stamping",
        cfdi_uuid: null, facturapi_invoice_id: null, is_e2e: false });
      expect(proof.claimResponses).toEqual([{ status: 200, code: null, claimedRow: true }]);
      proof.phase = "authenticated cancellation after committed actual claim";
      const cancelled = await cancel();
      proof.cancelResult = { code: cancelled.error?.code ?? null };
      expect(cancelled.error?.code, "dispatcher cannot cancel occupied fiscal draft").toBe("23514");
      expect(await snapshot(s)).toEqual(claimed);
      proof.snapshotUnchanged = true;
      provider.release.resolve();
      const response = await handlerWork;
      proof.handlerStatus = response.status;
      expect(response.status, "safe missing-live-key pre-PAC finish").toBe(400);
      expect((await snapshot(s)).invoice).toMatchObject({ status: "draft", cfdi_status: "error",
        cfdi_uuid: null, facturapi_invoice_id: null });
      expect(provider.configCalls).toBe(1);
    }
    expect(proof.callerFactoryCalls).toBe(1);
    expect(proof.serviceFactoryCalls).toBe(1);
    expect(provider.createCalls).toBe(0);
    expect(provider.invoiceCalls).toBe(0);
    expect(proof.blockedRemoteCalls).toBe(0);
    proof.phase = "passed";
  } finally {
    provider.release.resolve();
    if (handlerWork) await Promise.allSettled([handlerWork]);
    try {
      if (s) {
        await cleanup(s);
        await Promise.all([s.owner.auth.signOut({ scope: "local" }), s.dispatcher.auth.signOut({ scope: "local" })]);
        proof.cleanupVerified = true;
      }
    } finally {
      proof.configCalls = provider.configCalls;
      proof.providerCreateCalls = provider.createCalls;
      proof.providerInvoiceCalls = provider.invoiceCalls;
      if (process.env.AB_STAMP_CLAIM_RESULT) {
        writeFileSync(process.env.AB_STAMP_CLAIM_RESULT, JSON.stringify(proof), { mode: 0o600 });
      }
      vi.unstubAllGlobals();
    }
  }
});
