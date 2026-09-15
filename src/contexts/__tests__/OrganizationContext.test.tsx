import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const { useAuthMock, getOrganizationContextMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  getOrganizationContextMock: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: useAuthMock }));
vi.mock("@/lib/organizationContext.functions", () => ({
  getOrganizationContext: getOrganizationContextMock,
}));

import { OrganizationGate, OrganizationProvider } from "../OrganizationContext";

const ORG_A = "0a000000-0000-4000-8000-00000000000a";

function ProtectedChild() {
  return <p>Datos protegidos</p>;
}

function renderGate(children: ReactNode = <ProtectedChild />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <OrganizationProvider>
        <OrganizationGate fallback={<p>Verificando empresa…</p>}>{children}</OrganizationGate>
      </OrganizationProvider>
    </QueryClientProvider>,
  );
}

describe("OrganizationGate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthMock.mockReturnValue({ user: { id: "user-1" }, isLoading: false });
  });

  it("no renderiza datos protegidos mientras la empresa se verifica", async () => {
    let resolve!: (value: unknown) => void;
    getOrganizationContextMock.mockReturnValue(new Promise((r) => { resolve = r; }));

    renderGate();
    expect(screen.getByText("Verificando empresa…")).toBeInTheDocument();
    expect(screen.queryByText("Datos protegidos")).not.toBeInTheDocument();

    resolve({
      context: { status: "ready", organizationId: ORG_A, memberType: "internal", customerId: null },
      errorCode: null,
    });
    await waitFor(() => expect(screen.getByText("Datos protegidos")).toBeInTheDocument());
  });

  it("empresa verificada: muestra el contenido protegido", async () => {
    getOrganizationContextMock.mockResolvedValue({
      context: { status: "ready", organizationId: ORG_A, memberType: "internal", customerId: null },
      errorCode: null,
    });
    renderGate();
    await waitFor(() => expect(screen.getByText("Datos protegidos")).toBeInTheDocument());
  });

  it("error de verificación: estado de error y ningún dato protegido", async () => {
    getOrganizationContextMock.mockResolvedValue({
      context: null,
      errorCode: "membership_read_error",
    });
    renderGate();
    await waitFor(() => expect(screen.getByText("Acceso no disponible")).toBeInTheDocument());
    expect(screen.queryByText("Datos protegidos")).not.toBeInTheDocument();
  });

  it("membresía ausente o ambigua: estado propio, distinto del error", async () => {
    getOrganizationContextMock.mockResolvedValue({
      context: { status: "no_membership", reason: "ambiguous_membership" },
      errorCode: null,
    });
    renderGate();
    await waitFor(() =>
      expect(
        screen.getByText("Tu cuenta tiene asignaciones de empresa inconsistentes."),
      ).toBeInTheDocument()
    );
    expect(screen.queryByText("Datos protegidos")).not.toBeInTheDocument();
  });

  it("sin sesión: no consulta el contexto ni muestra datos protegidos", async () => {
    useAuthMock.mockReturnValue({ user: null, isLoading: false });
    renderGate();
    await waitFor(() => expect(getOrganizationContextMock).not.toHaveBeenCalled());
    expect(screen.queryByText("Datos protegidos")).not.toBeInTheDocument();
  });
});
