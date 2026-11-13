import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

/** Local contract for migration 0144, without editing generated Supabase types. */
export interface DeliveriesPageRpcArgs {
  p_expected_organization_id: string;
  p_search: string | null;
  p_type: string;
  p_status: string;
  p_history: string;
  p_page: number;
  p_page_size: number;
  p_sort: { id: string; desc: boolean }[];
}
type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
type RpcQuery = PromiseLike<RpcResult> & { abortSignal(signal: AbortSignal): PromiseLike<RpcResult> };
type PageRpc = (fn: "get_deliveries_page", args: DeliveriesPageRpcArgs) => RpcQuery;
export function callDeliveriesPageRpc(args: DeliveriesPageRpcArgs, signal: AbortSignal) {
  const rpc = supabase.rpc.bind(supabase) as unknown as PageRpc;
  return rpc("get_deliveries_page", args).abortSignal(signal);
}

const reconciliationSchema = z.object({
  delivery_id: z.uuid(), organization_id: z.uuid(),
  classification: z.enum(["closed_rental", "equipment_sale"]), reference_date: z.iso.date(),
  date_basis: z.enum(["booking_start_authorized", "sale_invoice_issued_authorized"]),
  evidence: z.record(z.string(), z.json()), reason: z.string(), authorization_source: z.string(),
  reconciled_at: z.iso.datetime({ offset: true }), revoked_at: z.iso.datetime({ offset: true }).nullable(),
  revocation_reason: z.string().nullable(),
});
const itemSchema = z.object({
  id: z.uuid(), organization_id: z.uuid(), booking_id: z.uuid().nullable(), forklift_id: z.uuid(),
  delivery_number: z.string(), type: z.enum(["delivery", "pickup", "return"]),
  address: z.string().nullable(), scheduled_date: z.iso.date(), scheduled_time: z.string().nullable(),
  status: z.enum(["scheduled", "in_transit", "completed", "cancelled"]), driver_name: z.string().nullable(),
  forklifts: z.object({ name: z.string(), model: z.string().nullable() }).nullable(),
  historical_reconciliation: reconciliationSchema.nullable(),
});
export type DeliveryPageItem = z.infer<typeof itemSchema>;
const countSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const pageSchema = z.object({
  items: z.array(itemSchema), totalCount: countSchema, overdueCount: countSchema,
  pageIndex: z.number().int().nonnegative().max(100000), today: z.iso.date(),
});
function matchesScope(item: DeliveryPageItem, args: DeliveriesPageRpcArgs) {
  const ledger = item.historical_reconciliation;
  const reconciled = ledger !== null && ledger.revoked_at === null;
  return item.organization_id === args.p_expected_organization_id &&
    (!ledger || (ledger.delivery_id === item.id && ledger.organization_id === item.organization_id)) &&
    (args.p_type === "all" || item.type === args.p_type) &&
    (args.p_status === "all" || item.status === args.p_status) &&
    (args.p_history === "history" || (args.p_history === "reconciled" ? reconciled : !reconciled));
}
export function parseDeliveriesPage(value: unknown, args: DeliveriesPageRpcArgs) {
  const parsed = pageSchema.safeParse(value);
  if (!parsed.success) throw new Error("La respuesta de entregas no es válida. Reintenta la consulta.");
  const page = parsed.data;
  const expectedPage = Math.min(args.p_page, Math.max(0, Math.ceil(page.totalCount / args.p_page_size) - 1));
  const expectedLength = Math.min(args.p_page_size, page.totalCount - expectedPage * args.p_page_size);
  if (page.pageIndex !== expectedPage || page.items.length !== expectedLength ||
      new Set(page.items.map(item => item.id)).size !== page.items.length ||
      page.items.some(item => !matchesScope(item, args))) {
    throw new Error("No se pudo verificar el total y la página de entregas. Reintenta la consulta.");
  }
  return page;
}
