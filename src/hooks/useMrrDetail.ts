import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

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
  return useQuery({
    queryKey: ["mrr-detail"],
    queryFn: async (): Promise<MrrDetail> => {
      const { data, error } = await supabase.rpc("get_mrr_detail");
      if (error) throw error;
      const result = data as unknown as MrrDetail;
      return {
        items: result.items ?? [],
        total_mrr: result.total_mrr ?? 0,
      };
    },
  });
}
