import type { Tables } from "@/integrations/supabase/types";

/**
 * Reglas de dominio para cotizaciones. Fuente única de verdad para
 * decidir edición, conversión y acciones desde el portal del cliente.
 */

type QuoteLike = Pick<Tables<"quotes">, "status"> & Partial<Pick<Tables<"quotes">, "accepted_at">>;

const EDITABLE_STATUSES = new Set(["draft", "sent"]);
// GUI-FE-01 (G-VEN-03): sólo una cotización ACEPTADA puede convertirse en
// reserva. Ofrecer "Convertir a Reserva" en draft/sent habilitaba el bypass
// de la aceptación del cliente (G-VEN-01).
const CONVERTIBLE_STATUSES = new Set(["accepted"]);

export function isQuoteEditable(quote: Pick<Tables<"quotes">, "status">): boolean {
  return EDITABLE_STATUSES.has(quote.status);
}

export function isQuoteAccepted(quote: QuoteLike): boolean {
  return quote.status === "accepted" || Boolean(quote.accepted_at);
}

export function canConvertQuote(
  quote: Pick<Tables<"quotes">, "status">,
  opts: { isSale: boolean; alreadyConverted: boolean },
): boolean {
  if (opts.isSale || opts.alreadyConverted) return false;
  return CONVERTIBLE_STATUSES.has(quote.status);
}

export function canActOnPortalQuote(quote: Pick<Tables<"quotes">, "status">): boolean {
  return quote.status === "sent";
}
