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
  tax_amount: number;
  retention_iva: number;
  retention_isr: number;
  moneda: string;
  tipo_cambio: number;
  payment_method_sat: string;
  fecha: string;
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

  // Impuestos totales
  const impuestosTag = findTag(xml, "Impuestos");
  const trasladosTotales = impuestosTag ? Number(attr(impuestosTag, "TotalImpuestosTrasladados") ?? "0") : 0;
  const retencionesIvaTotales = (() => {
    if (!impuestosTag) return 0;
    // Try totalImpuestosRetenidos as approximation, then refine via Retenciones if needed
    return Number(attr(impuestosTag, "TotalImpuestosRetenidos") ?? "0");
  })();

  // Distinguir retenciones IVA / ISR
  let retIva = 0;
  let retIsr = 0;
  const retencionesTags = findAllTags(xml, "Retencion");
  for (const t of retencionesTags) {
    const impuesto = attr(t, "Impuesto");
    const importe = Number(attr(t, "Importe") ?? "0");
    if (impuesto === "002") retIva += importe;
    else if (impuesto === "001") retIsr += importe;
  }
  if (retIva === 0 && retIsr === 0 && retencionesIvaTotales > 0) {
    retIva = retencionesIvaTotales;
  }

  return {
    cfdi_uuid: uuid.toLowerCase(),
    total: Number(attr(comprobante, "Total") ?? "0"),
    subtotal: Number(attr(comprobante, "SubTotal") ?? "0"),
    tax_amount: trasladosTotales,
    retention_iva: retIva,
    retention_isr: retIsr,
    moneda: attr(comprobante, "Moneda") ?? "MXN",
    tipo_cambio: Number(attr(comprobante, "TipoCambio") ?? "1"),
    payment_method_sat: attr(comprobante, "MetodoPago") ?? "PUE",
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
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-3-flash-preview",
      messages: [
        {
          role: "system",
          content:
            "Clasificas gastos operativos de una empresa mexicana de renta de montacargas en exactamente una categoría: " +
            "renta, nomina, software, depreciacion (no aplica para CFDI), " +
            "costo_venta (refacciones, partes, reparaciones), caja_chica, publicidad, otro. " +
            "Usa la herramienta classify_expense.",
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

function addDays(ymd: string, days: number): string {
  const d = new Date(ymd + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
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
    const create: boolean = body?.create === true;
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

    // Duplicate by UUID in supplier_bills
    const { data: existing } = await auth.adminClient
      .from("supplier_bills")
      .select("id, bill_number, issue_date, total")
      .eq("cfdi_uuid", cfdi.cfdi_uuid)
      .maybeSingle();

    if (existing) {
      return new Response(JSON.stringify({
        duplicate: true,
        existing_id: existing.id,
        bill_number: existing.bill_number,
        cfdi_uuid: cfdi.cfdi_uuid,
      }), { headers: jsonHeaders });
    }

    // Match supplier by RFC (auto-create if missing)
    let supplier_id: string | null = null;
    let supplier_match: { id: string; name: string } | null = null;
    if (cfdi.emisor.rfc) {
      const rfc = cfdi.emisor.rfc.toUpperCase();
      const { data: sup } = await auth.adminClient
        .from("suppliers")
        .select("id, name")
        .ilike("rfc", rfc)
        .maybeSingle();
      if (sup) {
        supplier_id = sup.id;
        supplier_match = { id: sup.id, name: sup.name };
      } else if (create) {
        const { data: created, error: supErr } = await auth.adminClient
          .from("suppliers")
          .insert({
            name: cfdi.emisor.nombre || rfc,
            rfc,
          })
          .select("id, name")
          .single();
        if (supErr) {
          console.error("supplier create failed", supErr);
        } else if (created) {
          supplier_id = created.id;
          supplier_match = { id: created.id, name: created.name };
        }
      }
    }

    // Classify category
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

    const due_date = cfdi.payment_method_sat === "PPD"
      ? addDays(cfdi.fecha, 30)
      : cfdi.fecha;

    // Preview mode: just return parsed payload
    if (!create) {
      return new Response(JSON.stringify({
        duplicate: false,
        cfdi_uuid: cfdi.cfdi_uuid,
        folio: cfdi.folio,
        serie: cfdi.serie,
        total: cfdi.total,
        subtotal: cfdi.subtotal,
        tax_amount: cfdi.tax_amount,
        retention_iva: cfdi.retention_iva,
        retention_isr: cfdi.retention_isr,
        moneda: cfdi.moneda,
        tipo_cambio: cfdi.tipo_cambio,
        payment_method_sat: cfdi.payment_method_sat,
        fecha: cfdi.fecha,
        due_date,
        emisor: cfdi.emisor,
        description,
        conceptos_resumen,
        categoria_sugerida,
        supplier_match,
      }), { headers: jsonHeaders });
    }

    // Create supplier_bill
    const { data: bill, error: billErr } = await auth.adminClient
      .from("supplier_bills")
      .insert({
        supplier_id,
        cfdi_uuid: cfdi.cfdi_uuid,
        folio: cfdi.folio || null,
        serie: cfdi.serie || null,
        issue_date: cfdi.fecha,
        due_date,
        subtotal: cfdi.subtotal,
        tax_amount: cfdi.tax_amount,
        retention_iva: cfdi.retention_iva,
        retention_isr: cfdi.retention_isr,
        total: cfdi.total,
        currency: cfdi.moneda,
        exchange_rate: cfdi.tipo_cambio || 1,
        payment_method_sat: cfdi.payment_method_sat,
        category: categoria_sugerida,
        description,
        status: "pending",
        created_by: auth.userId,
      })
      .select("id, bill_number")
      .single();

    if (billErr) {
      console.error("bill insert error", billErr);
      return new Response(JSON.stringify({ error: billErr.message }), {
        status: 500, headers: jsonHeaders,
      });
    }

    return new Response(JSON.stringify({
      created: true,
      bill_id: bill.id,
      bill_number: bill.bill_number,
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
