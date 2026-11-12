import { Buffer } from "node:buffer";
import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { backend, id, installYagniTransport, json, organizationId, supplierRows } from "./yagni-fixtures";

test("stock bajo filtra el servidor y vuelve a la primera página con 501 refacciones", async ({ page, context, baseURL }, info) => {
  const transport = await installYagniTransport(context, new URL(baseURL!).origin);
  await page.goto("/inventory?tablePage=15");
  await expect(page.getByText("376–400 de 501", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Refacciones con stock bajo/ }).click();
  await expect(page.getByText("1–1 de 1", { exact: true })).toBeVisible();
  await expect(page.getByText("TARGET-501", { exact: true })).toBeVisible();
  await expect(page).toHaveURL(/stock=low/);
  expect(transport.inventoryCalls[0]).not.toHaveProperty("p_low_stock");
  expect(transport.inventoryCalls.at(-1)).toMatchObject({ p_low_stock: true, p_page: 0 });
  const search = page.getByRole("searchbox", { name: "Buscar por nombre o SKU…" });
  await search.fill("ausente");
  await expect(page.getByText("No hay resultados con los filtros actuales")).toBeVisible();
  await search.fill("TARGET-501");
  await expect(page.getByText("1–1 de 1", { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText("TARGET-501", { exact: true })).toBeVisible();
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-yagni-stock.png`, fullPage: true });
  await transport.finish();
});

test("proveedores exporta coincidencias completas y conserva vista al regresar del detalle", async ({ page, context, baseURL }, info) => {
  const transport = await installYagniTransport(context, new URL(baseURL!).origin);
  await page.goto(`/suppliers?tableSort=${encodeURIComponent(JSON.stringify([{ id: "name", desc: true }]))}`);
  await expect(page.getByText("500+ proveedores cargados", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Exportar CSV", exact: true })).toHaveCount(0);
  if (info.project.use.isMobile) await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.getByRole("searchbox", { name: "Buscar por nombre, RFC, correo…" }).fill("Match");
  await expect(page).toHaveURL(/q=Match/);
  if (info.project.use.isMobile) await page.getByRole("dialog", { name: "Filtros", exact: true }).getByRole("button", { name: "Cerrar", exact: true }).click();
  await expect(page.getByText("1–25 de al menos 30", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: /Cargar más/ }).click();
  await expect(page.getByText("501 proveedores registrados", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV", exact: true }).click();
  const download = await downloadPromise;
  const csv = await readFile((await download.path())!, "utf8");
  expect(csv.match(/Match proveedor/g)).toHaveLength(30);
  expect(csv).not.toContain("Otro proveedor");
  await page.getByRole("button", { name: "Ir a la página siguiente" }).click();
  const listURL = page.url();
  await expect(page.getByText("26–30 de 30", { exact: true })).toBeVisible();
  await page.getByRole("link", { name: /Ver proveedor Match proveedor/ }).first().click();
  await expect(page.getByRole("heading", { level: 1, name: /Match proveedor/ })).toBeVisible();
  await expect(page.getByText("501 registro(s)", { exact: true })).toHaveCount(2);
  await expect(page.getByText("$700.00", { exact: true })).toBeVisible();
  await expect(page.getByText("$505.00", { exact: true })).toBeVisible();
  expect(transport.requests.filter(request => request.table === "supplier_bills").map(request => request.params.get("offset"))).toEqual(["0", "500"]);
  expect(transport.requests.filter(request => request.table === "maintenance_logs").map(request => request.params.get("offset"))).toEqual(["0", "500"]);
  expect(transport.requests.some(request => request.table === "supplier_payments")).toBe(false);
  await page.getByRole("button", { name: "Volver", exact: true }).click();
  await expect(page).toHaveURL(listURL);
  await expect(page.getByText("26–30 de 30", { exact: true })).toBeVisible();
  if (info.project.use.isMobile) await page.getByRole("button", { name: "Filtros activos", exact: true }).click();
  await expect(page.getByRole("searchbox", { name: "Buscar por nombre, RFC, correo…" })).toHaveValue("Match");
  if (info.project.use.isMobile) await page.getByRole("dialog", { name: "Filtros", exact: true }).getByRole("button", { name: "Cerrar", exact: true }).click();
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-yagni-suppliers.png`, fullPage: true });
  await transport.finish();
});

test("CSF fallida reintenta sólo el adjunto sin crear dos proveedores", async ({ page, context, baseURL }, info) => {
  const transport = await installYagniTransport(context, new URL(baseURL!).origin);
  const createdId = id(9000);
  let creates = 0, uploads = 0, documents = 0;
  await context.route(`${backend}/functions/v1/parse-csf`, route => json(route, { name: "Proveedor CSF offline" }));
  await context.route(`${backend}/rest/v1/rpc/current_organization_id`, route => json(route, organizationId));
  await context.route(`${backend}/rest/v1/suppliers*`, route => {
    if (route.request().method() !== "POST") return route.fallback();
    creates++;
    return json(route, { ...supplierRows[0], ...route.request().postDataJSON(), id: createdId });
  });
  await context.route(`${backend}/storage/v1/object/documents/**`, async route => {
    if (route.request().method() === "OPTIONS") return route.fallback();
    expect(route.request().method()).toBe("POST");
    expect(route.request().url()).toContain(`/${organizationId}/supplier/${createdId}/`);
    uploads++;
    if (uploads === 1) return json(route, { statusCode: "503", error: "Unavailable", message: "Adjunto temporalmente no disponible" }, 503);
    return json(route, { Key: `documents/${organizationId}/supplier/${createdId}/csf.pdf` });
  });
  await context.route(`${backend}/rest/v1/documents*`, route => {
    if (route.request().method() !== "POST") return route.fallback();
    documents++;
    expect(route.request().postDataJSON()).toMatchObject({ entity_id: createdId, entity_type: "supplier", file_name: "csf-offline.pdf" });
    return json(route, { id: id(9001), ...route.request().postDataJSON() });
  });
  await page.goto("/suppliers");
  await page.getByRole("button", { name: "Nuevo proveedor", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Nuevo proveedor", exact: true });
  await dialog.getByRole("tab", { name: "Importar desde CSF" }).click();
  await dialog.locator('input[type="file"]').setInputFiles({ name: "csf-offline.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nSynthetic offline attachment") });
  await expect(dialog.getByText("Datos extraídos", { exact: true })).toBeVisible();
  await dialog.getByRole("button", { name: "Agregar proveedor", exact: true }).click();
  await expect(dialog.getByText("El proveedor ya está guardado.", { exact: true })).toBeVisible();
  await expect(dialog.getByText(/No se pudo adjuntar la CSF/)).toBeVisible();
  expect(creates).toBe(1);
  expect(uploads).toBe(1);
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-yagni-csf-retry.png`, fullPage: true });
  // Shared FormActions intentionally suppresses clicks for 400ms after a submit.
  await expect(async () => {
    await dialog.getByRole("button", { name: "Reintentar subida de CSF", exact: true }).click();
    expect(uploads).toBe(2);
  }).toPass({ intervals: [500], timeout: 5000 });
  await expect(dialog).toHaveCount(0);
  expect({ creates, uploads, documents }).toEqual({ creates: 1, uploads: 2, documents: 1 });
  await page.getByRole("button", { name: "Nuevo proveedor", exact: true }).click();
  await expect(dialog.getByRole("textbox", { name: "Nombre / Razón Social" })).toHaveValue("");
  await transport.finish();
});

test("clientes permite encontrar y exportar el registro posterior a 500", async ({ page, context, baseURL }, info) => {
  const transport = await installYagniTransport(context, new URL(baseURL!).origin);
  await page.goto("/customers");
  await expect(page.getByText("500+ clientes cargados", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Exportar CSV", exact: true })).toBeDisabled();
  await page.getByRole("searchbox", { name: "Buscar clientes…" }).fill("TARGET501");
  await expect(page.getByText("No hay resultados con los filtros actuales")).toBeVisible();
  await page.getByRole("button", { name: /Cargar más/ }).click();
  await expect(page.getByText("501 clientes", { exact: true })).toBeVisible();
  await expect(page.getByText("TARGET501 Cliente remoto", { exact: true })).toBeVisible();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Exportar CSV", exact: true }).click();
  const csv = await readFile((await (await downloadPromise).path())!, "utf8");
  expect(csv).toContain("TARGET501 Cliente remoto");
  expect(csv).not.toContain("Cliente 000");
  expect(transport.requests.filter(request => request.table === "organization_customers").map(request => request.params.get("offset"))).toEqual(["0", "500"]);
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-yagni-customers.png`, fullPage: true });
  await transport.finish();
});

const assertMalformedCxp = {
  summary: (page: Page) => expect(page.getByText("$0.00", { exact: true })).toHaveCount(0),
  page: (page: Page) => expect(page.getByText("QA-FACTURA-PROVEEDOR-INDUSTRIAL-1234567890", { exact: true })).toHaveCount(0),
};

for (const malformedResource of ["summary", "page"] as const) test(`CxP ${malformedResource} malformado muestra error y permite recuperar sin presentar ceros falsos`, async ({ page, context, baseURL }, info) => {
  const transport = await installYagniTransport(context, new URL(baseURL!).origin);
  let malformed = true;
  const rpc = malformedResource === "summary" ? "get_accounts_payable_summary" : "get_supplier_bills_page";
  await context.route(`${backend}/rest/v1/rpc/${rpc}`, route => {
    if (!malformed) return route.fallback();
    return json(route, malformedResource === "summary"
      ? { kpis: { totalPendiente: "corrupto" }, availableMonths: [] }
      : { items: [], totalCount: 1 });
  });
  await page.goto("/cuentas-por-pagar");
  await expect(page.getByRole("button", { name: /Reintentar/ }).first()).toBeVisible();
  await assertMalformedCxp[malformedResource](page);
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-yagni-cxp-${malformedResource}-error.png`, fullPage: true });
  malformed = false;
  await page.getByRole("button", { name: /Reintentar/ }).first().click();
  await expect(page.getByText("QA-FACTURA-PROVEEDOR-INDUSTRIAL-1234567890", { exact: true })).toBeVisible();
  await transport.finish();
});

test("selector de cotización busca un cliente fuera de los primeros 500", async ({ page, context, baseURL }, info) => {
  const transport = await installYagniTransport(context, new URL(baseURL!).origin);
  await page.goto("/quotes/new");
  const selector = page.getByRole("combobox", { name: /^Cliente \(obligatorio\):/ });
  await selector.click();
  await page.getByPlaceholder("Buscar por nombre, razón social o RFC…").fill("TARGET501");
  await page.getByRole("option", { name: "TARGET501 Cliente remoto", exact: true }).click();
  await expect(selector).toContainText("TARGET501 Cliente remoto");
  expect(transport.requests.filter(request => request.table === "organization_customers"
    && [...request.params].some(([key, value]) => key.endsWith("or") && value.includes(".ilike.%TARGET501%")))).toHaveLength(2);
  await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-yagni-selector501.png`, fullPage: true });
  await transport.finish();
});
