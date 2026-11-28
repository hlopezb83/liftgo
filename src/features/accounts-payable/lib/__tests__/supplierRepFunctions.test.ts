import { describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  requireRole: vi.fn(),
  enforceRateLimit: vi.fn(),
  loadPaymentAndBill: vi.fn(),
  assertRepUuidNotDuplicated: vi.fn(),
  markRepReceived: vi.fn(),
  recordRepActivity: vi.fn(),
  uploadRepFiles: vi.fn(),
}));

vi.mock("@tanstack/react-start", () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      validator: (fn: (d: unknown) => unknown) => {
        void fn({});
        return builder;
      },
      handler: (fn: unknown) => fn,
    };
    return builder;
  },
}));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("@/lib/server/adminGuards.server", () => ({
  HttpError: class HttpError extends Error {
    constructor(public status: number, message: string) {
      super(message);
    }
  },
  isUUID: (v: unknown) => typeof v === "string" && v.length > 10,
  requireRole: state.requireRole,
  enforceRateLimit: state.enforceRateLimit,
}));
vi.mock("../../server/supplierRep.data.server", () => ({
  loadPaymentAndBill: state.loadPaymentAndBill,
  assertRepUuidNotDuplicated: state.assertRepUuidNotDuplicated,
  markRepReceived: state.markRepReceived,
  recordRepActivity: state.recordRepActivity,
}));
vi.mock("../../server/supplierRep.storage.server", () => ({
  uploadRepFiles: state.uploadRepFiles,
}));

import { validateSupplierRepFn } from "../supplierRep.functions";

type Handler = (args: { data: unknown; context: { userId: string; supabase: { rpc: () => Promise<unknown> } } }) => Promise<unknown>;

describe("validateSupplierRepFn", () => {
  it("rechaza cuando no puede resolver la organización activa", async () => {
    state.requireRole.mockResolvedValueOnce({ admin: {} });
    await expect(
      (validateSupplierRepFn as unknown as Handler)({
        data: {},
        context: {
          userId: "user-1",
          supabase: { rpc: async () => ({ data: null, error: { message: "none" } }) },
        },
      }),
    ).rejects.toThrow("No se pudo resolver la organización activa");
  });
});
