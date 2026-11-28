import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { PlatformOperatorDialog } from "../components/PlatformOperatorDialog";

const change = vi.hoisted(() => vi.fn());
vi.mock("../lib/platformOperators.functions", () => ({ setPlatformOperatorProfileFn: change }));

const account = { id: "92000000-0000-4000-8000-000000000002", name: "Soporte", email: "support@example.com", profile: "support" as const, revision: "3", eligible: true };

function renderDialog(props: React.ComponentProps<typeof PlatformOperatorDialog>) {
  const cache = new QueryClient();
  render(<QueryClientProvider client={cache}><PlatformOperatorDialog {...props} /></QueryClientProvider>);
  return cache;
}

describe("formulario de acceso de operador", () => {
  beforeEach(() => { change.mockReset(); });
  it("no envía el mismo perfil y requiere motivo y contraseña propios", () => {
    const cache = renderDialog({ account, onClose: vi.fn(), onSaved: vi.fn() });
    expect(screen.getByRole("button", { name: "Guardar acceso" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Perfil de plataforma"), { target: { value: "observer" } });
    fireEvent.change(screen.getByLabelText("Motivo del cambio"), { target: { value: "Revisión de actividades" } });
    expect(screen.getByRole("button", { name: "Guardar acceso" })).toBeDisabled();
    cache.clear();
  });
  it("borra la contraseña antes de esperar la respuesta, no usa MutationCache y también limpia tras error", async () => {
    change.mockRejectedValue(new Error("Contraseña incorrecta"));
    const cache = renderDialog({ account, onClose: vi.fn(), onSaved: vi.fn() });
    fireEvent.change(screen.getByLabelText("Perfil de plataforma"), { target: { value: "observer" } });
    fireEvent.change(screen.getByLabelText("Motivo del cambio"), { target: { value: "Revisión de actividades" } });
    fireEvent.change(screen.getByLabelText("Mi contraseña actual"), { target: { value: "test-confirmation" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar acceso" }));
    expect(screen.getByLabelText("Mi contraseña actual")).toHaveValue("");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Contraseña incorrecta"));
    expect(change).toHaveBeenCalledExactlyOnceWith({ data: { userId: account.id, profile: "observer", expectedRevision: "3", reason: "Revisión de actividades", password: "test-confirmation" } });
    expect(cache.getMutationCache().getAll()).toHaveLength(0);
    cache.clear();
  });
  it("las cuentas no disponibles sólo permiten retirar el acceso existente", async () => {
    const saved = vi.fn(); change.mockResolvedValue({ changed: true });
    const cache = renderDialog({ account: { ...account, eligible: false }, onClose: vi.fn(), onSaved: saved });
    expect(screen.getByLabelText("Perfil de plataforma")).toHaveValue("revoke");
    expect(screen.queryByRole("option", { name: "Operador raíz" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Motivo del cambio"), { target: { value: "Cierre del acceso" } });
    fireEvent.change(screen.getByLabelText("Mi contraseña actual"), { target: { value: "test-confirmation" } });
    fireEvent.click(screen.getByRole("button", { name: "Retirar acceso" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(change.mock.calls[0][0].data.profile).toBeNull();
    expect(cache.getMutationCache().getAll()).toHaveLength(0);
    cache.clear();
  });
});
