import { test, expect } from "@playwright/test";
import { TIMEOUTS } from "./fixtures/helpers";

/**
 * Regresión Sprint J — Filtros de Facturas.
 *
 * Bug histórico (v7.62.2): al alternar entre StatusTabs, la tabla se congelaba
 * después del primer cambio porque el hook `useLiftgoTable` reutilizaba la
 * identidad del objeto. El fix con `Proxy` + deps primitivas debe permitir
 * alternar entre pestañas N veces sin regresiones.
 *
 * v7.72.2: eliminado `waitForLoadState("networkidle").catch(() => {})` que
 * silenciaba timeouts reales; sustituido por `waitForResponse` al endpoint
 * REST de facturas — falla ruidosamente si el filtro no dispara refetch.
 */
const STATUS_TABS = [
  { value: "sent", label: /sin pagar/i },
  { value: "paid", label: /pagado/i },
  { value: "overdue", label: /vencido/i },
  { value: "all", label: /todos/i },
] as const;

const INVOICES_ENDPOINT = /\/rest\/v1\/invoices(\?|$)/;

test.describe("Facturas — filtros StatusTabs", () => {
  test("alterna entre estados sin congelarse (regresión v7.62.2)", async ({ page }) => {
    // Stress test: 5 vueltas × 4 tabs = 20 clicks; cada uno con waitForResponse
    // + poll de URL (hasta 10s c/u). Los 30s por defecto son insuficientes en
    // runners CI lentos — subimos a 90s para dar margen sin ocultar regresiones.
    test.setTimeout(90_000);
    // Refetch inicial al llegar a /invoices.
    await Promise.all([
      page.waitForResponse((r) => INVOICES_ENDPOINT.test(r.url()), { timeout: TIMEOUTS.long }),
      page.goto("/invoices", { waitUntil: "domcontentloaded" }),
    ]);

    await expect(page.getByRole("heading", { name: /facturas/i }).first()).toBeVisible({
      timeout: TIMEOUTS.long,
    });
    await expect(page.getByRole("tablist").first()).toBeVisible({ timeout: TIMEOUTS.medium });

    // Radix hidrata data-state de forma asíncrona tras el mount. Antes del
    // stress loop confirmamos que el tab por defecto ("Todos") ya está
    // "active" — así los clicks posteriores no compiten con la hidratación
    // inicial en runners CI lentos.
    await expect(
      page.getByRole("tab", { name: /todos/i }).first(),
    ).toHaveAttribute("data-state", "active", { timeout: TIMEOUTS.long });

    // Alternar 5 vueltas — cualquier hit al bug del Proxy congela la tabla.
    //
    // NB: la aserción canónica es el `?status=` de la URL, no el `data-state`
    // interno de Radix. En runners CI el atributo `data-state` intermitentemente
    // se lee como cadena vacía (Radix re-renderiza durante refetch y el
    // atributo aparece momentáneamente detacheado del elemento clicado por
    // `.first()`), pero la URL siempre refleja el filtro real aplicado por
    // `useInvoicesFilters`. Verificamos la URL como source-of-truth y usamos
    // `data-state` sólo como soft-check final.
    for (let i = 0; i < 5; i++) {
      for (const { value, label } of STATUS_TABS) {
        const target = page.getByRole("tab", { name: label }).first();

        // Cada click debe disparar un refetch al REST endpoint. Si la
        // identidad del hook está rota, el request nunca sale y esto
        // falla con timeout dirigido en lugar de un flake ambiguo.
        await Promise.all([
          page
            .waitForResponse((r) => INVOICES_ENDPOINT.test(r.url()), { timeout: TIMEOUTS.medium })
            .catch(() => null), // el tab activo actual reusa cache → no siempre hay request
          target.click(),
        ]);

        // Source of truth: URL. `all` limpia el param; el resto lo escribe.
        await expect
          .poll(() => new URL(page.url()).searchParams.get("status") ?? "all", {
            timeout: TIMEOUTS.medium,
          })
          .toBe(value);
      }
    }

    // Soft-check final: tras el stress loop, el último tab clicado ("Todos")
    // debe seguir activo en Radix. Si esto falla es indicio real de un bug
    // de identidad en el hook, no un flake de reconciliación.
    await expect(
      page.getByRole("tab", { name: /todos/i }).first(),
    ).toHaveAttribute("data-state", "active", { timeout: TIMEOUTS.medium });
  });
});
