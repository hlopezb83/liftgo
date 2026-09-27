import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";
import { useQuotes } from "../useQuotes";

const db = vi.hoisted(() => ({ getSession: vi.fn(), from: vi.fn(), result: vi.fn() }));
vi.mock("@/features/auth/recoveryCapture", () => ({}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: {
  auth: { getSession: db.getSession }, from: db.from,
} }));

function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return renderHook(() => useQuotes(), { wrapper: ({ children }: { children: ReactNode }) =>
    <QueryClientProvider client={client}>{children}</QueryClientProvider> });
}

beforeEach(() => {
  vi.clearAllMocks();
  const chain = { select: vi.fn(), or: vi.fn(), order: vi.fn(), limit: vi.fn(), returns: db.result };
  chain.select.mockReturnValue(chain); chain.or.mockReturnValue(chain);
  chain.order.mockReturnValue(chain); chain.limit.mockReturnValue(chain);
  db.from.mockReturnValue(chain);
  db.result.mockResolvedValue({ data: [{ id: "quote", quote_number: "COT-0009" }], error: null });
});

describe("cotizaciones requieren una sesión activa", () => {
  it("una sesión ausente produce error y no un listado vacío de RLS", async () => {
    db.getSession.mockResolvedValue({ data: { session: null }, error: null });
    const { result } = mount();
    await waitFor(() => expect(result.current.isError).toBe(true));
    expect(result.current.error).toMatchObject({ status: 401 });
    expect(result.current.data).toBeUndefined();
    expect(db.from).not.toHaveBeenCalled();
  });

  it("un fallo de verificación tampoco consulta como anónimo", async () => {
    const error = new Error("No se pudo renovar la sesión");
    db.getSession.mockResolvedValue({ data: { session: null }, error });
    const { result } = mount();
    await waitFor(() => expect(result.current.error).toBe(error));
    expect(db.from).not.toHaveBeenCalled();
  });

  it("una sesión válida conserva el listado", async () => {
    db.getSession.mockResolvedValue({ data: { session: { user: { id: "admin" } } }, error: null });
    const { result } = mount();
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data).toEqual([{ id: "quote", quote_number: "COT-0009" }]);
    expect(db.from).toHaveBeenCalledWith("quotes");
  });
});
