import { act, fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ORG_ID } from "./readModels.fixture";

const state = vi.hoisted(() => ({ isPending: false, mutate: vi.fn() }));
vi.mock("../hooks/usePlatformOperator", () => ({
  useSetOrganizationActive: () => state,
}));
vi.mock("../hooks/usePlatformAccess", () => ({ usePlatformCapabilities: () => ({ can: () => true }) }));
import { OrganizationStatusAction } from "../components/OrganizationStatusAction";

describe("cambio de acceso empresarial", () => {
  beforeEach(() => {
    state.isPending = false;
    state.mutate.mockReset();
  });

  it("bloquea suspensión propia y exige motivo para otro destino", () => {
    const view = render(
      <OrganizationStatusAction
        id={ORG_ID}
        name="Empresa Norte"
        active
        canSuspend={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Suspender" })).toBeDisabled();
    view.rerender(
      <OrganizationStatusAction id={ORG_ID} name="Empresa Norte" active />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Suspender" }));
    expect(
      screen.getByRole("button", { name: "Suspender empresa" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo del cambio"), {
      target: { value: "sk_test_a" },
    });
    expect(
      screen.getByRole("button", { name: "Suspender empresa" }),
    ).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Motivo del cambio"), {
      target: { value: "  Solicitud de la empresa  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Suspender empresa" }));
    expect(state.mutate).toHaveBeenCalledWith(
      {
        organization_id: ORG_ID,
        active: false,
        reason: "Solicitud de la empresa",
      },
      expect.any(Object),
    );
    // La falta de onSuccess (error) conserva diálogo y motivo para reintentar.
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByLabelText("Motivo del cambio")).toHaveValue(
      "  Solicitud de la empresa  ",
    );
    act(() => state.mutate.mock.calls[0][1].onSuccess());
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("también confirma reactivación y bloquea el cierre durante la petición", () => {
    const view = render(
      <OrganizationStatusAction
        id={ORG_ID}
        name="Empresa Norte"
        active={false}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Reactivar" }));
    fireEvent.change(screen.getByLabelText("Motivo del cambio"), {
      target: { value: "Alta revisada por operador" },
    });
    state.isPending = true;
    view.rerender(
      <OrganizationStatusAction
        id={ORG_ID}
        name="Empresa Norte"
        active={false}
      />,
    );
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Guardando…" })).toBeDisabled();
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "Escape" });
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(state.mutate).not.toHaveBeenCalled();
  });
});
