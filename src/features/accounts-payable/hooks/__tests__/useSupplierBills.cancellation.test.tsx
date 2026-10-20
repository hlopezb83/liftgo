import { QueryClient, isCancelledError } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";

const api = vi.hoisted(() => ({ from: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: api.from } }));

import { supplierBillQueries, useSupplierBills } from "../useSupplierBills";

type Table = "supplier_bills" | "supplier_payments";
type Request = { table: Table; start: number; signal?: AbortSignal };

describe("supplier bill pagination cancellation", () => {
  let requests: Request[];
  let releaseFirstPages: () => void;
  let firstPages: Promise<void>;
  const clients: QueryClient[] = [];

  beforeEach(() => {
    requests = [];
    firstPages = new Promise<void>((resolve) => { releaseFirstPages = resolve; });
    api.from.mockReset();
    api.from.mockImplementation((table: Table) => {
      const request: Request = { table, start: 0 };
      let end = 0;
      const builder = {
        select: () => builder,
        order: () => builder,
        range: (start: number, to: number) => {
          request.start = start;
          end = to;
          requests.push(request);
          return builder;
        },
        abortSignal: (signal: AbortSignal) => {
          request.signal = signal;
          return builder;
        },
        returns: async () => {
          if (request.start === 0) await firstPages;
          // Deliberately resolve even after abort: an already completed response
          // must not allow the pagination loop to start another request.
          const count = table === "supplier_bills" ? 1_001 : 501;
          const data = Array.from({ length: count }, (_, index) => table === "supplier_bills"
            ? { id: `bill-${index}`, total: 100, currency: "MXN" }
            : {
                id: `payment-${index}`, bill_id: `bill-${index}`,
                amount: 10, payment_date: "2026-10-20",
                rep_required: false, rep_status: "not_required",
              });
          return { data: data.slice(request.start, end + 1), error: null };
        },
      };
      return builder;
    });
  });

  afterEach(() => {
    releaseFirstPages();
    clients.splice(0).forEach((client) => client.clear());
  });

  const drainResponses = async () => {
    releaseFirstPages();
    // Drain both resolved responses and all of their promise continuations.
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
  };

  it("aborts both requests and never fetches more pages after cancelQueries", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const query = supplierBillQueries.list();
    const result = client.fetchQuery(query).catch((error: unknown) => error);
    await waitFor(() => expect(requests).toHaveLength(2));

    await client.cancelQueries({ queryKey: query.queryKey });
    await drainResponses();

    expect(isCancelledError(await result)).toBe(true);
    expect(requests.map(({ table, start }) => [table, start])).toEqual([
      ["supplier_bills", 0], ["supplier_payments", 0],
    ]);
    expect(requests.every(({ signal }) => signal?.aborted)).toBe(true);
    expect(client.getQueryData(query.queryKey)).toBeUndefined();
  });

  it("aborts when the last observer unmounts and keeps late data out of the cache", async () => {
    const { Wrapper, queryClient } = createQueryWrapper();
    clients.push(queryClient);
    const { unmount } = renderHook(() => useSupplierBills(), { wrapper: Wrapper });
    await waitFor(() => expect(requests).toHaveLength(2));

    unmount();
    await drainResponses();

    expect(requests).toHaveLength(2);
    expect(requests.every(({ signal }) => signal?.aborted)).toBe(true);
    expect(queryClient.getQueryData(supplierBillQueries.list().queryKey)).toBeUndefined();
  });

  it("propagates one active signal to all pages and keeps uncancelled results complete", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const query = supplierBillQueries.list();
    const result = client.fetchQuery(query);
    releaseFirstPages();
    const rows = await result;

    expect(requests.filter(({ table }) => table === "supplier_bills").map(({ start }) => start))
      .toEqual([0, 500, 1_000]);
    expect(requests.filter(({ table }) => table === "supplier_payments").map(({ start }) => start))
      .toEqual([0, 500]);
    const signal = requests[0].signal;
    expect(signal).toBeInstanceOf(AbortSignal);
    expect(requests.every((request) => request.signal === signal && request.signal?.aborted === false)).toBe(true);
    expect(rows).toHaveLength(1_001);
    expect(rows[500].payments).toHaveLength(1);
    expect(rows[1_000].payments).toHaveLength(0);
    expect(client.getQueryData(query.queryKey)).toBe(rows);
  });

  it("can refetch after cancellation without letting old responses start more pages", async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    clients.push(client);
    const query = supplierBillQueries.list();
    const cancelled = client.fetchQuery(query).catch((error: unknown) => error);
    await waitFor(() => expect(requests).toHaveLength(2));
    const oldSignal = requests[0].signal;

    await client.cancelQueries({ queryKey: query.queryKey });
    const refetched = client.fetchQuery(query);
    await waitFor(() => expect(requests).toHaveLength(4));
    releaseFirstPages();
    const rows = await refetched;

    expect(isCancelledError(await cancelled)).toBe(true);
    expect(oldSignal?.aborted).toBe(true);
    expect(requests.filter(({ signal }) => signal === oldSignal)).toHaveLength(2);
    expect(requests.filter(({ signal }) => signal !== oldSignal)).toHaveLength(5);
    expect(rows).toHaveLength(1_001);
    expect(client.getQueryData(query.queryKey)).toBe(rows);
  });
});
