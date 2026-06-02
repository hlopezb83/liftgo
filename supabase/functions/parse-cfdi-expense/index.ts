import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { requireRole, enforceRateLimit } from "../_shared/auth.ts";

const MAX_XML_BYTES = 1024 * 1024; // 1 MB

type ExpenseCategory =
  | "renta" | "nomina" | "software" | "depreciacion"
  | "otro" | "costo_venta" | "caja_chica" | "publicidad";

const CATEGORIES: ExpenseCategory[] = [
  "renta", "nomina", "software", "depreciacion",
  "otro", "costo_venta", "caja_chica", "publicidad",
];

function attr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, "i");
  const m = tag.match(re);
  return m ? m[1] : null;
}

function findTag(xml: string, localName: string): string | null {
  // matches <(any:)?LocalName ... /> or opening tag
  const re = new RegExp(`<(?:[\\w-]+:)?${localName}\\b[^>]*\\/?>`, "i");
  const m = xml.match(re);
  return m ? m[0] : null;
}

function findAllTags(xml: string, localName: string): string[] {
  const re = new RegExp(`<(?:[\\w-]+:)?${localName}\\b[^>]*\\/?>`, "gi");
  return xml.match(re) ?? [];
}

interface ParsedCfdi {
  cfdi_uuid: string;
  total: number;
  subtotal: number;
  moneda: string;
  fecha: string; // YYYY-MM-DD
  folio: string;
  serie: string;
  emisor: { rfc: string; nombre: string; regimen_fiscal: string };
  conceptos: Array<{ descripcion: string; clave_prod_serv: string }>;
}

function parseCfdi(xml: string): ParsedCfdi {
  const comprobante = findTag(xml, "Comprobante");
  if (!comprobante) throw new Error("XML no es un CFDI válido (sin nodo Comprobante)");

  const tfd = findTag(xml, "TimbreFiscalDigital");
  const uuid = tfd ? attr(tfd, "UUID") : null;
  if (!uuid) throw new Error("CFDI sin timbre fiscal (UUID)");

  const emisorTag = findTag(xml, "Emisor");
  const conceptosTags = findAllTags(xml, "Concepto");

  const fechaRaw = attr(comprobante, "Fecha") ?? "";
  const fecha = fechaRaw.slice(0, 10);

  return {
    cfdi_uuid: uuid.toLowerCase(),
    total: Number(attr(comprobante, "Total") ?? "0"),
    subtotal: Number(attr(comprobante, "SubTotal") ?? "0"),
    moneda: attr(comprobante, "Moneda") ?? "MXN",
    fecha,
    folio: attr(comprobante, "Folio") ?? "",
    serie: attr(comprobante, "Serie") ?? "",
    emisor: {
      rfc: (emisorTag ? attr(emisorTag, "Rfc") : null) ?? "",
      nombre: (emisorTag ? attr(emisorTag, "Nombre") : null) ?? "",
      regimen_fiscal: (emisorTag ? attr(emisorTag, "RegimenFiscal") : null) ?? "",
    },
    conceptos: conceptosTags.map((t) => ({
      descripcion: attr(t, "Descripcion") ?? "",
      clave_prod_serv: attr(t, "ClaveProdServ") ?? "",
    })),
  };
}

async function classifyCategory(
  cfdi: ParsedCfdi,
  apiKey: string,
): Promise<ExpenseCategory> {
  const conceptosText = cfdi.conceptos
    .slice(0, 10)
    .map((c, i) => `${i + 1}. (${c.clave_prod_serv}) ${c.descripcion}`)
    .join("\n");

  const userMsg = `Emisor: ${cfdi.emisor.nombre} (Régimen ${cfdi.emisor.regimen_fiscal}).
Conceptos:
${conceptosText}`;

  const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "Clasificas gastos operativos de una empresa mexicana de renta de montacargas en exactamente una categoría: " +
            "renta (rentas de oficina/bodega), nomina (sueldos/honorarios/imss/sat retenciones), " +
            "software (licencias, SaaS), depreciacion (no aplica para CFDI), " +
            "costo_venta (refacciones, partes, reparaciones que se cobran al cliente), " +
            "caja_chica (gastos pequeños misceláneos), publicidad (marketing, ads), " +
            "otro (cualquier otra cosa). Usa la herramienta classify_expense.",
        },
        { role: "user", content: userMsg },
      ],
      tools: [{
        type: "function",
        function: {
          name: "classify_expense",
          description: "Devuelve la categoría sugerida.",
          parameters: {
            type: "object",
            properties: { category: { type: "string", enum: CATEGORIES } },
            required: ["category"],
            additionalProperties: false,
          },
        },
      }],
      tool_choice: { type: "function", function: { name: "classify_expense" } },
    }),
  });

  if (!resp.ok) {
    console.error("AI gateway error", resp.status, await resp.text().catch(() => ""));
    return "otro";
  }
  const data = await resp.json();
  const args = data?.choices?.[0]?.message?.tool_calls?.[0]?.function?.arguments;
  if (!args) return "otro";
  try {
    const parsed = JSON.parse(args);
    if (CATEGORIES.includes(parsed.category)) return parsed.category;
  } catch { /* ignore */ }
  return "otro";
}

serve(async (req) => {
  const corsResponse = handleCors(req);
  if (corsResponse) return corsResponse;
  const cors = getCorsHeaders(req);
  const jsonHeaders = { ...cors, "Content-Type": "application/json" };

  try {
    const auth = await requireRole(req, ["admin", "administrativo"]);
    if (!auth.ok) return auth.response;

    const limited = await enforceRateLimit(
      req, auth.adminClient, "parse-cfdi-expense", auth.userId, 20, 60,
    );
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    const xml: unknown = body?.xml;
    if (typeof xml !== "string" || xml.length === 0) {
      return new Response(JSON.stringify({ error: "xml es requerido" }), {
        status: 400, headers: jsonHeaders,
      });
    }
    if (xml.length > MAX_XML_BYTES) {
      return new Response(JSON.stringify({ error: "XML excede 1MB" }), {
        status: 413, headers: jsonHeaders,
      });
    }

    let cfdi: ParsedCfdi;
    try {
      cfdi = parseCfdi(xml);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "XML inválido";
      return new Response(JSON.stringify({ error: msg }), {
        status: 400, headers: jsonHeaders,
      });
    }

    // Verificar duplicado
    const { data: existing } = await auth.adminClient
      .from("operating_expenses")
      .select("id, expense_date, amount")
      .eq("cfdi_uuid", cfdi.cfdi_uuid)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({
        duplicate: true,
        existing_id: existing.id,
        cfdi_uuid: cfdi.cfdi_uuid,
      }), { headers: jsonHeaders });
    }

    // Match proveedor por RFC
    let supplier_match: { id: string; name: string } | null = null;
    if (cfdi.emisor.rfc) {
      const { data: sup } = await auth.adminClient
        .from("suppliers")
        .select("id, name")
        .ilike("rfc", cfdi.emisor.rfc)
        .maybeSingle();
      if (sup) supplier_match = { id: sup.id, name: sup.name };
    }

    // Clasificar categoría
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    let categoria_sugerida: ExpenseCategory = "otro";
    if (LOVABLE_API_KEY) {
      try {
        categoria_sugerida = await classifyCategory(cfdi, LOVABLE_API_KEY);
      } catch (e) {
        console.error("classify error", e);
      }
    }

    const conceptos_resumen = cfdi.conceptos.length > 0
      ? cfdi.conceptos.slice(0, 3).map((c) => c.descripcion).join(" · ").slice(0, 240)
      : "";

    const description = [
      cfdi.serie || cfdi.folio ? `Factura ${[cfdi.serie, cfdi.folio].filter(Boolean).join("-")}` : "Factura",
      conceptos_resumen ? `— ${conceptos_resumen}` : "",
    ].filter(Boolean).join(" ").trim();

    return new Response(JSON.stringify({
      duplicate: false,
      cfdi_uuid: cfdi.cfdi_uuid,
      folio: cfdi.folio,
      serie: cfdi.serie,
      total: cfdi.total,
      subtotal: cfdi.subtotal,
      moneda: cfdi.moneda,
      fecha: cfdi.fecha,
      emisor: cfdi.emisor,
      description,
      conceptos_resumen,
      categoria_sugerida,
      supplier_match,
    }), { headers: jsonHeaders });
  } catch (e) {
    console.error("parse-cfdi-expense error", e);
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...cors, "Content-Type": "application/json" },
    });
  }
});
