import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ContractClause {
  title: string;
  body: string;
}

export interface ChecklistSection {
  title: string;
  items: string[];
}

export interface ContractTemplate {
  id: string;
  name: string;
  body_text: string;
  is_default: boolean;
  intro_text: string | null;
  declarations_landlord: string[];
  declarations_tenant: string[];
  clauses: ContractClause[];
  checklist_sections: ChecklistSection[];
  pagare_text: string | null;
  updated_at: string | null;
}

export function useDefaultContractTemplate() {
  return useQuery({
    queryKey: ["contract_templates", "default"],
    staleTime: 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("contract_templates")
        .select("*")
        .eq("is_default", true)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      if (!data) return null;
      return {
        ...data,
        declarations_landlord: (data.declarations_landlord ?? []) as unknown as string[],
        declarations_tenant: (data.declarations_tenant ?? []) as unknown as string[],
        clauses: (data.clauses ?? []) as unknown as ContractClause[],
        checklist_sections: (data.checklist_sections ?? []) as unknown as ChecklistSection[],
      } as ContractTemplate;
    },
  });
}

export function useUpdateContractTemplate() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (template: Partial<ContractTemplate> & { id: string }) => {
      const { id, ...rest } = template;
      const { error } = await supabase
        .from("contract_templates")
        .update({
          ...rest,
          updated_at: nowMty().toISOString(),
        } as Record<string, unknown>)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["contract_templates"] });
    },
  });
}
