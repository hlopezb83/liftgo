import { useQuery } from "@tanstack/react-query";
import { dateKeyToday, financialKpisQueries } from "../lib/queryKeys";

export type { FinancialKpis } from "../lib/queryKeys";

// R14-L: `enabled` permite gatear por rol — el RPC solo admite admin/
// administrativo/auditor; sin esto ventas/dispatcher/mechanic ven "Forbidden".
export function useFinancialKpis(enabled = true) {
  const dateKey = dateKeyToday();
  return useQuery({ ...financialKpisQueries.list({ dateKey }), enabled });
}
