import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { enforceRateLimit, requireRole } from "../_shared/auth.ts";
import { aiChatCompletion, AiGatewayError } from "../_shared/ai.ts";

const MAX_PDF_BYTES = 5 * 1024 * 1024; // 5 MB

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;

  try {
    // --- AuthN + role check (back-office only) ---
    const auth = await requireRole(req, [
      "admin",
      "administrativo",
      "dispatcher",
      "ventas",
    ]);
    if (!auth.ok) return auth.response;

    const limited = await enforceRateLimit(
      req,
      auth.adminClient,
      "parse-csf",
      auth.userId,
      5,
      60,
    );
    if (limited) return limited;

    const { pdf_base64 } = await req.json();
    if (!pdf_base64 || typeof pdf_base64 !== "string") {
      return jsonError(req, 400, "pdf_base64 es requerido");
    }
    // Approx size: base64 length * 3/4
    if (pdf_base64.length > Math.ceil(MAX_PDF_BYTES * 4 / 3)) {
      return jsonError(
        req,
        413,
        "El PDF excede el tamaño máximo permitido (5MB)",
      );
    }

    try {
      const { toolArguments } = await aiChatCompletion({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:application/pdf;base64,${pdf_base64}`,
                },
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
                required: [
                  "rfc",
                  "name",
                  "domicilio_fiscal_cp",
                  "address",
                  "regimen_fiscal",
                  "representante_legal",
                ],
                additionalProperties: false,
              },
            },
          },
        ],
        toolChoice: {
          type: "function",
          function: { name: "extract_csf_data" },
        },
      });

      if (!toolArguments) {
        return jsonError(req, 422, "No se pudieron extraer datos del documento");
      }
      return jsonResponse(req, toolArguments);
    } catch (aiErr) {
      if (aiErr instanceof AiGatewayError) {
        return jsonError(req, aiErr.status, aiErr.message);
      }
      throw aiErr;
    }
  } catch (e) {
    console.error("[parse-csf] error:", e);
    return jsonError(req, 500, "Error interno del servidor");
  }
});
