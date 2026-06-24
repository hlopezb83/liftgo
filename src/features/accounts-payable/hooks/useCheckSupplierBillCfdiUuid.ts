import { supabase } from "@/integrations/supabase/client";

export interface CfdiUuidDuplicate {
  id: string;
  bill_number: string;
}

export async function checkSupplierBillCfdiUuid(
  uuid: string,
): Promise<CfdiUuidDuplicate | null> {
  const { data, error } = await supabase
    .from("supplier_bills")
    .select("id, bill_number")
    .eq("cfdi_uuid", uuid)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}
