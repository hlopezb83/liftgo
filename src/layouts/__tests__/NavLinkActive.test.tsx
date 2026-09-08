import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NavLink } from "@/layouts/NavLink";
import { isNavItemActive } from "@/layouts/sidebar/isNavItemActive";
import { parseSearch, stringifySearch } from "@/lib/searchSerialization";

/**
 * TS-05: el estado activo nativo de TanStack (`aria-current="page"`) debe
 * coincidir con la regla visual del sidebar: sólo UN ítem actual.
 */
const ITEMS = [
  { title: "Panel", url: "/" },
  { title: "Facturas", url: "/invoices" },
  { title: "Conciliación CFDI", url: "/invoices/reconciliation" },
];

function Nav({ pathname }: { pathname: string }) {
  return (
    <nav>
      {ITEMS.map((item) => (
        <NavLink
          key={item.title}
          to={item.url}
          end={item.url === "/" || !isNavItemActive(pathname, item.url, ITEMS.map((i) => i.url))}
        >
          {item.title}
        </NavLink>
      ))}
    </nav>
  );
}

function renderAt(initial: string) {
  const rootRoute = createRootRoute({ component: () => <Outlet /> });
  const page = (pathname: string) => () => <Nav pathname={pathname} />;
  const routes = [
    createRoute({ getParentRoute: () => rootRoute, path: "/", component: page("/") }),
    createRoute({ getParentRoute: () => rootRoute, path: "/invoices", component: page("/invoices") }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/invoices/reconciliation",
      component: page("/invoices/reconciliation"),
    }),
    createRoute({
      getParentRoute: () => rootRoute,
      path: "/invoices/$id",
      component: page("/invoices/FAC-1"),
    }),
  ];
  const router = createRouter({
    routeTree: rootRoute.addChildren(routes),
    history: createMemoryHistory({ initialEntries: [initial] }),
    parseSearch,
    stringifySearch,
  });
  return render(<RouterProvider router={router} />);
}

function currentTitles(): string[] {
  return Array.from(document.querySelectorAll('a[aria-current="page"]')).map(
    (el) => el.textContent ?? "",
  );
}

describe("NavLink — estado activo nativo (TS-05)", () => {
  it("en /invoices/reconciliation sólo Conciliación CFDI es la página actual", async () => {
    renderAt("/invoices/reconciliation");
    await screen.findByText("Conciliación CFDI");
    expect(currentTitles()).toEqual(["Conciliación CFDI"]);
  });

  it("la lista con filtros mantiene activa su sección", async () => {
    renderAt("/invoices?status=overdue");
    await screen.findByText("Facturas");
    expect(currentTitles()).toEqual(["Facturas"]);
  });

  it("el detalle de una factura mantiene activa Facturas", async () => {
    renderAt("/invoices/FAC-1");
    await screen.findByText("Facturas");
    expect(currentTitles()).toEqual(["Facturas"]);
  });

  it("en el inicio sólo Panel es la página actual", async () => {
    renderAt("/");
    await screen.findByText("Panel");
    expect(currentTitles()).toEqual(["Panel"]);
  });
});
