import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import { expect, it, vi } from "vitest";
import { forkliftKeys } from "../../../lib/queryKeys";
import { useForkliftMap } from "../useForkliftMap";

const from = vi.hoisted(() => vi.fn());
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from } }));

it("uses no fleet request or cached options while disabled, and enables normal reads on demand", async () => {
  const row = { id: "unit-1", name: "Equipo" };
  const chain = { select: vi.fn(), is: vi.fn(), or: vi.fn(), order: vi.fn(), limit: vi.fn(), returns: vi.fn() };
  for (const method of [chain.select, chain.is, chain.or, chain.order, chain.limit]) method.mockReturnValue(chain);
  chain.returns.mockResolvedValue({ data: [row], error: null });
  from.mockReturnValue(chain);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  client.setQueryData(forkliftKeys.lists(), [row], { updatedAt: 1 });
  const wrapper = ({ children }: PropsWithChildren) => <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  const { result, rerender } = renderHook(({ enabled }) => useForkliftMap(enabled), { initialProps: { enabled: false }, wrapper });
  expect(from).not.toHaveBeenCalled();
  expect(result.current.forkliftMap.size).toBe(0);
  expect(result.current.forklifts).toBeUndefined();
  rerender({ enabled: true });
  await waitFor(() => expect(from).toHaveBeenCalledExactlyOnceWith("forklifts"));
  await waitFor(() => expect(result.current.isFetching).toBe(false));
  expect(result.current.forkliftMap.get("unit-1")).toEqual(row);
  rerender({ enabled: false });
  expect(result.current.forkliftMap.size).toBe(0);
  expect(from).toHaveBeenCalledTimes(1);
});
