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

    // Helper: liberar el claim ante un early-return no-fatal. Deja el pago en
    // 'pending' para que el operador o el retry queue puedan re-intentar.
    const releaseClaim = async (msg?: string) => {
      await supabase
        .from("payments")
        .update({
          rep_cfdi_status: "pending",
          rep_error_message: msg ?? null,
        })
        .eq("id", payment_id);
    };

    // BLOQUE 2.2: un solo RPC transaccional bloquea la factura, calcula
    // NumParcialidad + ImpSaldoAnt y RESERVA installment_number/prior_balance
    // en payments antes de retornar. Serialización real: dos llamadas
    // concurrentes se ordenan por el FOR UPDATE sobre invoices; cuando la
    // primera commitea con la reserva, la segunda ya la ve y computa N+1.
    const prepRes = await (supabase as unknown as {
      rpc: (
        fn: string,
        args: Record<string, unknown>,
      ) => Promise<
        {
          data: Record<string, unknown> | null;
          error: { message?: string } | null;
        }
      >;
    }).rpc("prepare_payment_complement", { p_payment_id: payment_id });

    if (prepRes.error || !prepRes.data) {
      const errMsg = prepRes.error?.message ??
        "No se pudo preparar el complemento";
      console.error(
        "[stamp-payment-complement] prepare_payment_complement failed",
        {
          payment_id,
          err: errMsg,
        },
      );
      // Falla del RPC → dejar en 'error' (no re-intentable automático) con
      // mensaje descriptivo. Cubre validación de monto inválido y estados
      // inconsistentes.
      await supabase
        .from("payments")
        .update({
          rep_cfdi_status: "error",
          rep_error_message: errMsg.slice(0, 1000),
        })
        .eq("id", payment_id);
      return jsonError(
        req,
        500,
        `No se pudo preparar el complemento: ${errMsg}`,
      );
    }

    const prep = prepRes.data;
    const installmentNumber = Number(prep.installment_number);
    const priorBalance = Number(prep.prior_balance);
    const amount = Number(payment.amount);

    // Cargar los campos de invoice que el RPC no devuelve pero el payload de
    // Facturapi necesita (razón social, RFC, régimen, domicilio, uso CFDI).
    const { data: invoice } = await supabase
      .from("invoices")
      .select(
        "id, customer_id, total, tax_rate, metodo_pago, moneda, tipo_cambio, cfdi_uuid, cfdi_status, receptor_razon_social, receptor_rfc, receptor_regimen_fiscal, receptor_domicilio_fiscal_cp, uso_cfdi, customer_name",
      )
      .eq("id", payment.invoice_id)
      .single();
    if (!invoice) {
      await releaseClaim("Factura no encontrada");
      return jsonError(req, 404, "Invoice not found");
    }
    if (invoice.metodo_pago !== "PPD") {
      await releaseClaim("Solo facturas PPD requieren REP");
      return jsonError(
        req,
        400,
        "Solo facturas PPD requieren Complemento de Pago",
      );
    }
    if (invoice.cfdi_status !== "stamped" || !invoice.cfdi_uuid) {
      await releaseClaim("Factura aún no timbrada");
      return jsonError(
        req,
        400,
        "La factura debe estar timbrada para generar REP",
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
    if (!apiKey) {
      // Bloque 6.3: sin apiKey el claim quedaba huérfano en 'in_progress'.
      await releaseClaim("Facturapi key no configurada");
      return jsonError(req, 400, "Facturapi key not configured");
    }

    const paymentDateIso = `${payment.payment_date}T12:00:00`;
    const paymentCurrency = (payment.currency as string | null) || "MXN";
    const paymentExchange = Number(payment.exchange_rate || 1);

    // BL-05 + R10 Bloque 8.2: el related doc refleja la moneda de la FACTURA
    // origen. Anexo 20 exige EquivalenciaDR=1 cuando MonedaDR == MonedaP (misma
    // moneda del pago), aunque la factura tenga tipo_cambio guardado. Sólo
    // usamos el TC de la factura si difiere de la moneda del pago.
    const invoiceCurrency = (invoice.moneda as string | null) || "MXN";
    const invoiceExchange = invoiceCurrency === paymentCurrency
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
