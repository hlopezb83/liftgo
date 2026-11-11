import { createElement, type ReactNode } from "react";
import { renderHook, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, expect, it, vi } from "vitest";

const fixture = vi.hoisted(() => ({ transport: vi.fn(), org: "org-a", actor: "actor-a" }));
vi.mock("@/contexts/OrganizationContext", () => ({ useVerifiedOrganizationId: () => fixture.org }));
vi.mock("@/lib/query/useVerifiedIdentityScope", () => ({ useVerifiedIdentityScope: () => `${fixture.actor}:${fixture.org}` }));
vi.mock("@/integrations/supabase/client", async () => {
  const { createClient } = await import("@supabase/supabase-js");
  return { supabase: createClient("https://booking-candidates.invalid", "offline-fixture", {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: fixture.transport },
  }) };
});

import { useInvoiceBookingCandidates } from "../useInvoiceBookingCandidates";

beforeEach(() => { fixture.transport.mockReset(); fixture.org = "org-a"; fixture.actor = "actor-a"; });

function booking(id: string, status = "confirmed", organization_id = "org-a") {
  return {
    id, status, organization_id, start_date: "2026-01-01", end_date: "2026-01-31", forklift_id: "unit-1",
    customer_id: "customer-1", customer_name: "Cliente", booking_number: id, quote_id: null,
    quote_rental_line_index: null, recurring_billing: false, daily_rate: 50, weekly_rate: null,
    monthly_rate: null, currency: "MXN", tipo_cambio: 1, forklifts: { name: "Equipo", model: "A" },
  };
}

it("fetches only the requested page and keeps historical links across searches, without showing them to a new identity", async () => {
  const historical = booking("historical", "cancelled");
  const requests: { args: Record<string, unknown>; signal: AbortSignal }[] = [];
  let resolveSecondPage: (() => void) | undefined;
  fixture.transport.mockImplementation(async (input: string, init: RequestInit) => {
    expect(new URL(input).pathname).toBe("/rest/v1/rpc/get_invoice_booking_candidate_page");
    const args = JSON.parse(String(init.body)) as Record<string, unknown>;
    const signal = init.signal as AbortSignal;
    requests.push({ args, signal });
    if (args.p_expected_organization_id === "org-b") {
      await new Promise<void>((_resolve, reject) => {
        signal.addEventListener("abort", () => reject(new DOMException("Cancelled", "AbortError")), { once: true });
      });
    }
    if (args.p_page === 1) await new Promise<void>((resolve) => { resolveSecondPage = resolve; });
    const isFirstPage = args.p_page === 0;
    const rows = isFirstPage ? Array.from({ length: 50 }, (_, index) => booking(`booking-${index}`)) : [booking("second-page")];
    return new Response(JSON.stringify({ rows, linked: [historical], hasMore: isFirstPage, pageIndex: args.p_page }), {
      headers: { "Content-Type": "application/json" },
    });
  });

  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  const view = renderHook(({ search, page }) => useInvoiceBookingCandidates([historical.id], {
    search, page, customerId: "customer-1", linkedOnly: false,
  }), { wrapper, initialProps: { search: "", page: 0 } });
  try {
    await waitFor(() => expect(view.result.current.data?.length).toBe(51));
    expect(view.result.current.hasMore).toBe(true);
    expect(requests).toHaveLength(1);
    expect(requests[0].args).toMatchObject({ p_search: "", p_page: 0, p_page_size: 50,
      p_expected_organization_id: "org-a", p_customer_id: "customer-1", p_linked_ids: [historical.id] });

    view.rerender({ search: "Equipo", page: 1 });
    await waitFor(() => expect(resolveSecondPage).toBeTypeOf("function"));
    expect(view.result.current.isPlaceholderData).toBe(true);
    expect(view.result.current.data?.some(({ id }) => id === historical.id)).toBe(true);
    expect(requests[1].args).toMatchObject({ p_search: "Equipo", p_page: 1, p_page_size: 50, p_linked_ids: [historical.id] });
    resolveSecondPage?.();
    await waitFor(() => expect(view.result.current.data?.map(({ id }) => id)).toEqual(["second-page", historical.id]));
    expect(view.result.current.hasMore).toBe(false);

    fixture.org = "org-b";
    fixture.actor = "actor-b";
    view.rerender({ search: "", page: 0 });
    await waitFor(() => expect(requests).toHaveLength(3));
    expect(view.result.current.data).toBeUndefined();
    expect(view.result.current.isPlaceholderData).toBe(false);
    view.unmount();
    expect(requests[2].signal.aborted).toBe(true);
  } finally {
    view.unmount();
    client.clear();
  }
});

it("completes editing an invoice without linked bookings without a request", async () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const wrapper = ({ children }: { children: ReactNode }) => createElement(QueryClientProvider, { client }, children);
  const view = renderHook(() => useInvoiceBookingCandidates([], { search: "", page: 0, customerId: null, linkedOnly: true }), { wrapper });
  try {
    await waitFor(() => expect(view.result.current.isSuccess).toBe(true));
    expect(view.result.current.data).toEqual([]);
    expect(fixture.transport).not.toHaveBeenCalled();
  } finally {
    view.unmount();
    client.clear();
  }
});
