import assert from "node:assert/strict";
import { test, expect, type Route } from "@playwright/test";
import { getGroupCTransportLedgers, installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";

const backend = "http://127.0.0.1:54321";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const supplierId = id(61);
const paths = ["a.pdf", "b.pdf"].map(name => `${id(2)}/supplier/${supplierId}/${name}`);
const externalUrl = "https://vendor.example.invalid/documents/manual.pdf";
const documents = paths.map((path, i) => ({ id: id(700 + i), entity_type: "supplier", entity_id: supplierId,
  file_name: `Documento QA ${i + 1}.pdf`, file_url: `documents/${path}`, file_size: 100,
  mime_type: "application/pdf", uploaded_by: id(1), created_at: "2026-11-12T12:00:00Z" }));
const json = (route: Route, value: unknown, status = 200) => route.fulfill({ status,
  contentType: "application/json", headers: { "access-control-allow-origin": "*" }, body: JSON.stringify(value) });
const signedPath = (path: string) => `/object/sign/documents/${path}?token=fixture`;

test.afterEach(async ({ context }) => {
  expect(await closeOfflinePages(context)).toEqual([]);
  for (const ledger of getGroupCTransportLedgers(context)) {
    expect(ledger.unexpected).toEqual([]);
    expect(ledger.pageErrors).toEqual([]);
    const allowedBlocked = new Set(["GET https://fonts.googleapis.com/css2", "POST http://127.0.0.1:54322/api/1/envelope/"]);
    expect(ledger.externalBlocked.filter(request => !allowedBlocked.has(request))).toEqual([]);
  }
});

for (const failure of ["read", "sign-batch", "sign-partial"] as const) {
  test(`adjuntos: ${failure} muestra error y recupera enlaces válidos al reintentar`, async ({ page, context, baseURL }, info) => {
    await installGroupCTransport(context, new URL(baseURL!).origin);
    let failing = true, documentReads = 0, signingReads = 0;
    await context.route(`${backend}/**`, async route => {
      const request = route.request(), url = new URL(request.url());
      if (request.method() === "GET" && ["/rest/v1/supplier_contacts", "/rest/v1/supplier_bank_accounts"].includes(url.pathname)) {
        assert.equal(url.searchParams.get("supplier_id"), `eq.${supplierId}`);
        return json(route, []);
      }
      if (request.method() === "GET" && url.pathname === "/rest/v1/documents") {
        assert.equal(url.searchParams.get("entity_type"), "eq.supplier");
        assert.equal(url.searchParams.get("entity_id"), `eq.${supplierId}`);
        documentReads++;
        if (failing && failure === "read") return json(route, { code: "FIXTURE_READ_ERROR", message: "Consulta ficticia no disponible" }, 500);
        return json(route, [...documents, { ...documents[0], id: id(702), file_name: "Manual externo.pdf", file_url: externalUrl }]);
      }
      if (request.method() === "POST" && url.pathname === "/storage/v1/object/sign/documents") {
        assert.deepEqual(request.postDataJSON(), { expiresIn: 3600, paths });
        signingReads++;
        if (failing && failure === "sign-batch") return json(route, { statusCode: "500", error: "FIXTURE_SIGN_ERROR", message: "Firma ficticia no disponible" }, 500);
        const response = paths.map(path => ({ path, signedURL: signedPath(path), error: null }));
        return json(route, failing && failure === "sign-partial" ? response.slice(0, 1) : response);
      }
      return route.fallback();
    });

    await page.goto(`/suppliers/${supplierId}`);
    const attachments = page.getByRole("heading", { name: "Adjuntos", exact: true }).locator("..").locator("..").locator("..");
    await expect(attachments.getByText("No se pudo cargar los adjuntos", { exact: true })).toBeVisible();
    await expect(attachments.getByText("Sin adjuntos", { exact: true })).toHaveCount(0);
    await expect(attachments.getByRole("link")).toHaveCount(0);
    const previousReads = documentReads;
    failing = false;
    await attachments.getByRole("button", { name: "Reintentar", exact: true }).click();
    await expect(attachments.getByRole("link", { name: /Documento QA 1.pdf/ })).toHaveAttribute("href", `${backend}/storage/v1${signedPath(paths[0])}`);
    await expect(attachments.getByRole("link", { name: /Documento QA 2.pdf/ })).toHaveAttribute("href", `${backend}/storage/v1${signedPath(paths[1])}`);
    await expect(attachments.getByRole("link", { name: /Manual externo.pdf/ })).toHaveAttribute("href", externalUrl);
    await expect(attachments.getByText("No se pudo cargar los adjuntos", { exact: true })).toHaveCount(0);
    expect(documentReads).toBeGreaterThan(previousReads);
    expect(signingReads).toBeGreaterThan(0);
    await page.screenshot({ path: `test-results/inventory-design/${info.project.name}-r2-documents-${failure}.png`, fullPage: true });
  });
}
