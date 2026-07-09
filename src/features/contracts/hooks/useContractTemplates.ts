import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { assertRowsAffected } from "@/lib/supabase/assertRowsAffected";
import { nowMty } from "@/lib/utils";
import { parseJsonbArray } from "@/lib/domain/lineItems";
import type { ContractClause, ChecklistSection } from "@/lib/domain/contractTypes";
import { useEntityMutation } from "@/lib/hooks/useEntityMutation";

// Re-export para compatibilidad con consumidores existentes. La fuente de
// verdad de estos tipos vive en `@/lib/domain/contractTypes`.
export type { ContractClause, ChecklistSection };


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
  return useEntityMutation({
    mutationFn: async (template: Partial<ContractTemplate> & { id: string }) => {
      const { id, ...rest } = template;
      const updatePayload = {
        ...rest,
        updated_at: nowMty().toISOString(),
      } as unknown as TablesUpdate<"contract_templates">;
      const { data, error } = await supabase
        .from("contract_templates")
        .update(updatePayload)
        .eq("id", id)
        .select("id");
      if (error) throw error;
      assertRowsAffected(data, "Actualizar plantilla de contrato");
    },
    invalidateKeys: [["contract_templates"]],
    errorTitle: "Error al actualizar plantilla",
  });
}
