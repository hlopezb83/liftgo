import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import type { QuoteListItem } from "../hooks/quotes/useQuotes";

/** Migration 0129 is deliberately local until applied; generated DB types stay untouched. */
export interface QuotesPageRpcArgs {
  p_expected_organization_id: string;
  p_search: string | null;
  p_status: string;
  p_page: number;
  p_page_size: number;
  p_sort: { id: string; desc: boolean }[];
}
type RpcResult = { data: unknown; error: { message: string; code?: string } | null };
type RpcQuery = PromiseLike<RpcResult> & { abortSignal(signal: AbortSignal): PromiseLike<RpcResult> };
type PageRpc = (fn: "get_quotes_page", args: QuotesPageRpcArgs) => RpcQuery;

export function callQuotesPageRpc(args: QuotesPageRpcArgs, signal: AbortSignal) {
  // Same authenticated SDK client, without weakening the generated schema globally.
  const rpc = supabase.rpc.bind(supabase) as unknown as PageRpc;
  return rpc("get_quotes_page", args).abortSignal(signal);
}

const itemSchema = z.object({
  id: z.string().min(1), quote_number: z.string(), customer_id: z.string().nullable(),
  customer_name: z.string().nullable(), forklift_id: z.string().nullable(),
  start_date: z.string().nullable(), end_date: z.string().nullable(),
  subtotal: z.number(), tax_rate: z.number(), tax_amount: z.number(), total: z.number(),
  status: z.string(), valid_until: z.string().nullable(), quote_type: z.string(),
  currency: z.string(), tipo_cambio: z.number(),
}) satisfies z.ZodType<QuoteListItem>;
const pageSchema = z.object({
  items: z.array(itemSchema), totalCount: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
  pageIndex: z.number().int().nonnegative().max(100000),
});

/** Reject malformed/inconsistent payloads instead of displaying an invented empty result. */
export function parseQuotesPage(value: unknown, requestedPage: number, pageSize: number) {
  const parsed = pageSchema.safeParse(value);
  if (!parsed.success) throw new Error("La respuesta de cotizaciones no es válida. Reintenta la consulta.");
  const page = parsed.data;
  const expectedPage = Math.min(requestedPage, Math.max(0, Math.ceil(page.totalCount / pageSize) - 1));
  const expectedLength = Math.min(pageSize, page.totalCount - expectedPage * pageSize);
  if (page.pageIndex !== expectedPage || page.items.length !== expectedLength ||
      new Set(page.items.map((item) => item.id)).size !== page.items.length) {
    throw new Error("No se pudo verificar el total y la página de cotizaciones. Reintenta la consulta.");
  }
  return page;
}
