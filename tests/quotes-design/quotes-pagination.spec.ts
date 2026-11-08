import { test, expect } from "@playwright/test";
import { mkdirSync, writeFileSync } from "node:fs";
import { closeOfflinePages } from "../offlineTeardown";
import { installQuoteTransport } from "./fixtures";

const folder = "test-results/quotes-design/evidence";
const org = "00000000-0000-4000-8000-000000000002";
const oldId = "00000000-0000-4000-8000-000000009999";
const rows = Array.from({ length: 501 }, (_, index) => ({
  id: index === 500 ? oldId : `00000000-0000-4000-8000-${String(index + 1000).padStart(12, "0")}`,
  organization_id: org, quote_number: index === 500 ? "COT-0445" : `COT-${index + 1000}`,
  customer_name: index === 500 ? "QA Cliente antiguo" : "QA Cliente reciente",
  status: index === 500 ? "accepted" : "draft", total: 116, subtotal: 100, tax_amount: 16, tax_rate: 16,
  currency: "MXN", tipo_cambio: 1, quote_type: "rental", customer_id: null, forklift_id: null,
  valid_until: null, start_date: null, end_date: null, is_e2e: false,
  created_at: index === 500 ? "2020-01-01" : "2026-01-01",
}));

test("server quote pagination and search reach old row 501", async ({ page, context, baseURL }, testInfo) => {
  const transport = await installQuoteTransport(context, new URL(baseURL!).origin, { readOnly: true });
  const pageErrors: string[] = [];
  const requests: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await context.route("http://127.0.0.1:54321/rest/v1/rpc/get_quotes_page", async (route) => {
    const request = route.request();
    if (request.method() === "OPTIONS") return route.fallback();
    const args = request.postDataJSON() as {
      p_expected_organization_id: string; p_search: string | null; p_status: string;
      p_page: number; p_page_size: number; p_sort: { id: string; desc: boolean }[];
    };
    requests.push(`${request.method()} ${request.url()} ${JSON.stringify(args)}`);
    // This exact POST is a read RPC. All other writes remain blocked by installQuoteTransport.
    expect(request.method()).toBe("POST");
    expect(args.p_expected_organization_id).toBe(org);
    let result = [...rows];
    if (args.p_status !== "all") result = result.filter((row) => row.status === args.p_status);
    if (args.p_search) {
      const search = args.p_search.toLowerCase();
      const digits = /^(?:cot-)?(\d+)$/i.exec(search)?.[1]?.replace(/^0+(?=\d)/, "");
      result = result.filter((row) => `${row.quote_number} ${row.customer_name}`.toLowerCase().includes(search) ||
        (digits !== undefined && row.quote_number.replace(/^COT-0*/, "") === digits));
    }
    result.sort((a, b) => {
      for (const { id, desc } of args.p_sort) {
        expect(["quote_number", "customer_name", "total", "status", "valid_until"]).toContain(id);
        const compared = String(a[id as keyof typeof a] ?? "").localeCompare(String(b[id as keyof typeof b] ?? ""), undefined, { numeric: id === "quote_number" });
        if (compared) return compared * (desc ? -1 : 1);
      }
      return b.created_at.localeCompare(a.created_at) || b.id.localeCompare(a.id);
    });
    const totalCount = result.length;
    const pageIndex = Math.min(args.p_page, Math.max(0, Math.ceil(totalCount / args.p_page_size) - 1));
    const offset = pageIndex * args.p_page_size;
    await route.fulfill({ contentType: "application/json", headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({ items: result.slice(offset, offset + args.p_page_size), totalCount, pageIndex }) });
  });

  await page.goto("/quotes?tablePage=20");
  await expect(page.getByText("501–501 de 501", { exact: true })).toBeVisible();
  await expect(page.getByText("COT-0445", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Ir a la página siguiente" })).toBeDisabled();
  await expect(page.getByText(/Mostrando los primeros 500/)).toHaveCount(0);
  await page.getByRole("button", { name: "Ir a la página anterior" }).click();
  await expect(page.getByText("476–500 de 501", { exact: true })).toBeVisible();

  const search = page.getByRole("searchbox", { name: "Buscar cotizaciones…" });
  await search.fill("445");
  await expect(page.getByText("COT-0445", { exact: true })).toBeVisible();
  // One newer folio contains 445 too: all matches are represented, not locally filtered.
  await expect(page.getByText("1–2 de 2", { exact: true })).toBeVisible();
  await search.fill("COT-0445");
  await expect(page.getByText("1–1 de 1", { exact: true })).toBeVisible();
  if (testInfo.project.name.startsWith("mobile")) {
    await expect(page.getByRole("link", { name: "Ver cotización COT-0445 de QA Cliente antiguo" })).toHaveAttribute("href", `/quotes/${oldId}`);
  } else await expect(page.getByRole("table")).toBeVisible();

  mkdirSync(folder, { recursive: true });
  await page.screenshot({ path: `${folder}/${testInfo.project.name}-quotes-server-search.png`, fullPage: true });
  const geometry = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth }));
  expect(geometry.scroll).toBeLessThanOrEqual(geometry.width + 1);
  if (testInfo.project.name.startsWith("mobile")) await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.getByRole("combobox", { name: "Filtrar por estado" }).click();
  await page.getByRole("option", { name: "Borradores", exact: true }).click();
  if (testInfo.project.name.startsWith("mobile")) await page.keyboard.press("Escape");
  await expect(page.getByText("No hay resultados con los filtros actuales")).toBeVisible();
  await page.getByRole("button", { name: "Limpiar filtros", exact: true }).last().click();
  await expect(page.getByText("1–25 de 501", { exact: true })).toBeVisible();

  const teardownErrors = await closeOfflinePages(context);
  writeFileSync(`${folder}/${testInfo.project.name}-quotes-server-network.json`, JSON.stringify({ ...transport, requests, pageErrors, teardownErrors, geometry }, null, 2));
  expect(transport.unexpected).toEqual([]);
  expect(transport.blockedWrites).toEqual([]);
  expect(pageErrors).toEqual([]);
  expect(teardownErrors).toEqual([]);
});
