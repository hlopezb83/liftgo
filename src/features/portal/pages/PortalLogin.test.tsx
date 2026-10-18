import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ signIn: vi.fn(), resetPassword: vi.fn(), notifyError: vi.fn(), notifySuccess: vi.fn(), navigate: vi.fn() }));
vi.mock("@/contexts/AuthContext", () => ({ useAuth: () => ({ user: null, signIn: mocks.signIn, resetPassword: mocks.resetPassword }) }));
vi.mock("@/hooks/useNavigateTransition", () => ({ useNavigateTransition: () => mocks.navigate }));
vi.mock("@/lib/ui/appFeedback", () => ({ notifyError: mocks.notifyError, notifySuccess: mocks.notifySuccess }));

import PortalLogin from "./PortalLogin";

describe("PortalLogin: fallos de conexión recuperables", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("desbloquea acceso tras excepción y permite reintentar sin aviso duplicado", async () => {
    const error = new Error("Failed to fetch");
    mocks.signIn.mockRejectedValueOnce(error).mockResolvedValueOnce({ error: null });
    render(<PortalLogin />);
    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "demo@example.test" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "password-demo" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar Sesión" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Iniciar Sesión" })).toBeEnabled());
    expect(mocks.notifyError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ error, title: expect.stringMatching(/conexión/i) }));
    fireEvent.click(screen.getByRole("button", { name: "Iniciar Sesión" }));
    await waitFor(() => expect(mocks.signIn).toHaveBeenCalledTimes(2));
    expect(mocks.signIn).toHaveBeenLastCalledWith("demo@example.test", "password-demo");
    expect(mocks.notifyError).toHaveBeenCalledTimes(1);
  });

  it("desbloquea recuperación cuando arroja un fallo sin anunciar envío", async () => {
    const error = new Error("Failed to fetch");
    mocks.resetPassword.mockRejectedValueOnce(error).mockResolvedValueOnce({ error: null });
    render(<PortalLogin />);
    fireEvent.click(screen.getByRole("button", { name: "¿Olvidaste tu contraseña?" }));
    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "demo@example.test" } });
    fireEvent.click(screen.getByRole("button", { name: "Enviar Enlace" }));
    await waitFor(() => expect(screen.getByRole("button", { name: "Enviar Enlace" })).toBeEnabled());
    expect(mocks.notifyError).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({ error }));
    expect(mocks.notifySuccess).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Enviar Enlace" }));
    await waitFor(() => expect(mocks.notifySuccess).toHaveBeenCalledOnce());
    expect(mocks.resetPassword).toHaveBeenLastCalledWith("demo@example.test");
  });

  it("conserva manejo de errores devueltos por el servicio", async () => {
    const error = new Error("Invalid login credentials");
    mocks.signIn.mockResolvedValueOnce({ error });
    render(<PortalLogin />);
    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "demo@example.test" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "password-demo" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar Sesión" }));
    await waitFor(() => expect(mocks.notifyError).toHaveBeenCalledOnce());
    expect(screen.getByRole("button", { name: "Iniciar Sesión" })).toBeEnabled();
  });
});