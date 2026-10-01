import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  isPending: false,
  mutateAsync: vi.fn(),
  reset: vi.fn(),
}));
vi.mock("../hooks/usePlatformOnboarding", () => ({
  useCreateOrganization: () => state,
}));
import { CreateOrganizationDialog } from "../components/PlatformOrganizationDialogs";

function fillForm() {
  fireEvent.change(screen.getByLabelText("Nombre de la empresa"), {
    target: { value: "Centro del Norte" },
  });
  fireEvent.change(screen.getByLabelText("Nombre del primer administrador"), {
    target: { value: "María del Norte" },
  });
  fireEvent.change(screen.getByLabelText("Correo del primer administrador"), {
    target: { value: "norte@example.com" },
  });
}

describe("formulario de alta reanudable", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.isPending = false;
  });
  it("conserva clave y payload después de un error de red y los campos quedan protegidos", async () => {
    state.mutateAsync.mockRejectedValue(new Error("network"));
    const done = vi.fn();
    render(
      <CreateOrganizationDialog open onOpenChange={vi.fn()} onCreated={done} />,
    );
    fillForm();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Crear empresa" }));
    });
    const first = state.mutateAsync.mock.calls[0][0];
    expect(first).toMatchObject({
      name: "Centro del Norte",
      slug: "centro-del-norte",
      admin_email: "norte@example.com",
    });
    expect(first.request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(screen.getByLabelText("Nombre de la empresa")).toBeDisabled();
    expect(screen.getByRole("status")).toHaveTextContent(
      "No se confirmó el resultado",
    );
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Reintentar alta" }));
    });
    expect(state.mutateAsync.mock.calls[1][0]).toEqual(first);
    expect(done).not.toHaveBeenCalled();
  });
  it("un estado pendiente se explica y permite cerrar para retomarlo después", async () => {
    state.mutateAsync.mockResolvedValue({
      success: false,
      message: "El alta quedó guardada.",
    });
    const closed = vi.fn();
    const done = vi.fn();
    render(
      <CreateOrganizationDialog open onOpenChange={closed} onCreated={done} />,
    );
    fillForm();
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Crear empresa" }));
    });
    expect(screen.getByRole("status")).toHaveTextContent(
      "El alta quedó guardada",
    );
    expect(closed).not.toHaveBeenCalled();
    expect(done).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar formulario" }));
    expect(closed).toHaveBeenCalledWith(false);
  });
  it("bloquea cierre y segundo envío durante una petición", async () => {
    state.isPending = true;
    render(
      <CreateOrganizationDialog
        open
        onOpenChange={vi.fn()}
        onCreated={vi.fn()}
      />,
    );
    expect(
      screen.getByRole("button", { name: "Cerrar formulario" }),
    ).toBeDisabled();
    expect(screen.getByRole("button", { name: "Verificando…" })).toBeDisabled();
  });
});
