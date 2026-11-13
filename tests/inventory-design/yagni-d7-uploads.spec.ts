import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { expect, test } from "@playwright/test";
import { forkliftId, getGroupCTransportLedgers, installGroupCTransport } from "../design-group-c/fixtures";
import { closeOfflinePages } from "../offlineTeardown";

const backend = "http://127.0.0.1:54321";
const organizationId = "00000000-0000-4000-8000-000000000002";
const userId = "00000000-0000-4000-8000-000000000001";
type DocumentRow = { id: string; entity_type: string; entity_id: string; file_name: string; file_url: string };

test.afterEach(async ({ context }) => {
  expect(await closeOfflinePages(context)).toEqual([]);
  for (const ledger of getGroupCTransportLedgers(context)) {
    expect(ledger.unexpected).toEqual([]);
    expect(ledger.pageErrors).toEqual([]);
    const allowed = new Set(["GET https://fonts.googleapis.com/css2", "POST http://127.0.0.1:54322/api/1/envelope/"]);
    expect(ledger.externalBlocked.filter(request => !allowed.has(request))).toEqual([]);
  }
});

test("lote espera el archivo lento y reintenta sólo el fallido sin duplicar el exitoso", async ({ page, context, baseURL }, info) => {
  const origin = new URL(baseURL!).origin;
  const audit = await installGroupCTransport(context, origin);
  const uploads: string[] = [], rows: DocumentRow[] = [];
  let releaseSlow!: () => void;
  const slow = new Promise<void>(resolve => { releaseSlow = resolve; });
  let failedOnce = false;
  await context.route(`${backend}/**`, async route => {
    const request = route.request(), url = new URL(request.url()), method = request.method();
    const headers = { "access-control-allow-origin": origin, "access-control-allow-headers": "*",
      "access-control-allow-methods": "GET, POST, OPTIONS" };
    const json = (data: unknown, status = 200) => route.fulfill({ status, headers,
      contentType: "application/json", body: JSON.stringify(data) });
    if (method === "OPTIONS") return route.fulfill({ status: 204, headers });
    if (url.pathname === "/rest/v1/rpc/current_organization_id" && method === "POST") return json(organizationId);
    if (url.pathname.startsWith("/storage/v1/object/documents/") && method === "POST") {
      const path = decodeURIComponent(url.pathname.slice("/storage/v1/object/documents/".length));
      assert.ok(path.startsWith(`${organizationId}/forklift/${forkliftId}/`));
      const fileName = path.endsWith("_fallido.pdf") ? "fallido.pdf" : "correcto.pdf";
      assert.ok(path.endsWith(`_${fileName}`));
      uploads.push(fileName);
      if (fileName === "fallido.pdf" && !failedOnce) {
        failedOnce = true;
        return json({ statusCode: "400", error: "FixtureUploadError", message: "Fallo ficticio de carga" }, 400);
      }
      if (fileName === "correcto.pdf") await slow;
      return json({ Key: `documents/${path}` });
    }
    if (url.pathname === "/rest/v1/documents" && method === "POST") {
      const body = request.postDataJSON();
      assert.equal(body.entity_type, "forklift");
      assert.equal(body.entity_id, forkliftId);
      assert.equal(body.uploaded_by, userId);
      assert.ok(body.file_url.startsWith(`documents/${organizationId}/forklift/${forkliftId}/`));
      const row = { ...body, id: `00000000-0000-4000-8000-000000000${800 + rows.length}`,
        created_at: "2026-11-13T12:00:00Z" } as DocumentRow;
      rows.push(row);
      return json(row);
    }
    if (url.pathname === "/rest/v1/documents" && method === "GET") {
      assert.equal(url.searchParams.get("entity_type"), "eq.forklift");
      assert.equal(url.searchParams.get("entity_id"), `eq.${forkliftId}`);
      return json(rows);
    }
    if (url.pathname === "/storage/v1/object/sign/documents" && method === "POST") {
      const body = request.postDataJSON() as { paths: string[]; expiresIn: number };
      assert.equal(body.expiresIn, 3600);
      return json(body.paths.map(path => ({ path, error: null,
        signedURL: `/object/sign/documents/${path}?token=fixture` })));
    }
    return route.fallback();
  });
  try {
    await page.goto(`/fleet/${forkliftId}`);
    const panel = page.getByRole("heading", { name: "Adjuntos", exact: true }).locator("..").locator("..").locator("..");
    await panel.locator('input[type="file"]').setInputFiles(["fallido.pdf", "correcto.pdf"].map(name => ({
      name, mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\nSynthetic offline upload"),
    })));
    await expect.poll(() => uploads.length).toBe(2);
    await expect(panel.getByRole("button", { name: "Subiendo…", exact: true })).toBeDisabled();
    await expect(panel.getByRole("button", { name: /Reintentar fallidos/ })).toHaveCount(0);
    releaseSlow();
    const retry = panel.getByRole("button", { name: "Reintentar fallidos (1)", exact: true });
    await expect(retry).toBeVisible();
    await expect(panel.getByRole("link", { name: /correcto.pdf/ })).toBeVisible();
    await retry.dblclick();
    await expect(panel.getByRole("link", { name: /fallido.pdf/ })).toBeVisible();
    await expect(panel.getByRole("button", { name: "Subir", exact: true })).toBeEnabled();
    expect(uploads.filter(name => name === "correcto.pdf")).toHaveLength(1);
    expect(uploads.filter(name => name === "fallido.pdf")).toHaveLength(2);
    expect(rows.map(row => row.file_name).sort()).toEqual(["correcto.pdf", "fallido.pdf"]);
    await info.attach("upload-batch-offline", { contentType: "application/json", body: JSON.stringify({
      ...audit, uploads, rows,
    }, null, 2) });
  } finally {
    releaseSlow();
  }
});
