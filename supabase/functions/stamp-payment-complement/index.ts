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
    // Claim atómico: solo una petición concurrente puede transicionar
    // de pending|error → stamping. Cierra la ventana antes de llamar a Facturapi.
    const claimRes = await supabase
      .from("payments")
      .update({ rep_cfdi_status: "stamping" })
      .eq("id", payment_id)
      .in("rep_cfdi_status", ["pending", "error", "none", "stamping"])
      .is("rep_cfdi_uuid", null)
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

    // Load invoice (BL-004: incluir tax_rate para no hardcodear IVA)
    const { data: invoice } = await supabase
      .from("invoices")
      .select(
        "id, customer_id, total, tax_rate, metodo_pago, cfdi_uuid, cfdi_status, receptor_razon_social, receptor_rfc, receptor_regimen_fiscal, receptor_domicilio_fiscal_cp, uso_cfdi, customer_name",
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

    // Calculate prior_balance: sum of all stamped/none REP payments BEFORE this one
    const { data: allPayments } = await supabase
      .from("payments")
      .select("id, amount, payment_date, created_at, rep_cfdi_status")
      .eq("invoice_id", invoice.id)
      .order("payment_date", { ascending: true })
      .order("created_at", { ascending: true });

    const ordered = (allPayments ?? []) as Array<
      { id: string; amount: number; rep_cfdi_status: string }
    >;
    let priorPaid = 0;
    let installmentNumber = 1;
    for (const p of ordered) {
      if (p.id === payment_id) break;
      if (p.rep_cfdi_status !== "cancelled") {
        priorPaid += Number(p.amount);
        installmentNumber += 1;
      }
    }
    const invoiceTotal = Number(invoice.total);
    const priorBalance = Number((invoiceTotal - priorPaid).toFixed(2));
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
    const currency = (payment.currency as string | null) || "MXN";
    const exchange = Number(payment.exchange_rate || 1);

    const relatedDoc: Record<string, unknown> = {
      uuid: invoice.cfdi_uuid,
      amount,
      installment: installmentNumber,
      last_balance: priorBalance,
      currency: "MXN",
      exchange: 1,
    };
    if (ivaRate > 0) {
      relatedDoc.taxes = [{ base, type: "IVA", rate: ivaRate, factor: "Tasa" }];
    }

    const dataEntry: Record<string, unknown> = {
      payment_form: payment.payment_form_sat,
      date: paymentDateIso,
      related_documents: [relatedDoc],
    };
    if (currency !== "MXN") {
      dataEntry.currency = currency;
      dataEntry.exchange = exchange;
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
