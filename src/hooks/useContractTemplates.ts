import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export function useDefaultContractTemplate() {
  return useQuery({
    queryKey: ["contract_templates", "default"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_templates" as any)
        .select("*")
        .eq("is_default", true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as unknown as { id: string; name: string; body_text: string } | null;
    },
  });
}
