import assert from "node:assert/strict";
import type { BrowserContext } from "@playwright/test";
import { forkliftId, installGroupCTransport } from "../design-group-c/fixtures";

export const maintenanceId = "00000000-0000-4000-8000-000000000901";
export const mechanicName = "QA Mecánico de mantenimiento";
export const organizationId = "00000000-0000-4000-8000-000000000002";
export const archivedError = "La orden está archivada. Restáurala antes de modificar refacciones o mano de obra.";
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const mechanicId = id(902), consumptionId = id(903);
export const lastPartId = id(11002), lastSku = "QA-SKU-1002";
interface InventoryArgs {
  p_expected_organization_id: string; p_search: string | null; p_page: number; p_page_size: number;
  p_maintenance_stock?: boolean;
}

export async function installMaintenanceAudit(context: BrowserContext, origin: string) {
  const audit = await installGroupCTransport(context, origin);
  const state = {
    archived: false, failTables: new Set<string>(), failCatalog: false,
    quantity: 0, historicalUnitCost: 0, catalogUnitCost: 10, remainingStock: 20, showLabor: false,
    catalogCalls: [] as InventoryArgs[], selectedIds: [] as string[], reads: [] as string[],
    writes: [] as Array<{ endpoint: string; args: Record<string, unknown> }>,
  };
  const parts = Array.from({ length: 1002 }, (_, index) => ({
    id: id(10001 + index), organization_id: organizationId, catalog_part_id: null,
    name: `Refacción QA ${String(index + 1).padStart(4, "0")}`, sku: `QA-SKU-${String(index + 1).padStart(4, "0")}`,
    category: "Filtros", stock_quantity: index < 501 ? 0 : 20, min_stock_level: 1, unit_cost: 10,
    location: null, is_active: true, created_at: "2026-10-01T12:00:00Z", updated_at: "2026-10-01T12:00:00Z",
  }));
  const currentParts = () => parts.map(part => part.id === lastPartId
    ? { ...part, stock_quantity: state.remainingStock, unit_cost: state.catalogUnitCost } : part);
  const usedParts = () => state.quantity ? [{ id: consumptionId, maintenance_log_id: maintenanceId,
    part_id: lastPartId, quantity_used: state.quantity, cost_at_time: state.historicalUnitCost,
    parts_inventory: { name: "Refacción QA 1002", sku: lastSku, category: "Filtros" } }] : [];
  const log = () => ({ id: maintenanceId, organization_id: organizationId, forklift_id: forkliftId,
    supplier_id: null, service_type: "Inspección de Rutina", description: "Orden ficticia para auditoría",
    cost: state.quantity * state.historicalUnitCost, manual_cost: 0, performed_at: "2026-11-01",
    performed_by: mechanicName, next_service_date: "2026-12-01", work_status: "pending",
    deleted_at: state.archived ? "2026-11-02T12:00:00Z" : null, deleted_by: null,
    created_at: "2026-11-01T12:00:00Z", updated_at: "2026-11-01T12:00:00Z" });
  await context.route("http://127.0.0.1:54321/rest/v1/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), endpoint = url.pathname.split("/").pop()!;
    const json = (data: unknown, status = 200) => route.fulfill({ status, contentType: "application/json",
      headers: { "access-control-allow-origin": origin }, body: JSON.stringify(data) });
    if (request.method() === "POST" && endpoint === "get_inventory_page") {
      const args = request.postDataJSON() as InventoryArgs;
      assert.equal(args.p_expected_organization_id, organizationId);
      assert.equal(args.p_maintenance_stock, true);
      assert.equal(args.p_page_size, 25);
      state.catalogCalls.push(args);
      if (state.failCatalog) return json({ code: "QA_READ", message: "Fallo ficticio de catálogo" }, 500);
      const rows = currentParts().filter(part => part.stock_quantity > 0 &&
        (!args.p_search || `${part.name} ${part.sku}`.toLowerCase().includes(args.p_search.toLowerCase())));
      const pageIndex = Math.min(args.p_page, Math.max(0, Math.ceil(rows.length / args.p_page_size) - 1));
      return json({ items: rows.slice(pageIndex * args.p_page_size, (pageIndex + 1) * args.p_page_size),
        totalCount: rows.length, lowStockCount: 0, pageIndex });
    }
    if (request.method() === "POST" && ["add_maintenance_part_quantity", "maintenance_labor"].includes(endpoint)) {
      const args = request.postDataJSON() as Record<string, unknown>;
      state.writes.push({ endpoint, args });
      if (state.archived) return json({ code: "23514", message: archivedError }, 400);
      assert.equal(endpoint, "add_maintenance_part_quantity", "Only the consumption RPC may succeed in this fixture");
      assert.deepEqual(Object.keys(args).sort(), ["p_maintenance_log_id", "p_part_id", "p_quantity"]);
      assert.equal(args.p_maintenance_log_id, maintenanceId); assert.equal(args.p_part_id, lastPartId);
      const quantity = Number(args.p_quantity); assert.ok(quantity > 0 && quantity <= state.remainingStock);
      if (!state.quantity) state.historicalUnitCost = state.catalogUnitCost;
      state.quantity += quantity; state.remainingStock -= quantity;
      return json({ id: consumptionId, organization_id: organizationId, maintenance_log_id: maintenanceId,
        part_id: lastPartId, quantity_used: state.quantity, cost_at_time: state.historicalUnitCost });
    }
    if (request.method() !== "GET") return route.fallback();
    const tables = new Set(["maintenance_logs", "maintenance_parts", "maintenance_labor", "mechanics", "parts_inventory"]);
    if (!tables.has(endpoint)) return route.fallback();
    state.reads.push(endpoint);
    if (state.failTables.has(endpoint)) return json({ code: "QA_READ", message: "Fallo de lectura ficticio" }, 500);
    let rows: unknown[] = [];
    if (endpoint === "maintenance_logs") rows = url.searchParams.get("deleted_at") === (state.archived ? "not.is.null" : "is.null") ? [log()] : [];
    if (endpoint === "maintenance_parts") rows = usedParts();
    if (endpoint === "mechanics") rows = [{ id: mechanicId, name: mechanicName, specialization: "General", is_active: true }];
    if (endpoint === "maintenance_labor" && state.showLabor) rows = [{ id: id(904), maintenance_log_id: maintenanceId,
      mechanic_id: mechanicId, hours: 2, hourly_rate: 50, total_cost: 100, notes: "Trabajo QA recuperado", mechanics: { name: mechanicName } }];
    if (endpoint === "parts_inventory") {
      const selected = url.searchParams.get("id")?.replace(/^eq\./, "");
      if (selected) state.selectedIds.push(selected);
      rows = selected ? currentParts().filter(part => part.id === selected) : currentParts().slice(0, Number(url.searchParams.get("limit") ?? 501));
    }
    return json(request.headers().accept?.includes("vnd.pgrst.object") ? rows[0] ?? null : rows);
  });
  return { audit, state };
}
