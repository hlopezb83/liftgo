import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";

/** Migration 0141 remains local until applied; generated Supabase types stay untouched. */
export interface OverdueDeliveriesPageRpcArgs {
  p_expected_organization_id: string;
  p_search: string | null;
  p_type: string;
  p_status: string;
  p_page: number;
  p_page_size: number;
  p_sort: { id: string; desc: boolean }[];
}
type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
type RpcQuery = PromiseLike<RpcResult> & { abortSignal(signal: AbortSignal): PromiseLike<RpcResult> };
type PageRpc = (fn: "get_overdue_deliveries_page", args: OverdueDeliveriesPageRpcArgs) => RpcQuery;

export function callOverdueDeliveriesPageRpc(args: OverdueDeliveriesPageRpcArgs, signal: AbortSignal) {
  const rpc = supabase.rpc.bind(supabase) as unknown as PageRpc;
  return rpc("get_overdue_deliveries_page", args).abortSignal(signal);
}

const itemSchema = z.object({
  // PostgreSQL UUIDs include historical hash-derived IDs without RFC version/variant bits.
  id: z.guid(), organization_id: z.guid(), booking_id: z.guid().nullable(), forklift_id: z.guid(),
  delivery_number: z.string(), type: z.enum(["delivery", "pickup", "return"]),
  address: z.string().nullable(), scheduled_date: z.iso.date(), scheduled_time: z.string().nullable(),
  status: z.enum(["scheduled", "in_transit"]), driver_name: z.string().nullable(),
  forklifts: z.object({ name: z.string(), model: z.string().nullable() }).nullable(),
});
export type OverdueDeliveryItem = z.infer<typeof itemSchema>;
const pageSchema = z.object({
  items: z.array(itemSchema), totalCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  pageIndex: z.number().int().nonnegative().max(100000), today: z.iso.date(),
});

/** Never turn an invalid response, tenant mismatch or partial page into a plausible empty list. */
export function parseOverdueDeliveriesPage(value: unknown, args: OverdueDeliveriesPageRpcArgs) {
  const parsed = pageSchema.safeParse(value);
  if (!parsed.success) throw new Error("La respuesta de transportes atrasados no es válida. Reintenta la consulta.");
  const page = parsed.data;
  const expectedPage = Math.min(args.p_page, Math.max(0, Math.ceil(page.totalCount / args.p_page_size) - 1));
  const expectedLength = Math.min(args.p_page_size, page.totalCount - expectedPage * args.p_page_size);
  if (page.pageIndex !== expectedPage || page.items.length !== expectedLength ||
      new Set(page.items.map((item) => item.id)).size !== page.items.length ||
      page.items.some((item) => item.organization_id !== args.p_expected_organization_id || item.scheduled_date >= page.today ||
        (args.p_type !== "all" && item.type !== args.p_type) || (args.p_status !== "all" && item.status !== args.p_status))) {
    throw new Error("No se pudo verificar el total y la página de transportes atrasados. Reintenta la consulta.");
  }
  return page;
}
