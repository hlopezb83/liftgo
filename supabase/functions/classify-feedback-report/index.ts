import { z } from "https://esm.sh/zod@4.4.3";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { requireRole } from "../_shared/auth.ts";
import { aiChatCompletion, AiGatewayError } from "../_shared/ai.ts";

const SEVERITIES = ["critical", "high", "medium", "low"] as const;
const MODULES = [
  "Dashboard",
  "Calendario",
  "CRM",
  "Clientes",
  "Cotizaciones",
  "Reservas",
  "Contratos",
  "Entregas",
  "Devoluciones",
  "Facturas",
  "Equipos / Flota",
  "Mantenimiento",
  "Daños",
  "Refacciones",
  "Proveedores",
  "Gastos Operativos",
  "Estado de Resultados",
  "Reportes",
  "Actividad",
  "Bitácora",
  "Configuración",
  "Gestión de Usuarios",
  "Changelog",
  "Ayuda",
  "Panel del Cliente",
  "Mis Rentas",
  "Mis Facturas",
  "Mis Contratos",
  "Otro / General",
] as const;

const BodySchema = z.object({ report_id: z.uuid() });

const ClassificationSchema = z.object({
  severity: z.enum(SEVERITIES),
  module: z.enum(MODULES),
  reasoning: z.string().min(5).max(400),
});

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    // LOVABLE_API_KEY se valida dentro de aiChatCompletion; no duplicar aquí.

    const auth = await requireRole(req, ["admin", "administrativo"]);
    if (!auth.ok) return auth.response;
    const admin = auth.adminClient;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return jsonError(req, 400, "Invalid body", {
        detail: z.treeifyError(parsed.error),
      });
    }

    const { data: report, error: reportErr } = await admin
      .from("feedback_reports")
      .select("*")
      .eq("id", parsed.data.report_id)
      .maybeSingle();
    if (reportErr || !report) {
      return jsonError(req, 404, "Reporte no encontrado");
    }

    const ctx = (report.context_json ?? {}) as Record<string, unknown>;
    const selectedEl = ctx.selected_element as
      | Record<string, unknown>
      | undefined;
    const isPortal = report.reporter_type === "customer";
    const moduleHint = isPortal
      ? MODULES.filter((m) =>
        m.startsWith("Mis ") || m.startsWith("Panel") || m === "Otro / General"
      )
      : MODULES.filter((m) =>
        !m.startsWith("Mis ") && !m.startsWith("Panel del")
      );

    const prompt =
      `Eres un clasificador de reportes de bugs/mejoras para un ERP de renta de montacargas en español mexicano.

Reporte:
- Tipo: ${report.type}
- Título: ${report.title}
- Descripción: ${report.description}
- URL: ${ctx.route ?? "desconocida"}
- Reportero: ${report.reporter_type}
${
        selectedEl
          ? `- Elemento señalado: <${selectedEl.tagName}> "${selectedEl.text}" (selector: ${selectedEl.cssPath})`
          : ""
      }

Criterios de severidad (para bugs):
- critical: bloquea operación, pérdida de datos, problema fiscal/legal, sistema caído.
- high: función importante no funciona, workaround difícil, afecta a muchos usuarios.
- medium: función secundaria con error, hay workaround claro.
- low: cosmético, tipográfico, mejora menor.
Para mejoras (type=improvement) usa medium o low según impacto percibido.

Módulos posibles: ${moduleHint.join(", ")}
Elige el módulo más probable basándote en la URL y la descripción. Si nada encaja, usa "Otro / General".

Responde estrictamente con JSON: {"severity": "...", "module": "...", "reasoning": "1-2 frases en español"}`;

    let rawContent = "";
    try {
      const { text } = await aiChatCompletion({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content:
              "Devuelve únicamente JSON válido. Sin markdown, sin explicación adicional.",
          },
          { role: "user", content: prompt },
        ],
        responseFormat: { type: "json_object" },
      });
      rawContent = text ?? "";
    } catch (aiErr) {
      if (aiErr instanceof AiGatewayError) {
        return jsonError(req, aiErr.status, aiErr.message);
      }
      throw aiErr;
    }

    let classification: z.infer<typeof ClassificationSchema>;
    try {
      const parsedAi = JSON.parse(rawContent);
      classification = ClassificationSchema.parse(parsedAi);
    } catch (parseErr) {
      console.error("[classify-feedback] parse fail", parseErr, rawContent);
      return jsonError(req, 502, "Respuesta de AI inválida");
    }

    const newContext = {
      ...ctx,
      ai_classification: {
        severity: classification.severity,
        module: classification.module,
        reasoning: classification.reasoning,
        model: "google/gemini-2.5-flash",
        classified_at: new Date().toISOString(),
      },
    };

    const { data: updated, error: updateErr } = await admin
      .from("feedback_reports")
      .update({
        severity: report.type === "bug"
          ? classification.severity
          : classification.severity,
        module: classification.module,
        context_json: newContext,
      })
      .eq("id", report.id)
      .select()
      .single();

    if (updateErr) {
      return jsonError(req, 500, updateErr.message);
    }

    return jsonResponse(req, { report: updated, classification });
  } catch (err) {
    console.error("[classify-feedback] fatal", err);
    return jsonError(req, 500, err instanceof Error ? err.message : "unknown");
  }
});
