import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const reset = vi.hoisted(() => vi.fn().mockResolvedValue({ error: null }));
vi.mock("@/features/auth/recoveryCapture", () => ({}));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { auth: {
  resetPasswordForEmail: reset,
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: vi.fn() } } }),
  getSession: async () => ({ data: { session: null } }),
} } }));
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { detectRecoveryFromHref } from "../recoverySession";
function Request({ platform }: { platform: boolean }) {
  const { resetPassword } = useAuth();
  return <button onClick={() => void resetPassword("operator@example.com", platform ? "platform" : undefined)}>Recuperar</button>;
}
describe("destino explícito del correo de recuperación", () => {
  beforeEach(() => reset.mockClear());
  it.each([[false, "/auth"], [true, "/platform/login"]] as const)("workspace platform=%s", async (platform, path) => {
    render(<AuthProvider><Request platform={platform} /></AuthProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Recuperar" }));
    await waitFor(() => expect(reset).toHaveBeenCalledExactlyOnceWith("operator@example.com", {
      redirectTo: `${window.location.origin}${path}?type=recovery`,
    }));
    expect(detectRecoveryFromHref(reset.mock.calls[0][1].redirectTo)).toBe("pending");
  });
});
