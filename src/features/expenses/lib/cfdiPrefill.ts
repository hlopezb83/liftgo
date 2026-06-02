import type { ExpenseCategory } from "@/features/expenses/hooks/useOperatingExpenses";

export interface CfdiPrefill {
  cfdi_uuid: string;
  folio: string;
  serie: string;
  total: number;
  moneda: string;
  fecha: string; // YYYY-MM-DD
  emisor: { rfc: string; nombre: string; regimen_fiscal: string };
  description: string;
  categoria_sugerida: ExpenseCategory;
  supplier_match: { id: string; name: string } | null;
}

export interface CfdiParseResponse extends CfdiPrefill {
  duplicate: false;
}

export interface CfdiDuplicateResponse {
  duplicate: true;
  existing_id: string;
  cfdi_uuid: string;
}

export type CfdiParseResult = CfdiParseResponse | CfdiDuplicateResponse;
