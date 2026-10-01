import { fireEvent, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { auditEvent, ORG_ID } from "./readModels.fixture";

const state = vi.hoisted(() => ({
  params: new URLSearchParams(),
  audit: vi.fn(),
  refetch: vi.fn(),
}));
vi.mock("@/lib/router-compat", () => ({
  useSearchParams: () => [state.params, vi.fn()],
}));
vi.mock("../hooks/usePlatformOperator", () => ({
  usePlatformOrganizations: () => ({
    data: [],
    isPending: false,
    isError: false,
  }),
}));
vi.mock("../hooks/usePlatformReadModels", () => ({
  usePlatformAudit: (...args: unknown[]) => state.audit(...args),
}));
vi.mock("../components/PlatformAuditEventList", () => ({
  PlatformAuditEventList: () => <p>Lista de eventos</p>,
}));
vi.mock("../components/PlatformAuditEventDialog", () => ({
  PlatformAuditEventDialog: () => null,
}));
import PlatformAuditPage from "../pages/PlatformAuditPage";

describe("filtros y paginación de bitácora", () => {
  beforeEach(() => {
    state.params = new URLSearchParams();
    state.refetch.mockReset();
    state.audit
      .mockReset()
      .mockReturnValue({
        data: { events: [auditEvent()], has_more: true },
        isSuccess: true,
        isFetching: false,
        isError: false,
        isPending: false,
        refetch: state.refetch,
      });
  });

  it.each(["organization=invalid", "target=billing_secrets"])(
    "no amplía consultas ante filtro inválido %s",
    (filter) => {
      state.params = new URLSearchParams(filter);
      render(<PlatformAuditPage />);
      expect(state.audit.mock.lastCall?.[1]).toBe(false);
      expect(screen.getByRole("alert")).toHaveTextContent(
        "El filtro solicitado no es válido",
      );
      expect(screen.getByRole("button", { name: "Actualizar" })).toBeDisabled();
      expect(screen.queryByText("Lista de eventos")).not.toBeInTheDocument();
    },
  );

  it("conserva precisión del cursor y vuelve a primera página al cambiar filtros", () => {
    const view = render(<PlatformAuditPage />);
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(state.audit.mock.lastCall?.[0].before_id).toBe("9007199254740993");
    expect(screen.getByText(/Página 2/)).toBeInTheDocument();
    state.params = new URLSearchParams({ organization: ORG_ID });
    view.rerender(<PlatformAuditPage />);
    expect(state.audit.mock.lastCall?.[0]).toMatchObject({
      organization_id: ORG_ID,
      before_id: undefined,
    });
    expect(screen.getByText(/Página 1/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
  });

  it("un fallo no se presenta como lista vacía", () => {
    state.audit.mockReturnValue({
      isSuccess: false,
      isError: true,
      isFetching: false,
      isPending: false,
      refetch: state.refetch,
    });
    render(<PlatformAuditPage />);
    expect(screen.queryByText("Lista de eventos")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
    expect(state.refetch).toHaveBeenCalledOnce();
  });
});
