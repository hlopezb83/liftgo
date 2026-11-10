import { deepStrictEqual, ok, strictEqual } from "node:assert/strict";
import { createFacturapiClient } from "../_shared/facturapi/client.ts";
import { recoverCreditNotePdf } from "./recoverCreditNotePdf.ts";

const ID = "11111111-1111-4111-8111-111111111111";
const ORG = "22222222-2222-4222-8222-222222222222";
const UUID = "33333333-3333-4333-8333-333333333333";
const PDF = new TextEncoder().encode("%PDF-1.7\nSDK offline fixture\n%%EOF");
const MAX_BYTES = 10 * 1024 * 1024;
const METADATA = {
  id: "pac_contract",
  uuid: UUID,
  external_id: ID,
  type: "E",
  status: "valid",
  livemode: false,
};
type Row = Record<string, unknown>;

function fixture() {
  const note: Row = {
    id: ID,
    organization_id: ORG,
    cfdi_uuid: UUID,
    facturapi_invoice_id: METADATA.id,
    updated_at: "2026-01-01T00:00:00.000Z",
    status: "stamped",
    cfdi_status: "stamped",
    cancellation_status: "none",
    cfdi_xml_pending: false,
    cfdi_xml_url: `${ORG}/original.xml`,
    cfdi_pdf_url: null,
    total: 116,
    stamping_attempts: 4,
    lookup_attempts: 2,
  };
  const writes: Row[] = [];
  const uploads: Array<{ path: string; bytes: Uint8Array; options: Row }> = [];
  const binaries: unknown[] = [];
  const admin = {
    from(table: string) {
      strictEqual(table, "credit_notes");
      let patch: Row = {};
      const filters: Row = {};
      const query = {
        update(value: Row) {
          patch = value;
          return query;
        },
        eq(key: string, value: unknown) {
          filters[key] = value;
          return query;
        },
        is(key: string, value: unknown) {
          filters[key] = value;
          return query;
        },
        select() {
          return query;
        },
        maybeSingle() {
          if (
            Object.entries(filters).some(([key, value]) => note[key] !== value)
          ) {
            return Promise.resolve({ data: null, error: null });
          }
          writes.push({ ...patch });
          Object.assign(note, patch);
          note.updated_at = `2026-11-08T12:00:0${writes.length}.123456Z`;
          return Promise.resolve({
            data: { id: ID, updated_at: note.updated_at },
            error: null,
          });
        },
      };
      return query;
    },
    storage: {
      from(bucket: string) {
        strictEqual(bucket, "cfdi-files");
        return {
          upload(path: string, bytes: Uint8Array, options: Row) {
            uploads.push({ path, bytes, options });
            return Promise.resolve({ error: null });
          },
        };
      },
    },
  } as unknown as Parameters<typeof recoverCreditNotePdf>[0];
  return { note, writes, uploads, admin, binaries };
}

async function withOfflineSdk(
  respond: (path: string, signal: AbortSignal) => Promise<Response> | Response,
  check: (
    state: ReturnType<typeof fixture>,
    result: { status: string },
    calls: string[],
  ) => void,
  accelerateTimeout = false,
) {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const calls: string[] = [];
  const delays: number[] = [];
  const state = fixture();
  // This replacement has no passthrough. The test runs without --allow-net.
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    strictEqual(url.origin, "https://www.facturapi.io");
    ok(
      ["/v2/invoices/pac_contract", "/v2/invoices/pac_contract/pdf"].includes(
        url.pathname,
      ),
    );
    strictEqual(url.search, "");
    strictEqual(init?.method, "GET");
    strictEqual(
      new Headers(init?.headers).get("Authorization"),
      "Bearer sk_test_offline_contract",
    );
    ok(init?.signal instanceof AbortSignal);
    calls.push(url.pathname);
    return Promise.resolve(respond(url.pathname, init.signal));
  }) as typeof fetch;
  if (accelerateTimeout) {
    // Verify the configured 8-second timeout while avoiding slow CI tests.
    globalThis.setTimeout = ((
      handler: Parameters<typeof setTimeout>[0],
      delay?: number,
      ...args: unknown[]
    ) => {
      delays.push(delay ?? 0);
      return originalSetTimeout(
        () => Reflect.apply(handler, globalThis, args),
        delay === 8_000 ? 15 : delay,
      );
    }) as typeof setTimeout;
  }
  try {
    const client = createFacturapiClient("sk_test_offline_contract");
    const result = await recoverCreditNotePdf(
      state.admin,
      client,
      { ...state.note },
      ORG,
      "test",
      () => false,
    );
    check(state, result, calls);
    if (accelerateTimeout) ok(delays.includes(8_000));
    // Claim and optional file reference are the only writes, even on failure.
    for (const patch of state.writes) {
      ok(
        Object.keys(patch).every((key) =>
          ["updated_at", "cfdi_pdf_url"].includes(key)
        ),
      );
    }
    strictEqual(state.note.cfdi_status, "stamped");
    strictEqual(state.note.stamping_attempts, 4);
    strictEqual(state.note.lookup_attempts, 2);
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }
}

function jsonMetadata() {
  return new Response(JSON.stringify(METADATA), {
    headers: { "Content-Type": "application/json" },
  });
}

Deno.test("NC PDF SDK 6: real binary response recovers by GET ID only", async () => {
  await withOfflineSdk(
    (path) =>
      path.endsWith("/pdf")
        ? new Response(PDF, { headers: { "Content-Type": "application/pdf" } })
        : jsonMetadata(),
    (state, result, calls) => {
      strictEqual(result.status, "nc_pdf_recovered");
      deepStrictEqual(calls, [
        "/v2/invoices/pac_contract",
        "/v2/invoices/pac_contract/pdf",
      ]);
      strictEqual(state.uploads.length, 1);
      deepStrictEqual(state.uploads[0].bytes, PDF);
      strictEqual(state.uploads[0].options.upsert, false);
      ok(
        state.uploads[0].path.startsWith(
          `${ORG}/credit-notes/${ID}/${UUID}-recovery-`,
        ),
      );
      strictEqual(state.note.cfdi_pdf_url, state.uploads[0].path);
    },
  );
});

for (const size of [MAX_BYTES, MAX_BYTES + 1]) {
  Deno.test(`NC PDF SDK 6: ${size}-byte binary honors the 10 MiB limit`, async () => {
    const bytes = new Uint8Array(size);
    bytes.set(PDF);
    await withOfflineSdk(
      (path) =>
        path.endsWith("/pdf")
          ? new Response(bytes, {
            headers: { "Content-Type": "application/pdf" },
          })
          : jsonMetadata(),
      (state, result) => {
        strictEqual(
          result.status,
          size === MAX_BYTES ? "nc_pdf_recovered" : "nc_pdf_recovery_pending",
        );
        strictEqual(state.uploads.length, size === MAX_BYTES ? 1 : 0);
        strictEqual(state.writes.length, size === MAX_BYTES ? 2 : 1);
      },
    );
  });
}

Deno.test("NC PDF SDK 6: an oversized open body stops its underlying transport", async () => {
  let stopped = false;
  let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
  const chunk = new Uint8Array(6 * 1024 * 1024);
  chunk.set(PDF);
  try {
    await withOfflineSdk((path, signal) => {
      if (!path.endsWith("/pdf")) return jsonMetadata();
      let sent = 0;
      return new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            bodyController = controller;
            signal.addEventListener("abort", () => {
              stopped = true;
              controller.error(
                new DOMException("Transport aborted", "AbortError"),
              );
            }, { once: true });
          },
          pull(controller) {
            if (sent++ < 2) controller.enqueue(chunk);
          },
          cancel() {
            stopped = true;
          },
        }),
        { headers: { "Content-Type": "application/pdf" } },
      );
    }, (state, result) => {
      strictEqual(result.status, "nc_pdf_recovery_pending");
      strictEqual(state.uploads.length, 0);
      strictEqual(
        stopped,
        true,
        "Rejecting an oversized binary must stop its underlying response body",
      );
    });
  } finally {
    // Ensure a failing regression test also releases the offline source.
    try {
      bodyController?.close();
    } catch { /* already closed or aborted */ }
  }
});

for (const phase of ["retrieve", "pdf-headers", "pdf-body"]) {
  Deno.test(`NC PDF SDK 6: timeout aborts ${phase} and never uploads late data`, async () => {
    let transportAborted = false;
    await withOfflineSdk((path, signal) => {
      if (!path.endsWith("/pdf") && phase !== "retrieve") return jsonMetadata();
      if (phase !== "pdf-body") {
        return new Promise<Response>((_resolve, reject) => {
          signal.addEventListener("abort", () => {
            transportAborted = true;
            reject(new DOMException("Offline timeout", "AbortError"));
          }, { once: true });
        });
      }
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(PDF);
          signal.addEventListener("abort", () => {
            transportAborted = true;
            controller.error(
              new DOMException("Offline body timeout", "AbortError"),
            );
          }, { once: true });
        },
      });
      return new Response(body, {
        headers: { "Content-Type": "application/pdf" },
      });
    }, (state, result, calls) => {
      strictEqual(result.status, "nc_pdf_recovery_pending");
      strictEqual(transportAborted, true);
      strictEqual(calls.length, phase === "retrieve" ? 1 : 2);
      strictEqual(state.uploads.length, 0);
      strictEqual(state.writes.length, 1);
      strictEqual(state.note.cfdi_pdf_url, null);
    }, true);
  });
}
