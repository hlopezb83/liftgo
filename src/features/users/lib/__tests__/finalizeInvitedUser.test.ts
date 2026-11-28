import { describe, expect, it, vi } from "vitest";
import { finalizeInvitedUser } from "../userAdmin.helpers";

class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

function makeAdmin(provisionError: { message: string } | null) {
  const rpc = vi.fn(async (name: string) =>
    name === "provision_invited_internal_user" ? { error: provisionError } : { error: null }
  );
  const deleteUser = vi.fn(async () => ({ error: null }));
  return { rpc, auth: { admin: { deleteUser } } };
}

const data = { email: "m@x.test", full_name: "M", role: "ventas" } as never;
const g = { HttpError } as never;

describe("finalizeInvitedUser (0057)", () => {
  it("aprovisiona en una sola RPC con caller y empresa", async () => {
    const admin = makeAdmin(null);
    await finalizeInvitedUser(g, admin as never, "u1", data, "org1", "caller1");
    expect(admin.rpc).toHaveBeenCalledTimes(1);
    expect(admin.rpc).toHaveBeenCalledWith("provision_invited_internal_user", expect.objectContaining({
      p_caller_id: "caller1", p_user_id: "u1", p_organization_id: "org1", p_role: "ventas",
    }));
    expect(admin.auth.admin.deleteUser).not.toHaveBeenCalled();
  });

  it("ante fallo limpia filas con contexto y luego borra la cuenta", async () => {
    const admin = makeAdmin({ message: "boom" });
    await expect(finalizeInvitedUser(g, admin as never, "u1", data, "org1", "caller1"))
      .rejects.toMatchObject({ status: 500 });
    expect(admin.rpc).toHaveBeenNthCalledWith(2, "discard_invited_internal_user", {
      p_user_id: "u1", p_organization_id: "org1",
    });
    expect(admin.auth.admin.deleteUser).toHaveBeenCalledWith("u1");
  });
});
