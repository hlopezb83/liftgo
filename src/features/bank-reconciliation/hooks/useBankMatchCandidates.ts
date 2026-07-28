import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

/**
 * Candidatos de emparejamiento para un movimiento bancario.
 *
 * A diferencia del picker anterior (que traía los 20 pagos más recientes sin
 * filtrar), la búsqueda ocurre en el servidor: filtra por monto (tolerancia),
 * ventana de fechas y texto, y devuelve el score con su desglose.
 */
export interface BankMatchCandidate {
  id: string;
  kind: "payment" | "supplier_payment";
  candidate_date: string;
  amount: number;
  reference: string | null;
  label: string;
  score: number;
  day_diff: number;
  exact_amount: boolean;
  reference_hit: boolean;
}

export const DATE_WINDOW_OPTIONS = [3, 7, 15, 30, 90] as const;
export type DateWindow = (typeof DATE_WINDOW_OPTIONS)[number];

interface Params {
  lineId: string | null;
  search: string;
  dateWindow: DateWindow;
  enabled?: boolean;
}

export function useBankMatchCandidates({ lineId, search, dateWindow, enabled = true }: Params) {
  return useQuery({
    queryKey: ["bank_match_candidates", lineId, search.trim().toLowerCase(), dateWindow] as const,
    staleTime: 15_000,
    enabled: enabled && !!lineId,
    queryFn: async (): Promise<BankMatchCandidate[]> => {
      if (!lineId) return [];
      const { data, error } = await supabase.rpc("get_bank_match_candidates", {
        p_line_id: lineId,
        p_search: search.trim() === "" ? undefined : search.trim(),
        p_date_window: dateWindow,
      });
      if (error) throw error;
      return (data ?? []).map((c) => ({
        id: c.id,
        kind: c.kind === "supplier_payment" ? "supplier_payment" : "payment",
        candidate_date: c.candidate_date,
        amount: Number(c.amount),
        reference: c.reference,
        label: c.label,
        score: Number(c.score),
        day_diff: Number(c.day_diff),
        exact_amount: c.exact_amount,
        reference_hit: c.reference_hit,
      }));
    },
  });
}
