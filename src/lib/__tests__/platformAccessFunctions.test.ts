import { describe, expect, it, vi } from "vitest";
vi.mock("@tanstack/react-start", () => ({ createServerFn: () => {
  const builder = { middleware: () => builder, handler: (fn: unknown) => fn };
  return builder;
} }));
vi.mock("@/integrations/supabase/auth-middleware", () => ({ requireSupabaseAuth: {} }));
vi.mock("../server/adminGuards.server", () => ({
  asUntypedRpc: (client: unknown) => client,
  HttpError: class extends Error {
    constructor(public status: number, message: string) { super(message); }
  },
}));
import { getPlatformAccessFn } from "../platformAccess.functions";
import { platformAccessSchema } from "../platformAccess.types";

type AccessHandler = (args: { context: { supabase: object } }) => Promise<unknown>;
const access = {
  isOperator: true, profile: "root", revision: "3",
  capabilities: ["organizations.read", "integrations.read"],
};
async function read(data: unknown, error: unknown = null) {
  const rpc = vi.fn().mockResolvedValue({ data, error });
  const result = await (getPlatformAccessFn as unknown as AccessHandler)({ context: { supabase: { rpc } } });
  expect(rpc).toHaveBeenCalledExactlyOnceWith("get_platform_access");
  return result;
}

describe("platform access RPC response compatibility", () => {
  it("keeps the current access and permissions without widening them", async () => {
    await expect(read(access)).resolves.toEqual(access);
  });
  it("ignores a future permission without denying the existing operator", async () => {
    await expect(read({ ...access, capabilities: [...access.capabilities, "integrations.future"] })).resolves.toEqual(access);
  });
  it("never converts unknown permissions into an existing permission", async () => {
    await expect(read({ ...access, capabilities: ["billing.manage"] })).resolves.toEqual({ ...access, capabilities: [] });
  });
  it("keeps the public access contract strict", () => {
    expect(platformAccessSchema.safeParse({ ...access, capabilities: ["billing.manage"] }).success).toBe(false);
  });
  it("keeps the non-operator response", async () => {
    const denied = { isOperator: false, profile: null, revision: null, capabilities: [] };
    await expect(read(denied)).resolves.toEqual(denied);
  });
  it("rejects permissions attached to a non-operator before filtering them", async () => {
    await expect(read({ isOperator: false, profile: null, revision: null, capabilities: ["billing.manage"] })).rejects.toMatchObject({ status: 503 });
  });
  it.each([
    { profile: "superadmin" }, { revision: "0" }, { revision: 3 },
    { capabilities: null }, { capabilities: [123] }, { capabilities: "organizations.read" },
    { capabilities: ["all"] }, { capabilities: ["billing." + "a".repeat(100)] },
    { isOperator: "true" }, { profile: null }, { revision: null },
  ])("keeps malformed metadata fail-closed: %j", async (invalid) => {
    await expect(read({ ...access, ...invalid })).rejects.toMatchObject({ status: 503 });
  });
  it("never hides an RPC error behind an otherwise valid response", async () => {
    await expect(read(access, { message: "database unavailable" })).rejects.toMatchObject({ status: 503 });
  });
});
