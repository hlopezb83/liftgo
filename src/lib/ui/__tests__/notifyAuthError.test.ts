import { describe, it, expect, vi } from "vitest";

const sonner = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn(), promise: vi.fn(), dismiss: vi.fn() }));
vi.mock("sonner", () => ({ toast: sonner }));
vi.mock("@/lib/ui/errorDetailsStore", () => ({ openErrorReport: vi.fn(), closeErrorReport: vi.fn() }));
vi.mock("@/lib/ui/errorReport", () => ({ buildErrorReport: vi.fn((input) => ({ ...input, requestId: "report" })) }));

import { notifyAuthError } from "@/lib/ui/appFeedback";

describe("notifyAuthError", () => {
  it("contraseña incorrecta muestra el motivo en español", () => {
    notifyAuthError({ error: new Error("Invalid login credentials") });
    expect(sonner.warning).toHaveBeenCalledWith("No pudimos iniciar sesión", expect.objectContaining({
      description: "Correo o contraseña incorrectos.",
    }));
  });
});
