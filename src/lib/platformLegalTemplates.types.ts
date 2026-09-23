import type { ChecklistSection, ContractClause } from "@/lib/domain/contractTypes";
import type { SerializableValue } from "./platformCatalog.types";

export interface LegalTemplateContent {
  body_text?: string | null;
  intro_text: string | null;
  declarations_landlord: string[];
  declarations_tenant: string[];
  clauses: ContractClause[];
  checklist_sections: ChecklistSection[];
  pagare_text: string | null;
}

export interface PlatformLegalTemplateRow {
  id: string;
  template_key: string;
  document_type: string;
  name: string;
  description: string | null;
  is_active: boolean;
  current_version_id: string | null;
  current_version: number | null;
  checksum_sha256: string | null;
  content: LegalTemplateContent;
  change_summary: string | null;
  version_count: number;
  assignment_count: number;
  active_organization_count: number;
  updated_at: string;
}

export interface PlatformLegalTemplateVersion {
  id: string;
  definition_id: string;
  version: number;
  checksum_sha256: string;
  content: LegalTemplateContent;
  change_summary: string | null;
  created_by: string | null;
  created_at: string;
}

export interface PlatformLegalTemplateAssignment {
  organization_id: string;
  organization_name: string;
  organization_slug: string;
  organization_is_active: boolean;
  version_id: string | null;
  version: number | null;
  checksum_sha256: string | null;
  local_overrides: Record<string, SerializableValue>;
  assignment_is_active: boolean;
  updated_at: string | null;
}

export interface PublishLegalTemplateVersionInput {
  definition_id: string;
  content: LegalTemplateContent;
  change_summary: string;
  assign_all_active: boolean;
}

export interface PublishLegalTemplateVersionResult {
  version_id: string;
  version: number;
  checksum_sha256: string;
}

export interface AssignLegalTemplateVersionInput {
  organization_id: string;
  definition_id: string;
  version_id: string;
}
