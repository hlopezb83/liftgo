import { QueryClient } from "@tanstack/react-query";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReactNode } from "react";

const router = vi.hoisted(() => ({
  matches: [] as Array<{ routeId: string }>,
  selectionsWithoutAt: 0,
}));

vi.mock("@tanstack/react-router", () => ({
  useRouterState: ({ select }: { select: (state: { matches: Array<{ routeId: string }> }) => boolean }) => {
    if (typeof Array.prototype.at === "undefined") router.selectionsWithoutAt++;
    return select({ matches: router.matches });
  },
}));
vi.mock("next-themes", () => ({ ThemeProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@tanstack/react-query-devtools", () => ({ ReactQueryDevtools: () => null }));
vi.mock("@/contexts/AuthContext", () => ({ AuthProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/lib/ui/AuthQueryCacheSync", () => ({ AuthQueryCacheSync: () => null }));
vi.mock("@/components/ui/tooltip", () => ({ TooltipProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("@/components/ui/sonner", () => ({ Toaster: () => null }));
vi.mock("@/components/ui/ErrorDetailsDialog", () => ({ ErrorDetailsDialog: () => null }));
vi.mock("@/app-routes/RouteSkeletons", () => ({ PageFallback: () => <p>Cargando</p> }));
vi.mock("@/components/feedback/ConfirmProvider", () => ({ ConfirmProvider: ({ children }: { children: ReactNode }) => children }));
vi.mock("../WorkspaceProviders", () => ({
  WorkspaceProviders: ({ children }: { children: ReactNode }) => <section data-testid="workspace">{children}</section>,
}));

import { AppProviders } from "../AppProviders";

afterEach(cleanup);

describe("arranque de AppProviders sin Array.at", () => {
  it.each([
    { name: "ruta de acceso", routes: ["/auth"], workspace: false },
    { name: "acceso como última coincidencia", routes: ["__root__", "/auth"], workspace: false },
    { name: "ruta de empresa", routes: ["__root__", "/_main", "/_main/"], workspace: true },
    { name: "ruta de plataforma", routes: ["__root__", "/platform"], workspace: true },
    { name: "acceso anterior a otra ruta", routes: ["/auth", "/_main/"], workspace: true },
    { name: "lista de rutas vacía", routes: [], workspace: true },
  ])("conserva los proveedores para $name", async ({ routes, workspace }) => {
    router.matches = routes.map((routeId) => ({ routeId }));
    router.selectionsWithoutAt = 0;
    const descriptor = Object.getOwnPropertyDescriptor(Array.prototype, "at");

    // Exercise the real component and its selector, not a copied expression.
    // Restore before asynchronous assertions so the runner and other tests
    // retain their original platform even when the initial render throws.
    try {
      Object.defineProperty(Array.prototype, "at", { configurable: true, writable: true, value: undefined });
      render(<AppProviders queryClient={new QueryClient()}><p>Contenido de la ruta</p></AppProviders>);
    } finally {
      if (descriptor) Object.defineProperty(Array.prototype, "at", descriptor);
      else Reflect.deleteProperty(Array.prototype, "at");
    }

    expect(router.selectionsWithoutAt).toBeGreaterThan(0);
    expect(Object.getOwnPropertyDescriptor(Array.prototype, "at")).toEqual(descriptor);
    expect(await screen.findByText("Contenido de la ruta")).toBeInTheDocument();
    if (workspace) expect(screen.getByTestId("workspace")).toContainElement(screen.getByText("Contenido de la ruta"));
    else expect(screen.queryByTestId("workspace")).not.toBeInTheDocument();
  });
});
