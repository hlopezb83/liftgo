import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { PartInventory } from "../hooks/usePartsInventory";

/** Migration 0132 is deliberately local until applied; generated DB types stay untouched. */
export interface InventoryPageRpcArgs {
  p_expected_organization_id: string;
  p_search: string | null;
  p_category: string;
  p_page: number;
  p_page_size: number;
  p_sort: { id: string; desc: boolean }[];
}
type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
type RpcQuery = PromiseLike<RpcResult> & { abortSignal(signal: AbortSignal): PromiseLike<RpcResult> };
type PageRpc = (fn: "get_inventory_page", args: InventoryPageRpcArgs) => RpcQuery;

export function callInventoryPageRpc(args: InventoryPageRpcArgs, signal: AbortSignal) {
  // Same authenticated SDK client, without weakening the generated schema globally.
  const rpc = supabase.rpc.bind(supabase) as unknown as PageRpc;
  return rpc("get_inventory_page", args).abortSignal(signal);
}

export const inventoryItemSchema = z.object({
  id: z.string().min(1), organization_id: z.string(), catalog_part_id: z.string().nullable(),
  name: z.string(), sku: z.string().nullable(), category: z.string(),
  stock_quantity: z.number().int(), min_stock_level: z.number().int(), unit_cost: z.number(),
  location: z.string().nullable(), is_active: z.boolean(), created_at: z.string(), updated_at: z.string(),
}) satisfies z.ZodType<PartInventory>;
const pageSchema = z.object({
  items: z.array(inventoryItemSchema), totalCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  lowStockCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  pageIndex: z.number().int().nonnegative().max(100000),
});

/** Reject malformed/inconsistent payloads instead of displaying an invented empty result. */
export function parseInventoryPage(value: unknown, requestedPage: number, pageSize: number, organizationId: string) {
  const parsed = pageSchema.safeParse(value);
  if (!parsed.success) throw new Error("La respuesta de refacciones no es válida. Reintenta la consulta.");
  const page = parsed.data;
  const expectedPage = Math.min(requestedPage, Math.max(0, Math.ceil(page.totalCount / pageSize) - 1));
  const expectedLength = Math.min(pageSize, page.totalCount - expectedPage * pageSize);
  if (page.items.some((item) => item.organization_id !== organizationId || !item.is_active) || page.pageIndex !== expectedPage || page.items.length !== expectedLength ||
      new Set(page.items.map((item) => item.id)).size !== page.items.length) {
    throw new Error("No se pudo verificar el total y la página de refacciones. Reintenta la consulta.");
  }
  return page;
}
