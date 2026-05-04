import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { nowMty } from "@/lib/utils";
import { parseJsonbArray } from "@/lib/lineItems";

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
        declarations_landlord: parseJsonbArray<string>(data.declarations_landlord),
        declarations_tenant: parseJsonbArray<string>(data.declarations_tenant),
        clauses: parseJsonbArray<ContractClause>(data.clauses),
        checklist_sections: parseJsonbArray<ChecklistSection>(data.checklist_sections),
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
