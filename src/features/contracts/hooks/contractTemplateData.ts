import { supabase } from "@/integrations/supabase/client";
import type { Json } from "@/integrations/supabase/types";
import { parseJsonbArray } from "@/lib/domain/lineItems";
import {
  ContractTemplateUnavailableError,
  resolveSingleDefaultTemplate,
} from "../lib/contractTemplateResolution";
import {
  normalizeLegalTemplateOverrides,
  type LegalTemplateOverrides,
} from "../lib/legalTemplateOverrides";
import type { ContractClause, ChecklistSection } from "../lib/contractTypes";


export interface ContractTemplate {
  id: string;
  /** UUID de la definición legal (lo exige la RPC de datos legales). */
  definition_id: string;
  name: string;
  body_text: string;
  version: number;
  checksum_sha256: string;
  local_overrides: LegalTemplateOverrides;
  intro_text: string | null;
  declarations_landlord: string[];
  declarations_tenant: string[];
  clauses: ContractClause[];
  checklist_sections: ChecklistSection[];
  pagare_text: string | null;
}

type EffectiveTemplateContent = {
  body_text?: string | null;
  intro_text?: string | null;
  declarations_landlord?: Json | null;
  declarations_tenant?: Json | null;
  clauses?: Json | null;
  checklist_sections?: Json | null;
  pagare_text?: string | null;
};

/**
 * Subtramo 6.1: la plantilla se lee dentro de la organización verificada en
 * servidor (nunca un `organization_id` del navegador) y sin `limit(1)` global.
 * Mientras la organización no esté resuelta, la consulta queda deshabilitada.
 */
export async function fetchDefaultContractTemplate(
  _organizationId?: string,
): Promise<ContractTemplate | null> {
  const { data, error } = await supabase
    .rpc("get_effective_legal_template", { p_document_type: "rental_contract" });
  if (error) throw new ContractTemplateUnavailableError("read_error");
  const row = resolveSingleDefaultTemplate(data ?? []);
  if (!row) return null;
  const content = (row.content ?? {}) as EffectiveTemplateContent;
  return {
    id: row.version_id,
    definition_id: row.definition_id,
    name: row.template_name,
    body_text: content.body_text ?? "",
    version: row.version,
    checksum_sha256: row.checksum_sha256,
    local_overrides: normalizeLegalTemplateOverrides(row.local_overrides),
    intro_text: content.intro_text ?? null,
    declarations_landlord: parseJsonbArray<string>(content.declarations_landlord),
    declarations_tenant: parseJsonbArray<string>(content.declarations_tenant),
    clauses: parseJsonbArray<ContractClause>(content.clauses),
    checklist_sections: parseJsonbArray<ChecklistSection>(content.checklist_sections),
    pagare_text: content.pagare_text ?? null,
  };
}
