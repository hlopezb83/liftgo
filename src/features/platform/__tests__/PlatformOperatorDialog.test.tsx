import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const change = vi.hoisted(() => vi.fn());
vi.mock("@/lib/platformOperators.functions", () => ({ setPlatformOperatorProfileFn: change }));
import { PlatformOperatorDialog } from "../components/PlatformOperatorDialog";
const account = { id: "92000000-0000-4000-8000-000000000002", name: "Soporte", email: "support@example.com", profile: "support" as const, revision: "3", eligible: true };
describe("formulario de acceso de operador", () => {
  beforeEach(() => { change.mockReset(); });
  it("no envía el mismo perfil y requiere motivo y contraseña propios", () => {
    render(<PlatformOperatorDialog account={account} onClose={vi.fn()} onSaved={vi.fn()} />);
    expect(screen.getByRole("button", { name: "Guardar acceso" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Perfil de plataforma"), { target: { value: "observer" } });
    fireEvent.change(screen.getByLabelText("Motivo del cambio"), { target: { value: "Revisión de actividades" } });
    expect(screen.getByRole("button", { name: "Guardar acceso" })).toBeDisabled();
  });
  it("borra la contraseña antes de esperar la respuesta y también tras un error", async () => {
    change.mockRejectedValue(new Error("Contraseña incorrecta"));
    render(<PlatformOperatorDialog account={account} onClose={vi.fn()} onSaved={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Perfil de plataforma"), { target: { value: "observer" } });
    fireEvent.change(screen.getByLabelText("Motivo del cambio"), { target: { value: "Revisión de actividades" } });
    fireEvent.change(screen.getByLabelText("Mi contraseña actual"), { target: { value: "test-confirmation" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar acceso" }));
    expect(screen.getByLabelText("Mi contraseña actual")).toHaveValue("");
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("Contraseña incorrecta"));
    expect(change).toHaveBeenCalledExactlyOnceWith({ data: { userId: account.id, profile: "observer", expectedRevision: "3", reason: "Revisión de actividades", password: "test-confirmation" } });
  });
  it("las cuentas no disponibles sólo permiten retirar el acceso existente", async () => {
    const saved = vi.fn(); change.mockResolvedValue({ changed: true });
    render(<PlatformOperatorDialog account={{ ...account, eligible: false }} onClose={vi.fn()} onSaved={saved} />);
    expect(screen.getByLabelText("Perfil de plataforma")).toHaveValue("revoke");
    expect(screen.queryByRole("option", { name: "Operador raíz" })).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Motivo del cambio"), { target: { value: "Cierre del acceso" } });
    fireEvent.change(screen.getByLabelText("Mi contraseña actual"), { target: { value: "test-confirmation" } });
    fireEvent.click(screen.getByRole("button", { name: "Retirar acceso" }));
    await waitFor(() => expect(saved).toHaveBeenCalledOnce());
    expect(change.mock.calls[0][0].data.profile).toBeNull();
  });
});
