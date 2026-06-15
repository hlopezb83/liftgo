/**
 * Tipos del dominio Prospects.
 *
 * - `ProspectRow`: shape crudo tal como llega de la tabla `prospects`,
 *   derivado del tipo generado por Supabase para mantenerse sincronizado
 *   con la migración de DB sin requerir casts.
 * - `Prospect`: view model camelCase con campos derivados ya formateados
 *   para consumo directo por la UI.
 */

import type { Tables } from "@/integrations/supabase/types";

export type ProspectRow = Tables<"prospects">;

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
