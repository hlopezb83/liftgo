import { renderHook, waitFor } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createQueryWrapper } from "@/test/helpers/queryClient";

const { invokeMock, notifySuccessMock } = vi.hoisted(() => ({
  invokeMock: vi.fn(),
  notifySuccessMock: vi.fn(),
}));

vi.mock("@/lib/supabase/invokeEdgeFunction", () => ({
  invokeEdgeFunction: invokeMock,
}));

vi.mock("@/lib/ui/appFeedback", () => ({
  notifySuccess: notifySuccessMock,
  notifyError: vi.fn(),
}));

import { useInviteUser } from "../userAdminMutations/useInviteUser";

const payload = { email: "nuevo@liftgo.mx", full_name: "Nuevo Usuario", role: "ventas" };

describe("useInviteUser (FIX-R2-02 / N8: recovery_link visible)", () => {
  beforeEach(() => {
    invokeMock.mockReset();
    notifySuccessMock.mockReset();
  });

  it("muestra el enlace de un solo uso cuando la edge lo devuelve", async () => {
    invokeMock.mockResolvedValue({
      success: true,
      user_id: "u1",
      email: payload.email,
      recovery_link: "https://liftgo.lovable.app/recover#token",
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useInviteUser(), { wrapper: Wrapper });

    result.current.mutate(payload);

    await waitFor(() => expect(notifySuccessMock).toHaveBeenCalled());
    const [title, opts] = notifySuccessMock.mock.calls[0] as [string, { description: string; action?: unknown }];
    expect(title).toBe("Usuario creado");
    expect(opts.description).toContain("https://liftgo.lovable.app/recover#token");
    expect(opts.description).toContain(payload.email);
    expect(opts.action).toBeDefined();
  });

  it("orienta a “Restablecer contraseña” cuando no hay enlace", async () => {
    invokeMock.mockResolvedValue({
      success: true,
      user_id: "u2",
      email: payload.email,
      recovery_link: null,
    });
    const { Wrapper } = createQueryWrapper();
    const { result } = renderHook(() => useInviteUser(), { wrapper: Wrapper });

    result.current.mutate(payload);

    await waitFor(() => expect(notifySuccessMock).toHaveBeenCalled());
    const [, opts] = notifySuccessMock.mock.calls[0] as [string, { description: string; action?: unknown }];
    expect(opts.description).toContain("Restablecer contraseña");
    expect(opts.action).toBeUndefined();
  });
});
