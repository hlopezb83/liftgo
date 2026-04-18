import { useMutation } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ParsedCsfData {
  name?: string;
  rfc?: string;
  domicilio_fiscal_cp?: string;
  address?: string;
  regimen_fiscal?: string;
  representante_legal?: string;
  error?: string;
}

async function fileToBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Procesa una Constancia de Situación Fiscal (CSF) en PDF y extrae datos
 * fiscales mediante el edge function `parse-csf`.
 */
export function useParseCsf() {
  return useMutation({
    mutationFn: async (file: File): Promise<ParsedCsfData> => {
      const base64 = await fileToBase64(file);
      const { data, error } = await supabase.functions.invoke("parse-csf", {
        body: { pdf_base64: base64 },
      });
      if (error) throw new Error(error.message || "Error al procesar CSF");
      if (data?.error) throw new Error(data.error);
      return data as ParsedCsfData;
    },
  });
}
