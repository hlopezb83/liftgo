import { z } from "https://esm.sh/zod@3.23.8";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { requireRole } from "../_shared/auth.ts";

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

const BodySchema = z.object({ report_id: z.string().uuid() });

const ClassificationSchema = z.object({
  severity: z.enum(SEVERITIES),
  module: z.enum(MODULES),
  reasoning: z.string().min(5).max(400),
});

Deno.serve(async (req) => {
  const cors = handleCors(req);
  if (cors) return cors;

  try {
    const lovableKey = Deno.env.get("LOVABLE_API_KEY");
    if (!lovableKey) {
      return jsonError(req, 500, "LOVABLE_API_KEY no configurada");
    }

    const auth = await requireRole(req, ["admin", "administrativo"]);
    if (!auth.ok) return auth.response;
    const admin = auth.adminClient;

    const parsed = BodySchema.safeParse(await req.json());
    if (!parsed.success) {
      return jsonError(req, 400, "Invalid body", { detail: parsed.error.flatten() });
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

    const aiResp = await fetch(
      "https://ai.gateway.lovable.dev/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${lovableKey}`,
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content:
                "Devuelve únicamente JSON válido. Sin markdown, sin explicación adicional.",
            },
            { role: "user", content: prompt },
          ],
          response_format: { type: "json_object" },
        }),
      },
    );

    if (!aiResp.ok) {
      const errText = await aiResp.text();
      if (aiResp.status === 429) {
        return new Response(
          JSON.stringify({
            error: "Rate limit excedido, intenta de nuevo en unos segundos",
          }),
          { status: 429, headers },
        );
      }
      if (aiResp.status === 402) {
        return new Response(
          JSON.stringify({ error: "Créditos de AI agotados" }),
          { status: 402, headers },
        );
      }
      return new Response(
        JSON.stringify({ error: `AI gateway error: ${errText.slice(0, 200)}` }),
        { status: 500, headers },
      );
    }

    const aiJson = await aiResp.json();
    const rawContent = aiJson?.choices?.[0]?.message?.content ?? "";
    let classification: z.infer<typeof ClassificationSchema>;
    try {
      const parsedAi = JSON.parse(rawContent);
      classification = ClassificationSchema.parse(parsedAi);
    } catch (parseErr) {
      console.error("[classify-feedback] parse fail", parseErr, rawContent);
      return new Response(
        JSON.stringify({ error: "Respuesta de AI inválida" }),
        { status: 502, headers },
      );
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
      return new Response(JSON.stringify({ error: updateErr.message }), {
        status: 500,
        headers,
      });
    }

    return new Response(JSON.stringify({ report: updated, classification }), {
      status: 200,
      headers,
    });
  } catch (err) {
    console.error("[classify-feedback] fatal", err);
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "unknown" }),
      { status: 500, headers },
    );
  }
});
