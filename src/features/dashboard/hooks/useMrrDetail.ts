import { useQuery } from "@tanstack/react-query";
import { todayKeyMty } from "@/lib/format/dateFormats";
import { roundMoney } from "@/lib/money";
import { callRpc } from "@/lib/rpc";

export interface MrrItem {
  forklift_id: string;
  forklift_name: string;
  model: string;
  manufacturer: string | null;
  serial_number: string | null;
  monthly_rate: number;
  daily_rate: number;
  weekly_rate: number;
  customer_name: string | null;
  customer_id: string | null;
  booking_number: string | null;
  start_date: string | null;
  end_date: string | null;
}

interface MrrDetail {
  items: MrrItem[];
  total_mrr: number;
}

export function useMrrDetail() {
  const dateKey = todayKeyMty();

  return useQuery({
    queryKey: ["mrr-detail", dateKey],
    queryFn: async (): Promise<MrrDetail> => {
      const result = await callRpc<MrrDetail>("get_mrr_detail");
      return {
        items: result?.items ?? [],
        total_mrr: roundMoney(result?.total_mrr ?? 0),
      };
    },
  });
}
