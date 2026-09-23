import { useMutation } from "@tanstack/react-query";
import { invokeEdgeFunction } from "@/lib/supabase/invokeEdgeFunction";

export interface ParsedCsfData {
  name?: string;
  razon_social?: string;
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
      return invokeEdgeFunction<ParsedCsfData>("parse-csf", {
        body: { pdf_base64: base64 },
      });
    },
  });
}

