import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import {
  createSupabaseChainMock,
  type SupabaseMockResponse,
} from "@/test/helpers/supabaseChain";
import { createQueryWrapper } from "@/test/helpers/queryClient";

let resp: SupabaseMockResponse = { data: [], error: null };

vi.mock("@/integrations/supabase/client", () => ({
  supabase: createSupabaseChainMock({
    tableResolvers: { audit_logs: () => resp },
  }),
}));

import { useAuditLogs } from "../useAuditLogs";

describe("useAuditLogs — RLS contract (solo admin / auditor)", () => {
  beforeEach(() => {
    resp = { data: [], error: null };
  });

  it("propaga permission denied cuando el rol no tiene acceso", async () => {
    resp = {
      data: null,
      error: { code: "42501", message: "permission denied for table audit_logs" },
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAuditLogs(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isError).toBe(true));
  });

  it("devuelve filas cuando el caller es admin/auditor", async () => {
    resp = {
      data: [{
        id: "a-1",
        table_name: "invoices",
        record_id: "inv-1",
        action: "UPDATE",
        old_data: null,
        new_data: { status: "paid" },
        changed_fields: ["status"],
        user_id: null,
        created_at: "2026-06-01T00:00:00Z",
      }],
      error: null,
    };
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useAuditLogs(), { wrapper: Wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.data?.[0]).toMatchObject({ table_name: "invoices" });
  });
});
