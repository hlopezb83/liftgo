import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { enforceRateLimit, requireRole } from "../_shared/auth.ts";
import { aiChatCompletion } from "../_shared/ai.ts";
import {
  CATEGORIES,
  type ExpenseCategory,
  parseCfdi,
  type ParsedCfdi,
} from "./cfdi-parser.ts";

const MAX_XML_BYTES = 1024 * 1024; // 1 MB

async function classifyCategory(
  cfdi: ParsedCfdi,
  _apiKey: string,
): Promise<ExpenseCategory> {
  const conceptosText = cfdi.conceptos
    .slice(0, 10)
    .map((c, i) => `${i + 1}. (${c.clave_prod_serv}) ${c.descripcion}`)
    .join("\n");

  const userMsg =
    `Emisor: ${cfdi.emisor.nombre} (Régimen ${cfdi.emisor.regimen_fiscal}).
Conceptos:
${conceptosText}`;

  try {
    const { toolArguments } = await aiChatCompletion({
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
      toolChoice: {
        type: "function",
        function: { name: "classify_expense" },
      },
    });
    const cat = toolArguments?.category;
    if (
      typeof cat === "string" && (CATEGORIES as readonly string[]).includes(cat)
    ) {
      return cat as ExpenseCategory;
    }
  } catch (e) {
    console.error("[parse-cfdi-expense] AI classify fallback:", e);
  }
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

  try {
    const auth = await requireRole(req, ["admin", "administrativo"]);
    if (!auth.ok) return auth.response;

    const limited = await enforceRateLimit(
      req,
      auth.adminClient,
      "parse-cfdi-expense",
      auth.userId,
      20,
      60,
    );
    if (limited) return limited;

    const body = await req.json().catch(() => null);
    const xml: unknown = body?.xml;
    const create: boolean = body?.create === true;
    if (typeof xml !== "string" || xml.length === 0) {
      return jsonError(req, 400, "xml es requerido");
    }
    if (xml.length > MAX_XML_BYTES) {
      return jsonError(req, 413, "XML excede 1MB");
    }

    let cfdi: ParsedCfdi;
    try {
      cfdi = parseCfdi(xml);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "XML inválido";
      return jsonError(req, 400, msg);
    }

    // BL-36: TipoDeComprobante debe ser Ingreso (I) o Egreso (E — nota de crédito).
    // N (nómina), P (pago) y T (traslado) no son facturas de proveedor gastables.
    if (
      cfdi.tipo_comprobante && cfdi.tipo_comprobante !== "I" &&
      cfdi.tipo_comprobante !== "E"
    ) {
      return jsonError(
        req,
        400,
        `CFDI TipoDeComprobante='${cfdi.tipo_comprobante}' no es una factura de proveedor (sólo I o E).`,
      );
    }

    // BL-35: validar que el receptor coincide con nuestro RFC.
    const { data: settings } = await auth.adminClient
      .from("company_settings")
      .select("rfc")
      .limit(1)
      .maybeSingle();
    const ourRfc = (settings?.rfc ?? "").toUpperCase().trim();
    const receptorRfc = (cfdi.receptor.rfc ?? "").toUpperCase().trim();
    if (ourRfc && receptorRfc && receptorRfc !== ourRfc) {
      return jsonError(
        req,
        400,
        `CFDI_RECEPTOR_MISMATCH: el CFDI está emitido a ${receptorRfc}, no a ${ourRfc}.`,
      );
    }

    // Duplicate by UUID in supplier_bills
    const { data: existing } = await auth.adminClient
      .from("supplier_bills")
      .select("id, bill_number, issue_date, total")
      .eq("cfdi_uuid", cfdi.cfdi_uuid)
      .maybeSingle();

    if (existing) {
      return jsonResponse(req, {
        duplicate: true,
        existing_id: existing.id,
        bill_number: existing.bill_number,
        cfdi_uuid: cfdi.cfdi_uuid,
      });
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
      ? cfdi.conceptos.slice(0, 3).map((c) => c.descripcion).join(" · ").slice(
        0,
        240,
      )
      : "";

    const description = [
      cfdi.serie || cfdi.folio
        ? `Factura ${[cfdi.serie, cfdi.folio].filter(Boolean).join("-")}`
        : "Factura",
      conceptos_resumen ? `— ${conceptos_resumen}` : "",
    ].filter(Boolean).join(" ").trim();

    const due_date = cfdi.payment_method_sat === "PPD"
      ? addDays(cfdi.fecha, 30)
      : cfdi.fecha;

    // Preview mode: just return parsed payload
    if (!create) {
      return jsonResponse(req, {
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
        receptor: cfdi.receptor,
        tipo_comprobante: cfdi.tipo_comprobante,
        description,
        conceptos_resumen,
        categoria_sugerida,
        supplier_match,
      });
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
        receptor_rfc: cfdi.receptor.rfc || null,
        tipo_comprobante: cfdi.tipo_comprobante,
        category: categoria_sugerida,
        description,
        status: "pending",
        created_by: auth.userId,
      })
      .select("id, bill_number")
      .single();

    if (billErr) {
      console.error("bill insert error", billErr);
      return jsonError(req, 500, billErr.message);
    }

    return jsonResponse(req, {
      created: true,
      bill_id: bill.id,
      bill_number: bill.bill_number,
      supplier_match,
    });
  } catch (e) {
    console.error("parse-cfdi-expense error", e);
    const msg = e instanceof Error ? e.message : "Error desconocido";
    return jsonError(req, 500, msg);
  }
});
