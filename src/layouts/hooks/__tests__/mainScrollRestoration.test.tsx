// @vitest-environment happy-dom
import { act, render, waitFor } from "@testing-library/react";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { useRef } from "react";
import { beforeEach, describe, expect, it } from "vitest";
import { useMainScrollRestoration } from "@/layouts/hooks/useMainScrollRestoration";
import { SCROLL_TO_TOP_SELECTORS } from "@/lib/routerScroll";
import { parseSearch, stringifySearch } from "@/lib/searchSerialization";

/**
 * TS-04 (navegación NUEVA): con el <main> persistente de MainLayout, la
 * restauración nativa de router-core hereda la posición de la entrada previa
 * en un PUSH y sobrescribe el reset del hook. La opción
 * `scrollToTopSelectors` de producción es la que evita esa herencia.
 *
 * La prueba usa el hook REAL, el router REAL y `scrollRestoration: true`.
 */

function Shell() {
  const mainRef = useRef<HTMLElement>(null);
  useMainScrollRestoration(mainRef);
  return (
    <div>
      <main ref={mainRef} id="main-content" style={{ overflow: "auto" }}>
        <Outlet />
      </main>
    </div>
  );
}

function buildRouter(opts: { scrollToTopSelectors?: string[] }) {
  const rootRoute = createRootRoute({ component: Shell });
  const routes = [
    createRoute({ getParentRoute: () => rootRoute, path: "/", component: () => <p>inicio</p> }),
    createRoute({ getParentRoute: () => rootRoute, path: "/invoices", component: () => <p>facturas</p> }),
    createRoute({ getParentRoute: () => rootRoute, path: "/bookings", component: () => <p>rentas</p> }),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ] as any[];
  return createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: ["/"] }),
    scrollRestoration: true,
    defaultPendingMinMs: 0,
    parseSearch,
    stringifySearch,
    ...(opts.scrollToTopSelectors ? { scrollToTopSelectors: opts.scrollToTopSelectors } : {}),
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
  } as any);
}

function mainEl(): HTMLElement {
  const el = document.querySelector<HTMLElement>("#main-content");
  if (!el) throw new Error("falta el contenedor #main-content");
  // happy-dom no implementa scrollTo sobre elementos: lo emulamos para que el
  // reset de router-core sea observable en scrollTop.
  if (!(el as { __patched?: boolean }).__patched) {
    Object.assign(el, { __patched: true });
    el.scrollTo = ((o: { top?: number }) => {
      el.scrollTop = o?.top ?? 0;
    }) as HTMLElement["scrollTo"];
  }
  return el;
}

/** Simula que el usuario desplaza el contenedor (el router lo rastrea). */
function scrollMainTo(top: number) {
  const el = mainEl();
  el.scrollTop = top;
  act(() => {
    el.dispatchEvent(new Event("scroll", { bubbles: true }));
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function go(router: any, to: string) {
  await act(async () => {
    await router.navigate({ to });
  });
  await waitFor(() => expect(router.state.location.pathname).toBe(to));
}

async function mount(scrollToTopSelectors?: string[]) {
  const router = buildRouter({ scrollToTopSelectors });
  render(<RouterProvider router={router as never} />);
  await waitFor(() => mainEl());
  return router;
}

describe("TS-04 · scroll efectivo del <main> persistente", () => {
  beforeEach(() => {
    sessionStorage.clear();
    document.body.innerHTML = "";
  });

  it("una navegación NUEVA arranca en 0 con la opción de producción", async () => {
    const router = await mount([...SCROLL_TO_TOP_SELECTORS]);

    await go(router, "/invoices");
    scrollMainTo(600);
    await go(router, "/bookings");
    scrollMainTo(200);

    await go(router, "/invoices"); // PUSH: entrada nueva a la misma URL
    expect(mainEl().scrollTop).toBe(0);
  });

  it("sin la opción, el PUSH hereda la posición de la entrada anterior", async () => {
    const router = await mount(undefined);

    await go(router, "/invoices");
    scrollMainTo(600);
    await go(router, "/bookings");
    scrollMainTo(200);

    await go(router, "/invoices");
    expect(mainEl().scrollTop).toBe(200);
  });

  it("atrás y adelante conservan la posición propia de cada entrada", async () => {
    const router = await mount([...SCROLL_TO_TOP_SELECTORS]);

    await go(router, "/invoices");
    scrollMainTo(600);
    await go(router, "/bookings");
    scrollMainTo(200);
    await go(router, "/invoices");
    scrollMainTo(50);

    await act(async () => {
      router.history.back();
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/bookings"));
    await waitFor(() => expect(mainEl().scrollTop).toBe(200));

    await act(async () => {
      router.history.back();
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/invoices"));
    await waitFor(() => expect(mainEl().scrollTop).toBe(600));

    await act(async () => {
      router.history.forward();
    });
    await waitFor(() => expect(router.state.location.pathname).toBe("/bookings"));
    await waitFor(() => expect(mainEl().scrollTop).toBe(200));
  });
});
