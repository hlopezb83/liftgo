/**
 * Tramo 2 multiempresa: la caché (memoria y disco) queda separada por
 * identidad verificada y nunca se restaura antes de resolverla.
 */
import { dehydrate, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { useAuthMock, useOrgMock } = vi.hoisted(() => ({
  useAuthMock: vi.fn(),
  useOrgMock: vi.fn(),
}));

vi.mock("@/contexts/AuthContext", () => ({ useAuth: useAuthMock }));
vi.mock("@/contexts/OrganizationContext", () => ({ useOrganizationContext: useOrgMock }));

import { IdentityScopedPersistence } from "../IdentityScopedPersistence";
import {
  buildIdentityScope,
  isForeignPersistedCacheKey,
  persistedCacheKey,
} from "../identityScope";
import { purgeForeignPersistedCaches, shouldPersistQuery } from "../persister";
import type { Query } from "@tanstack/react-query";

const ORG_A = "0a000000-0000-4000-8000-00000000000a";
const ORG_B = "0b000000-0000-4000-8000-00000000000b";
const USER_A = "user-a";
const USER_B = "user-b";

const scopeA = buildIdentityScope({
  userId: USER_A,
  organizationId: ORG_A,
  memberType: "internal",
})!;
const scopeB = buildIdentityScope({
  userId: USER_B,
  organizationId: ORG_B,
  memberType: "internal",
})!;

function setIdentity(user: string | null, organizationId?: string) {
  useAuthMock.mockReturnValue({ user: user ? { id: user } : null, isLoading: false });
  useOrgMock.mockReturnValue(
    organizationId
      ? { status: "ready", organizationId, memberType: "internal", customerId: null }
      : { status: "loading" },
  );
}

function renderTree(queryClient: QueryClient) {
  return render(
    <QueryClientProvider client={queryClient}>
      <IdentityScopedPersistence>
        <p>Contenido protegido</p>
      </IdentityScopedPersistence>
    </QueryClientProvider>,
  );
}

describe("identidad de caché", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("la clave de caché distingue usuario y organización", () => {
    expect(scopeA).not.toBe(scopeB);
    expect(
      buildIdentityScope({ userId: USER_A, organizationId: ORG_A, memberType: "internal" }),
    ).not.toBe(
      buildIdentityScope({ userId: USER_A, organizationId: ORG_B, memberType: "internal" }),
    );
    expect(buildIdentityScope(null)).toBeNull();
  });

  it("purga la caché global anterior y la de otras identidades", () => {
    window.localStorage.setItem("liftgo:rq-cache:v3", "global");
    window.localStorage.setItem(persistedCacheKey(scopeB), "ajena");
    window.localStorage.setItem(persistedCacheKey(scopeA), "propia");
    window.localStorage.setItem("otra-cosa", "intacta");

    purgeForeignPersistedCaches(window.localStorage, scopeA);

    expect(window.localStorage.getItem("liftgo:rq-cache:v3")).toBeNull();
    expect(window.localStorage.getItem(persistedCacheKey(scopeB))).toBeNull();
    expect(window.localStorage.getItem(persistedCacheKey(scopeA))).toBe("propia");
    expect(window.localStorage.getItem("otra-cosa")).toBe("intacta");
  });

  it("sin identidad verificada se purga todo lo persistido", () => {
    window.localStorage.setItem(persistedCacheKey(scopeA), "propia");
    purgeForeignPersistedCaches(window.localStorage, null);
    expect(window.localStorage.getItem(persistedCacheKey(scopeA))).toBeNull();
    expect(isForeignPersistedCacheKey(persistedCacheKey(scopeA), null)).toBe(true);
  });

  it("no restaura ni muestra datos protegidos antes de resolver la organización", async () => {
    setIdentity(USER_A); // sesión sí, organización aún no
    const qc = new QueryClient();
    qc.setQueryData(["forklifts", "list"], [{ id: "f1" }]);

    renderTree(qc);

    await waitFor(() => expect(qc.getQueryData(["forklifts", "list"])).toBeUndefined());
    expect(window.localStorage.getItem(persistedCacheKey(scopeA))).toBeNull();
  });

  it("al cambiar de identidad limpia la caché anterior antes de renderizar", async () => {
    setIdentity(USER_A, ORG_A);
    const qc = new QueryClient();
    const { rerender } = renderTree(qc);
    await waitFor(() => expect(screen.getByText("Contenido protegido")).toBeInTheDocument());

    qc.setQueryData(["forklifts", "list"], [{ id: "de-la-empresa-A" }]);

    // Cambio de sesión en la misma pestaña.
    setIdentity(USER_B, ORG_B);
    rerender(
      <QueryClientProvider client={qc}>
        <IdentityScopedPersistence>
          <p>Contenido protegido</p>
        </IdentityScopedPersistence>
      </QueryClientProvider>,
    );

    expect(qc.getQueryData(["forklifts", "list"])).toBeUndefined();
    expect(screen.queryByText("Contenido protegido")).not.toBeInTheDocument();
    await waitFor(() => expect(screen.getByText("Contenido protegido")).toBeInTheDocument());
    expect(qc.getQueryData(["forklifts", "list"])).toBeUndefined();
  });

  it("restaura sólo catálogos de la identidad verificada desde el SDK real", async () => {
    setIdentity(USER_A, ORG_A);
    const previous = new QueryClient();
    previous.setQueryData(["forklifts", "list"], [{ id: "allowed" }]);
    previous.setQueryData(["customers", "list"], [{ id: "private" }]);
    window.localStorage.setItem(persistedCacheKey(scopeA), JSON.stringify({
      timestamp: Date.now(),
      buster: scopeA,
      clientState: dehydrate(previous, { shouldDehydrateQuery: shouldPersistQuery }),
    }));
    const qc = new QueryClient();
    renderTree(qc);
    await waitFor(() => expect(screen.getByText("Contenido protegido")).toBeInTheDocument());
    expect(qc.getQueryData(["forklifts", "list"])).toEqual([{ id: "allowed" }]);
    expect(qc.getQueryData(["customers", "list"])).toBeUndefined();
    previous.clear();
  });

  it("una caché corrupta no bloquea el contenido protegido", async () => {
    setIdentity(USER_A, ORG_A);
    window.localStorage.setItem(persistedCacheKey(scopeA), "{invalid-json");
    const qc = new QueryClient();
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      renderTree(qc);
      await waitFor(() => expect(screen.getByText("Contenido protegido")).toBeInTheDocument());
      expect(window.localStorage.getItem(persistedCacheKey(scopeA))).toBeNull();
      expect(qc.getQueryCache().getAll()).toHaveLength(0);
    } finally {
      error.mockRestore();
      warn.mockRestore();
    }
  });

  it("almacenamiento bloqueado permite continuar sin restaurar otra identidad", async () => {
    setIdentity(USER_A, ORG_A);
    window.localStorage.setItem(persistedCacheKey(scopeB), "foreign-cache");
    const qc = new QueryClient();
    const get = vi.spyOn(window.localStorage, "getItem").mockImplementation(() => {
      throw new DOMException("Storage disabled", "SecurityError");
    });
    const remove = vi.spyOn(window.localStorage, "removeItem").mockImplementation(() => {
      throw new DOMException("Storage disabled", "SecurityError");
    });
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      renderTree(qc);
      await waitFor(() => expect(screen.getByText("Contenido protegido")).toBeInTheDocument());
      expect(qc.getQueryCache().getAll()).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith("Query cache restoration unavailable; using memory only.");
    } finally {
      get.mockRestore();
      remove.mockRestore();
      error.mockRestore();
      warn.mockRestore();
    }
  });

  it("acceso denegado a localStorage no bloquea el contenido protegido", async () => {
    setIdentity(USER_A, ORG_A);
    const qc = new QueryClient();
    const storage = vi.spyOn(window, "localStorage", "get").mockImplementation(() => {
      throw new DOMException("Storage access disabled", "SecurityError");
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    try {
      renderTree(qc);
      await waitFor(() => expect(screen.getByText("Contenido protegido")).toBeInTheDocument());
      expect(qc.getQueryCache().getAll()).toHaveLength(0);
      expect(warn).toHaveBeenCalledWith("Query cache storage unavailable; using memory only.");
    } finally {
      storage.mockRestore();
      warn.mockRestore();
    }
  });

  it("desmontar antes de restaurar no borra ni restaura caché tardíamente", async () => {
    setIdentity(USER_A, ORG_A);
    const qc = new QueryClient();
    const { unmount } = renderTree(qc);
    unmount();
    qc.setQueryData(["forklifts", "new-owner"], ["new-cache"]);
    await Promise.resolve();
    await Promise.resolve();
    expect(qc.getQueryData(["forklifts", "new-owner"])).toEqual(["new-cache"]);
  });

  it("una respuesta tardía de la sesión anterior no vuelve a la caché", async () => {
    setIdentity(USER_A, ORG_A);
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    let resolveLate!: (value: unknown) => void;
    const late = new Promise((r) => { resolveLate = r; });

    const { rerender } = renderTree(qc);
    await waitFor(() => expect(screen.getByText("Contenido protegido")).toBeInTheDocument());

    const inFlight = qc.fetchQuery({
      queryKey: ["forklifts", "list"],
      queryFn: () => late,
    }).catch(() => undefined);

    setIdentity(USER_B, ORG_B);
    rerender(
      <QueryClientProvider client={qc}>
        <IdentityScopedPersistence>
          <p>Contenido protegido</p>
        </IdentityScopedPersistence>
      </QueryClientProvider>,
    );

    resolveLate([{ id: "dato-tardio-de-A" }]);
    await inFlight;
    await waitFor(() => expect(screen.getByText("Contenido protegido")).toBeInTheDocument());

    expect(qc.getQueryData(["forklifts", "list"])).toBeUndefined();
  });

  it("no persiste secretos, sesiones ni datos financieros", () => {
    const make = (root: string) =>
      ({ queryKey: [root], state: { status: "success" } } as unknown as Query);
    for (const root of [
      "billing_secrets_status",
      "session",
      "user_roles",
      "portal",
      "dashboard-stats",
      "income_statement",
      "contracts",
    ]) {
      expect(shouldPersistQuery(make(root))).toBe(false);
    }
    expect(shouldPersistQuery(make("forklifts"))).toBe(true);
  });
});
