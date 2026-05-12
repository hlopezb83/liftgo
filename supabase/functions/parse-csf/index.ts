import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";

const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MB

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const cors = getCorsHeaders(req);
  const jsonHeaders = { ...cors, "Content-Type": "application/json" };

  try {
    // --- AuthN ---
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await callerClient.auth.getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }

    const { pdf_base64 } = await req.json();
    if (!pdf_base64 || typeof pdf_base64 !== "string") {
      return new Response(JSON.stringify({ error: "pdf_base64 es requerido" }), {
        status: 400,
        headers: jsonHeaders,
      });
    }
    // Approx size: base64 length * 3/4
    if (pdf_base64.length > Math.ceil(MAX_PDF_BYTES * 4 / 3)) {
      return new Response(JSON.stringify({ error: "El PDF excede el tamaño máximo permitido (5MB)" }), {
        status: 413,
        headers: jsonHeaders,
      });
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY no configurada" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const systemPrompt = `Eres un extractor de datos fiscales mexicanos. El usuario te enviará el contenido de una Constancia de Situación Fiscal (CSF) del SAT en formato PDF (como imagen base64).

Extrae los siguientes campos del documento y devuélvelos usando la función extract_csf_data:
- rfc: El RFC del contribuyente (13 caracteres para personas morales, 12 para personas físicas)
- name: La denominación o razón social (nombre de la empresa o persona)
- domicilio_fiscal_cp: El código postal del domicilio fiscal (5 dígitos)
- address: La dirección completa del domicilio fiscal (calle, número, colonia, municipio, estado)
- regimen_fiscal: El código numérico del régimen fiscal. Mapea el texto del régimen al código correspondiente:
  601 = General de Ley Personas Morales
  603 = Personas Morales con Fines no Lucrativos
  605 = Sueldos y Salarios
  606 = Arrendamiento
  608 = Demás ingresos
  610 = Residentes en el Extranjero
  612 = Personas Físicas con Actividades Empresariales y Profesionales
  614 = Ingresos por Intereses
  616 = Sin obligaciones fiscales
  620 = Sociedades Cooperativas de Producción
  621 = Incorporación Fiscal
  622 = Actividades Agrícolas, Ganaderas, Silvícolas y Pesqueras
  623 = Opcional para Grupos de Sociedades
  624 = Coordinados
  625 = Régimen de las Actividades Empresariales con ingresos a través de Plataformas Tecnológicas
  626 = Régimen Simplificado de Confianza
- representante_legal: El nombre del representante legal si aparece en el documento

Si un campo no se encuentra, devuelve una cadena vacía.`;

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: { url: `data:application/pdf;base64,${pdf_base64}` },
              },
              {
                type: "text",
                text: "Extrae los datos fiscales de esta Constancia de Situación Fiscal.",
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "extract_csf_data",
              description: "Devuelve los datos fiscales extraídos de la CSF",
              parameters: {
                type: "object",
                properties: {
                  rfc: { type: "string" },
                  name: { type: "string" },
                  domicilio_fiscal_cp: { type: "string" },
                  address: { type: "string" },
                  regimen_fiscal: { type: "string" },
                  representante_legal: { type: "string" },
                },
                required: ["rfc", "name", "domicilio_fiscal_cp", "address", "regimen_fiscal", "representante_legal"],
                additionalProperties: false,
              },
            },
          },
        ],
        tool_choice: { type: "function", function: { name: "extract_csf_data" } },
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("AI gateway error:", response.status, errText);
      if (response.status === 429) {
        return new Response(JSON.stringify({ error: "Demasiadas solicitudes, intenta de nuevo en un momento." }), {
          status: 429,
          headers: jsonHeaders,
        });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Créditos insuficientes para el servicio de IA." }), {
          status: 402,
          headers: jsonHeaders,
        });
      }
      return new Response(JSON.stringify({ error: "Error al procesar el documento con IA" }), {
        status: 500,
        headers: jsonHeaders,
      });
    }

    const aiResult = await response.json();
    const toolCall = aiResult.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall?.function?.arguments) {
      return new Response(JSON.stringify({ error: "No se pudieron extraer datos del documento" }), {
        status: 422,
        headers: jsonHeaders,
      });
    }

    const extracted = JSON.parse(toolCall.function.arguments);

    return new Response(JSON.stringify(extracted), { headers: jsonHeaders });
  } catch (e) {
    console.error("[parse-csf] error:", e);
    return new Response(JSON.stringify({ error: "Error interno del servidor" }), {
      status: 500,
      headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
