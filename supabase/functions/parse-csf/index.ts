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

    const systemPrompt =
      `Eres un extractor de datos fiscales mexicanos. El usuario te enviará el contenido de una Constancia de Situación Fiscal (CSF) del SAT en formato PDF (como imagen base64).

Extrae los siguientes campos del documento y devuélvelos usando la función extract_csf_data:
- rfc: El RFC del contribuyente (13 caracteres para personas morales, 12 para personas físicas). En MAYÚSCULAS.
- name: La denominación o razón social SIN el sufijo de régimen societario. Omite "S.A. de C.V.", "S. de R.L. de C.V.", "SAPI de C.V.", "S.A.B. de C.V.", "S.C.", "A.C.", "SOCIEDAD ANÓNIMA DE CAPITAL VARIABLE", "SOCIEDAD DE RESPONSABILIDAD LIMITADA", y variantes equivalentes. Devuelve en MAYÚSCULAS y sin acentos.
- domicilio_fiscal_cp: El código postal del domicilio fiscal (5 dígitos)
- address: La dirección completa del domicilio fiscal (calle, número, colonia, municipio, estado)
- regimen_fiscal: El código numérico del régimen fiscal (601, 603, 605, 606, 608, 610, 612, 614, 616, 620, 621, 622, 623, 624, 625, 626).
- representante_legal: El nombre del representante legal si aparece en el documento

Si un campo no se encuentra, devuelve una cadena vacía.`;

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
