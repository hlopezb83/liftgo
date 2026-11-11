import type { ContractClause, ChecklistSection, LegalTemplateOverrides } from "@/lib/domain/contractTypes";
import type { ContractViewModel } from "@/types/rental";

export type ContractData = Pick<ContractViewModel,
  | "id"
  | "contract_number" | "booking_id" | "customer_id" | "forklift_id" | "start_date" | "end_date"
  | "daily_rate" | "weekly_rate" | "monthly_rate" | "deposit_amount" | "terms_text"
  | "status" | "signed_at" | "signed_by" | "usage_location" | "max_hours_per_month"
  | "extra_hour_rate" | "payment_frequency" | "late_interest_rate" | "contract_city"
  | "witness_1" | "witness_2"
> & {
  customer_name?: string | null;
  /**
   * A6R2-3: copia inmutable capturada al firmar (cliente, unidad y plantilla).
   * Cuando existe, el PDF del contrato firmado se rinde desde aquí para que no
   * cambie si después se editan el cliente, la unidad o la plantilla.
   */
  signed_snapshot?: unknown;
};

export interface TemplateData {
  intro_text: string | null;
  declarations_landlord: string[];
  declarations_tenant: string[];
  clauses: ContractClause[];
  checklist_sections: ChecklistSection[];
  pagare_text: string | null;
  local_overrides: LegalTemplateOverrides;
}
