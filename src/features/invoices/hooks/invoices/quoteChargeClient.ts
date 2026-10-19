import { createClient } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";
import type { Database, Json } from "@/integrations/supabase/types";

// Reviewed migration 0107 contract, deliberately separate from generated
// types. This declares the request, not that the function is already deployed.
type QuoteChargeDatabase = Omit<Database, "public"> & {
  public: Omit<Database["public"], "Functions"> & {
    Functions: Database["public"]["Functions"] & {
      get_quote_charge_availability: {
        Args: { p_quote_ids: string[]; p_exclude_invoice_id?: string };
        Returns: Json;
      };
    };
  };
};

export function createQuoteChargeClient() {
  return createClient<QuoteChargeDatabase>(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      accessToken: async () => {
        const { data, error } = await supabase.auth.getSession();
        if (error) throw error;
        return data.session?.access_token ?? null;
      },
    },
  );
}