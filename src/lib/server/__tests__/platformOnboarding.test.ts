import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdminClient } from "../guards/httpError";
import {
  parseOnboardingJob,
  runPlatformOnboarding,
} from "../platformOnboarding.server";

const job = {
  request_id: "89000000-0000-4000-8000-000000000001",
  organization_id: "89000000-0000-4000-8000-000000000002",
  admin_user_id: "89000000-0000-4000-8000-000000000003",
  name: "Centro del Norte",
  slug: "centro-del-norte",
  admin_email: "admin.norte@example.com",
  admin_full_name: "María del Norte",
  created_at: "2026-10-01T00:00:00Z",
  stage: "auth_pending" as const,
};
const user = {
  id: job.admin_user_id,
  email: job.admin_email,
  app_metadata: {
    organization_id: job.organization_id,
    platform_onboarding_request_id: job.request_id,
  },
};
const complete = { ...job, stage: "complete" };
const missing = { data: { user: null }, error: { status: 404 } };
const found = { data: { user }, error: null };
const lookup = vi.fn();
const create = vi.fn();
const rpc = vi.fn();
const link = vi.fn();
const remove = vi.fn();
const admin = {
  rpc,
  auth: {
    admin: {
      getUserById: lookup,
      createUser: create,
      generateLink: link,
      deleteUser: remove,
    },
  },
} as unknown as AdminClient;
const actor = "89000000-0000-4000-8000-000000000004";

describe("alta durable de plataforma", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lookup.mockReset().mockResolvedValue(found);
    create.mockReset().mockResolvedValue(found);
    rpc
      .mockReset()
      .mockImplementation((fn) =>
        Promise.resolve({
          data: fn === "platform_finish_onboarding" ? complete : job,
          error: null,
        }),
      );
    link
      .mockReset()
      .mockResolvedValue({
        data: {
          user,
          properties: { action_link: "https://example.com/access" },
        },
        error: null,
      });
    vi.spyOn(console, "error").mockImplementation(() => {});
  });
  it("crea sólo después de un 404 y utiliza el UUID y metadata reservados", async () => {
    lookup.mockResolvedValueOnce(missing);
    const result = await runPlatformOnboarding(admin, actor, job);
    expect(result.success).toBe(true);
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: job.admin_user_id,
        email: job.admin_email,
        app_metadata: {
          organization_id: job.organization_id,
          platform_onboarding_request_id: job.request_id,
        },
      }),
    );
    expect(rpc).toHaveBeenCalledWith("platform_finish_onboarding", {
      p_actor: actor,
      p_request_id: job.request_id,
    });
    expect(remove).not.toHaveBeenCalled();
  });
  it("reanuda una cuenta ya creada sin cambiar contraseña ni crear otra", async () => {
    expect((await runPlatformOnboarding(admin, actor, job)).success).toBe(true);
    expect(create).not.toHaveBeenCalled();
  });
  it("reconcilia una respuesta perdida o un worker concurrente por UUID", async () => {
    lookup.mockResolvedValueOnce(missing).mockResolvedValueOnce(found);
    create.mockResolvedValue({
      data: { user: null },
      error: { code: "email_exists" },
    });
    expect((await runPlatformOnboarding(admin, actor, job)).success).toBe(true);
    expect(remove).not.toHaveBeenCalled();
  });
  it("un error 503 de consulta no dispara creación", async () => {
    lookup.mockResolvedValue({ data: { user: null }, error: { status: 503 } });
    expect((await runPlatformOnboarding(admin, actor, job)).success).toBe(
      false,
    );
    expect(create).not.toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
  });
  it.each([
    { ...user, id: actor },
    { ...user, email: "another@example.com" },
    {
      ...user,
      app_metadata: {
        ...user.app_metadata,
        platform_onboarding_request_id: actor,
      },
    },
    { ...user, app_metadata: { ...user.app_metadata, organization_id: actor } },
  ])(
    "rechaza identidades que no coincidan con el registro durable",
    async (foreign) => {
      lookup.mockResolvedValue({ data: { user: foreign }, error: null });
      const result = await runPlatformOnboarding(admin, actor, job);
      expect(result).toMatchObject({
        success: false,
        message: expect.stringContaining("requiere revisión"),
      });
      expect(create).not.toHaveBeenCalled();
      expect(link).not.toHaveBeenCalled();
      expect(remove).not.toHaveBeenCalled();
      expect(rpc).not.toHaveBeenCalledWith(
        "platform_finish_onboarding",
        expect.anything(),
      );
    },
  );
  it("no recrea una cuenta eliminada de un alta terminada", async () => {
    lookup.mockResolvedValue(missing);
    expect(
      (await runPlatformOnboarding(admin, actor, { ...job, stage: "complete" }))
        .success,
    ).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
  it("un fallo de vinculación conserva recursos para reanudar", async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { code: "503" } })
      .mockResolvedValueOnce({ data: job, error: null });
    expect((await runPlatformOnboarding(admin, actor, job)).success).toBe(
      false,
    );
    expect(remove).not.toHaveBeenCalled();
    expect(link).not.toHaveBeenCalled();
  });
  it("verifica una finalización confirmada en BD cuya respuesta se perdió", async () => {
    rpc
      .mockResolvedValueOnce({ data: null, error: { code: "503" } })
      .mockResolvedValueOnce({ data: complete, error: null });
    expect(await runPlatformOnboarding(admin, actor, job)).toMatchObject({
      success: true,
      recovery_link: null,
    });
    expect(remove).not.toHaveBeenCalled();
  });
  it("no presenta éxito ante revocación de permisos", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "42501" } });
    await expect(
      runPlatformOnboarding(admin, actor, job),
    ).rejects.toMatchObject({ status: 403 });
    expect(link).not.toHaveBeenCalled();
  });
  it("el enlace es opcional, no revierte el alta y no se divulga el de otra cuenta", async () => {
    link.mockResolvedValue({
      data: {
        user: { id: actor },
        properties: { action_link: "DO_NOT_EXPOSE" },
      },
      error: null,
    });
    expect(await runPlatformOnboarding(admin, actor, job)).toMatchObject({
      success: true,
      recovery_link: null,
    });
    link.mockRejectedValue(new Error("secret"));
    expect(await runPlatformOnboarding(admin, actor, job)).toMatchObject({
      success: true,
      recovery_link: null,
    });
    expect(console.error).not.toHaveBeenCalledWith(
      expect.stringContaining("secret"),
    );
  });
  it("proyecta datos públicos y rechaza estados malformados", () => {
    expect(
      parseOnboardingJob({ ...job, password: "DO_NOT_EXPOSE" }),
    ).not.toHaveProperty("password");
    expect(() =>
      parseOnboardingJob({ ...job, request_id: "invalid" }),
    ).toThrow();
  });
});
