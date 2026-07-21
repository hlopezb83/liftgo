import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { requireRole } from "../_shared/auth.ts";
import { isUUID } from "../_shared/validate.ts";
import {
  binaryToBytes,
  binaryToText,
  createFacturapiClient,
  describeFacturapiError,
  getFacturapiConfig,
} from "../_shared/facturapi/client.ts";

const BUCKET = "cfdi-files";
const DEFAULT_IVA_RATE = 0.16;

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const auth = await requireRole(req, ["admin", "administrativo"]);
    if (!auth.ok) return auth.response;
    const supabase = auth.adminClient;

    const { payment_id } = await req.json().catch(() => ({}));
    if (!isUUID(payment_id)) {
      return jsonError(req, 400, "payment_id must be a valid UUID");
    }

    // Load payment
    const { data: payment, error: payErr } = await supabase
      .from("payments")
      .select("*")
      .eq("id", payment_id)
      .single();
    if (payErr || !payment) return jsonError(req, 404, "Payment not found");
    if (payment.rep_cfdi_status === "stamped") {
      return jsonError(req, 409, "Este pago ya tiene un REP timbrado");
    }
    if (!payment.payment_form_sat) {
      return jsonError(req, 400, "Falta forma de pago SAT en el pago");
    }
    // BL-04: claim atómico. NUNCA incluimos "stamping" en el filtro de entrada:
    // dos peticiones concurrentes leerían el mismo estado "stamping" y ambas
    // pasarían al UPDATE → doble timbrado. Solo se puede reclamar desde
    // pending|error|none con uuid null; para re-timbrar tras cancelación,
    // permitimos entrada por rep_cfdi_status='cancelled'.
    // Blindaje adicional: para estados pending|error|none exigimos
    // rep_cfdi_uuid IS NULL (data no timbrada). Solo `cancelled` puede tener
    // uuid presente. Esto cierra la puerta a data corrupta con uuid poblado en
    // estados no-timbrados que de otra forma pasaría el claim.
    const claimRes = await supabase
      .from("payments")
      .update({ rep_cfdi_status: "stamping" })
      .eq("id", payment_id)
      .in("rep_cfdi_status", ["pending", "error", "none", "cancelled"])
      .or("rep_cfdi_uuid.is.null,rep_cfdi_status.eq.cancelled")
      .select("id")
      .maybeSingle();
    if (claimRes.error) {
      console.error("[stamp-payment-complement] claim failed", claimRes.error);
    }
    if (!claimRes.data) {
      return jsonError(
        req,
        409,
        "REP ya está siendo timbrado o ya fue timbrado",
      );
    }

    // Load invoice (BL-004: incluir tax_rate para no hardcodear IVA;
    // BL-05: incluir moneda/tipo_cambio de la factura para el related doc).
    const { data: invoice } = await supabase
      .from("invoices")
      .select(
        "id, customer_id, total, tax_rate, metodo_pago, moneda, tipo_cambio, cfdi_uuid, cfdi_status, receptor_razon_social, receptor_rfc, receptor_regimen_fiscal, receptor_domicilio_fiscal_cp, uso_cfdi, customer_name",
      )
      .eq("id", payment.invoice_id)
      .single();
    if (!invoice) return jsonError(req, 404, "Invoice not found");
    if (invoice.metodo_pago !== "PPD") {
      return jsonError(
        req,
        400,
        "Solo facturas PPD requieren Complemento de Pago",
      );
    }
    if (invoice.cfdi_status !== "stamped" || !invoice.cfdi_uuid) {
      return jsonError(
        req,
        400,
        "La factura debe estar timbrada para generar REP",
      );
    }

    // BL: serializar la emisión de REPs por factura. El claim atómico es por
    // fila de payments, así dos peticiones concurrentes (distinto pago, misma
    // factura) podían leer el mismo estado y calcular la MISMA NumParcialidad
    // / ImpSaldoAnt antes de timbrar. El RPC toma un SELECT ... FOR UPDATE
    // sobre la fila de invoices: las emisiones concurrentes se ordenan al
    // adquirir el lock antes de calcular.
    const lockRes = await (supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: { message?: string } | null }>;
    }).rpc("lock_invoice_for_rep", { p_invoice_id: invoice.id });
    if (lockRes.error) {
      console.error("[stamp-payment-complement] invoice lock failed", {
        invoice_id: invoice.id,
        err: lockRes.error.message,
      });
      // Liberar el claim para que el pago no quede atascado en 'stamping'
      // (mismo patrón que el manejo de error de Facturapi más abajo).
      await supabase
        .from("payments")
        .update({
          rep_cfdi_status: "error",
          rep_error_message: "No se pudo serializar la emisión del REP",
        })
        .eq("id", payment_id);
      return jsonError(
        req,
        500,
        "No se pudo serializar la emisión del REP; reintenta",
      );
    }

    // BL-07: NumParcialidad debe ser único e incremental por factura, incluyendo
    // REPs cancelados (SAT no permite reutilizar el número). Antes se numeraba
    // por orden cronológico de payment_date, así un pago retroactivo colisionaba
    // con parcialidades ya timbradas.
    // BL-06: priorBalance se calcula solo sobre REPs actualmente vigentes
    // (stamped, no cancelled).
    const { data: allPayments } = await supabase
      .from("payments")
      .select("id, amount, rep_cfdi_status, rep_cfdi_uuid")
      .eq("invoice_id", invoice.id);

    const paymentsList = (allPayments ?? []) as Array<
      {
        id: string;
        amount: number;
        rep_cfdi_status: string;
        rep_cfdi_uuid: string | null;
      }
    >;
    let priorPaidStamped = 0;
    let priorEmissions = 0; // stamped + cancelled ya emitidos (incluye el pago actual si tuvo emisión previa)
    for (const p of paymentsList) {
      if (p.id === payment_id) {
        // BL-06/07 (cierre): si el pago actual tiene rep_cfdi_uuid, hubo una
        // emisión previa ante el SAT (típicamente cancelada). El SAT no permite
        // reutilizar NumParcialidad aunque el REP anterior esté cancelado.
        if (p.rep_cfdi_uuid) priorEmissions += 1;
        continue;
      }
      if (p.rep_cfdi_status === "stamped") {
        priorPaidStamped += Number(p.amount);
        priorEmissions += 1;
      } else if (p.rep_cfdi_status === "cancelled" && p.rep_cfdi_uuid) {
        priorEmissions += 1;
      }
    }
    const installmentNumber = priorEmissions + 1;
    const invoiceTotal = Number(invoice.total);
    const priorBalance = Number((invoiceTotal - priorPaidStamped).toFixed(2));
    const amount = Number(payment.amount);
    if (amount <= 0 || amount > priorBalance + 0.01) {
      return jsonError(
        req,
        400,
        `Monto inválido. Saldo previo: ${priorBalance}`,
      );
    }

    // BL-004: tax rate viene de la factura relacionada (16, 8, 0…).
    // `invoices.tax_rate` se guarda como porcentaje (ej. 16 = 16%).
    const invoiceTaxRatePct = invoice.tax_rate == null
      ? DEFAULT_IVA_RATE * 100
      : Number(invoice.tax_rate);
    const ivaRate = Number((invoiceTaxRatePct / 100).toFixed(6));
    const base = ivaRate > 0
      ? Number((amount / (1 + ivaRate)).toFixed(2))
      : Number(amount.toFixed(2));

    const { apiKey } = await getFacturapiConfig(
      supabase,
      (k) => Deno.env.get(k),
    );
    if (!apiKey) return jsonError(req, 400, "Facturapi key not configured");

    const paymentDateIso = `${payment.payment_date}T12:00:00`;
    const paymentCurrency = (payment.currency as string | null) || "MXN";
    const paymentExchange = Number(payment.exchange_rate || 1);

    // BL-05: el related doc debe reflejar la moneda de la FACTURA origen y su
    // tipo de cambio, no MXN hardcodeado. Cuando pago y factura difieren en
    // moneda, el REP nivel documento usa la moneda del pago (SAT).
    const invoiceCurrency = (invoice.moneda as string | null) || "MXN";
    const invoiceExchange = invoiceCurrency === "MXN"
      ? 1
      : Number(invoice.tipo_cambio || 1) || 1;

    const relatedDoc: Record<string, unknown> = {
      uuid: invoice.cfdi_uuid,
      amount,
      installment: installmentNumber,
      last_balance: priorBalance,
      currency: invoiceCurrency,
      exchange: invoiceExchange,
    };
    if (ivaRate > 0) {
      relatedDoc.taxes = [{ base, type: "IVA", rate: ivaRate, factor: "Tasa" }];
    }

    const dataEntry: Record<string, unknown> = {
      payment_form: payment.payment_form_sat,
      date: paymentDateIso,
      related_documents: [relatedDoc],
    };
    if (paymentCurrency !== "MXN") {
      dataEntry.currency = paymentCurrency;
      dataEntry.exchange = paymentExchange;
    }

    const payload = {
      type: "P",
      customer: {
        legal_name: invoice.receptor_razon_social || invoice.customer_name ||
          "Público General",
        tax_id: invoice.receptor_rfc || "XAXX010101000",
        tax_system: invoice.receptor_regimen_fiscal || "616",
        address: { zip: invoice.receptor_domicilio_fiscal_cp || "06600" },
      },
      complements: [{ type: "pago", data: [dataEntry] }],
    };

    const client = createFacturapiClient(apiKey);
    let repInvoice: {
      id: string;
      uuid: string;
      folio_number?: number | string | null;
    };
    try {
      repInvoice = await client.invoices.create(payload) as {
        id: string;
        uuid: string;
        folio_number?: number | string | null;
      };
    } catch (err) {
      const desc = describeFacturapiError(err);
      console.error("Facturapi REP create error:", desc.detail);
      await supabase
        .from("payments")
        .update({
          rep_cfdi_status: "error",
          rep_error_message: desc.detail.slice(0, 1000),
        })
        .eq("id", payment_id);
      return jsonError(req, 502, `Facturapi error: ${desc.status}`, {
        detail: desc.detail,
      });
    }

    const repId = repInvoice.id;
    const repUuid = repInvoice.uuid;

    let xmlPath: string | null = null;
    let pdfPath: string | null = null;

    try {
      const xmlTxt = await binaryToText(
        await client.invoices.downloadXml(repId),
      );
      const p = `${invoice.id}/rep-${repUuid}.xml`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(
        p,
        new Blob([xmlTxt], { type: "application/xml" }),
        { contentType: "application/xml", upsert: true },
      );
      if (!upErr) xmlPath = p;
    } catch (e) {
      console.error("REP XML download failed:", e);
    }

    try {
      const pdfBytes = await binaryToBytes(
        await client.invoices.downloadPdf(repId),
      );
      const p = `${invoice.id}/rep-${repUuid}.pdf`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(
        p,
        pdfBytes,
        { contentType: "application/pdf", upsert: true },
      );
      if (!upErr) pdfPath = p;
    } catch (e) {
      console.error("REP PDF download failed:", e);
    }

    const { error: updErr } = await supabase
      .from("payments")
      .update({
        installment_number: installmentNumber,
        prior_balance: priorBalance,
        rep_facturapi_id: repId,
        rep_cfdi_uuid: repUuid,
        rep_cfdi_status: "stamped",
        rep_xml_url: xmlPath,
        rep_pdf_url: pdfPath,
        rep_error_message: null,
      })
      .eq("id", payment_id);

    if (updErr) {
      console.error("DB update error after REP stamp:", updErr);
      return jsonError(req, 500, "REP timbrado pero no se pudo guardar en DB");
    }

    // Folio de Facturapi = fuente de verdad. Guardamos CP-<folio> como rep_number.
    let repNumber: string | null = null;
    const facturApiFolioRaw = repInvoice.folio_number ?? null;
    const facturApiFolio: string | null = facturApiFolioRaw !== null &&
        facturApiFolioRaw !== undefined
      ? String(facturApiFolioRaw)
      : null;

    if (facturApiFolio) {
      const rpcRes = await (supabase as unknown as {
        rpc: (
          fn: string,
          args: Record<string, unknown>,
        ) => Promise<{ data: unknown; error: { message?: string } | null }>;
      }).rpc("assign_stamped_rep_number", {
        p_payment_id: payment_id,
        p_folio: facturApiFolio,
      });
      if (rpcRes.error) {
        console.error(
          "[stamp-payment-complement] assign_stamped_rep_number failed",
          { payment_id, err: rpcRes.error.message },
        );
      } else {
        repNumber = rpcRes.data as string;
      }
    }

    return jsonResponse(req, {
      success: true,
      rep_cfdi_uuid: repUuid,
      rep_facturapi_id: repId,
      rep_number: repNumber,
      installment_number: installmentNumber,
    });
  } catch (err) {
    console.error("stamp-payment-complement error:", err);
    return jsonError(req, 500, "Internal server error");
  }
});
