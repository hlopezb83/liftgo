/**
 * Tipos del dominio Prospects.
 *
 * - `ProspectRow`: shape crudo tal como llega de la tabla `prospects` (snake_case).
 *   Se usa para payloads de DB (insert/update) y dentro del mapper.
 * - `Prospect`: view model camelCase con campos derivados ya formateados
 *   para consumo directo por la UI.
 */

export interface ProspectRow {
  id: string;
  company_name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  deal_value: number;
  stage: string;
  notes: string | null;
  stage_order: number;
  quote_id: string | null;
  customer_id: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  closed_at: string | null;
  lost_reason: string | null;
  final_amount: number | null;
}

export interface Prospect {
  id: string;
  companyName: string;
  contactPerson: string | null;
  email: string | null;
  phone: string | null;
  dealValue: number;
  dealValueLabel: string;
  stage: string;
  stageOrder: number;
  notes: string | null;
  quoteId: string | null;
  customerId: string | null;
  createdBy: string | null;
  createdByName: string | null;
  createdAt: string;
  createdAtLabel: string;
  updatedAt: string;
  staleDays: number;
  isStale: boolean;
  isClosed: boolean;
  closedAt: string | null;
  closedAtLabel: string | null;
  lostReason: string | null;
  finalAmount: number | null;
}

export const CLOSED_STAGES = new Set(["cerrado_ganado", "cerrado_perdido"]);
