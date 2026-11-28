import type { SupportListInput } from "@/lib/support/platformSupport.types";
import type { PlatformAuditInput } from "./platformAudit.types";
import type {
  CatalogImportKind,
  CatalogImportPreviewInput,
} from "./platformCatalogImport.types";
import type { FiscalJobsInput } from "./platformFiscalJobs.types";

export const platformKeys = {
  all: ["platform"] as const,
  access: (userId?: string) => [...platformKeys.all, "access", userId] as const,
  operator: (userId?: string) => [...platformKeys.all, "operator", userId] as const,
  session: (userId?: string) => [...platformKeys.all, "session", userId] as const,
  organizations: () => [...platformKeys.all, "organizations"] as const,
  pendingOnboarding: (offset: number) =>
    [...platformKeys.all, "pending-onboarding", offset] as const,
  operators: {
    all: ["platform", "operators"] as const,
    list: (scope: "operators" | "eligible", search: string, offset: number) =>
      ["platform", "operators", scope, search, offset] as const,
  },
  organizationGovernance: {
    all: ["platform", "organization-governance"] as const,
    detail: (id: string) => ["platform", "organization-governance", id] as const,
  },
  readModels: {
    all: ["platform", "read-models"] as const,
    detail: (id: string) =>
      ["platform", "read-models", "organization", id] as const,
    audit: (input: PlatformAuditInput) =>
      ["platform", "read-models", "audit", input] as const,
  },
  audit: {
    all: ["platform", "read-models", "audit"] as const,
  },
  equipmentCatalog: () => [...platformKeys.all, "equipment-model-catalog"] as const,
  partsCatalog: () => [...platformKeys.all, "parts-catalog"] as const,
  legalTemplates: {
    all: ["platform", "legal-templates"] as const,
    versions: (definitionId: string) =>
      ["platform", "legal-templates", definitionId, "versions"] as const,
    assignments: (definitionId: string) =>
      ["platform", "legal-templates", definitionId, "assignments"] as const,
  },
  catalogImport: {
    all: ["platform", "catalog-import"] as const,
    list: (kind: CatalogImportKind, offset: number) =>
      ["platform", "catalog-import", "list", kind, offset] as const,
    preview: (input: CatalogImportPreviewInput) =>
      ["platform", "catalog-import", "preview", input.kind, input.source_id] as const,
  },
  health: {
    all: ["platform", "health"] as const,
    monitoring: () => ["platform", "health", "monitoring"] as const,
    integrations: (search: string, offset: number) =>
      ["platform", "health", "integrations", search, offset] as const,
  },
  fiscalJobs: {
    all: ["platform", "fiscal-jobs"] as const,
    list: (filters: FiscalJobsInput) =>
      ["platform", "fiscal-jobs", "list", filters] as const,
    detail: (jobId: string) =>
      ["platform", "fiscal-jobs", "detail", jobId] as const,
    actions: (jobId: string) =>
      ["platform", "fiscal-jobs", "actions", jobId] as const,
  },
  support: {
    all: ["platform", "support"] as const,
    list: (filters: SupportListInput) =>
      ["platform", "support", "list", filters] as const,
    detail: (caseId: string) =>
      ["platform", "support", "detail", caseId] as const,
  },
} as const;
