import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { isUUID } from "../_shared/validate.ts";

const FACTURAPI_BASE = "https://www.facturapi.io/v2";
const BUCKET = "cfdi-files";
const IVA_RATE = 0.16;

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);
  const jsonHeaders = { ...corsHeaders, "Content-Type": "application/json" };

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }
    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsErr } = await callerClient.auth
      .getClaims(token);
    if (claimsErr || !claimsData?.claims?.sub) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: jsonHeaders,
      });
    }
    const userId = claimsData.claims.sub as string;

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
    const { data: rolesRows } = await supabase
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);
    const allowed = (rolesRows ?? []).some((r) =>
      r.role === "admin" || r.role === "administrativo"
    );
    if (!allowed) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403,
        headers: jsonHeaders,
      });
    }

    const { payment_id } = await req.json().catch(() => ({}));
    if (!isUUID(payment_id)) {
      return new Response(
        JSON.stringify({ error: "payment_id must be a valid UUID" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // Load payment
    const { data: payment, error: payErr } = await supabase
      .from("payments")
      .select("*")
      .eq("id", payment_id)
      .single();
    if (payErr || !payment) {
      return new Response(JSON.stringify({ error: "Payment not found" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }
    if (payment.rep_cfdi_status === "stamped") {
      return new Response(
        JSON.stringify({ error: "Este pago ya tiene un REP timbrado" }),
        { status: 409, headers: jsonHeaders },
      );
    }
    if (!payment.payment_form_sat) {
      return new Response(
        JSON.stringify({ error: "Falta forma de pago SAT en el pago" }),
        { status: 400, headers: jsonHeaders },
      );
    }
    // Claim atómico: solo una petición concurrente puede transicionar
    // de pending|error → stamping. Cierra la ventana antes de llamar a Facturapi.
    const claimRes = await supabase
      .from("payments")
      .update({ rep_cfdi_status: "stamping" })
      .eq("id", payment_id)
      .in("rep_cfdi_status", ["pending", "error", "none"])
      .is("rep_cfdi_uuid", null)
      .select("id")
      .maybeSingle();
    if (!(claimRes as { data: unknown }).data) {
      return new Response(
        JSON.stringify({
          error: "REP ya está siendo timbrado o ya fue timbrado",
        }),
        { status: 409, headers: jsonHeaders },
      );
    }

    // Load invoice
    const { data: invoice } = await supabase
      .from("invoices")
      .select(
        "id, customer_id, total, metodo_pago, cfdi_uuid, cfdi_status, receptor_razon_social, receptor_rfc, receptor_regimen_fiscal, receptor_domicilio_fiscal_cp, uso_cfdi, customer_name",
      )
      .eq("id", payment.invoice_id)
      .single();
    if (!invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: jsonHeaders,
      });
    }
    if (invoice.metodo_pago !== "PPD") {
      return new Response(
        JSON.stringify({
          error: "Solo facturas PPD requieren Complemento de Pago",
        }),
        { status: 400, headers: jsonHeaders },
      );
    }
    if (invoice.cfdi_status !== "stamped" || !invoice.cfdi_uuid) {
      return new Response(
        JSON.stringify({
          error: "La factura debe estar timbrada para generar REP",
        }),
        { status: 400, headers: jsonHeaders },
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
      return new Response(
        JSON.stringify({
          error: `Monto inválido. Saldo previo: ${priorBalance}`,
        }),
        { status: 400, headers: jsonHeaders },
      );
    }

    // Tax breakdown (IVA 16% único)
    const base = Number((amount / (1 + IVA_RATE)).toFixed(2));

    const { data: company } = await supabase
      .from("company_settings")
      .select("facturapi_mode")
      .limit(1)
      .maybeSingle();
    const { data: secrets } = await supabase
      .from("billing_secrets")
      .select("facturapi_test_key, facturapi_live_key")
      .limit(1)
      .maybeSingle();
    const mode = (company?.facturapi_mode as string | undefined) || "test";
    const apiKey = mode === "live"
      ? ((secrets?.facturapi_live_key as string | null) ||
        Deno.env.get("FACTURAPI_LIVE_KEY"))
      : ((secrets?.facturapi_test_key as string | null) ||
        Deno.env.get("FACTURAPI_TEST_KEY"));
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "Facturapi key not configured" }),
        { status: 400, headers: jsonHeaders },
      );
    }

    const paymentDateIso = `${payment.payment_date}T12:00:00`;
    const currency = (payment.currency as string | null) || "MXN";
    const exchange = Number(payment.exchange_rate || 1);

    const dataEntry: Record<string, unknown> = {
      payment_form: payment.payment_form_sat,
      date: paymentDateIso,
      related_documents: [
        {
          uuid: invoice.cfdi_uuid,
          amount,
          installment: installmentNumber,
          last_balance: priorBalance,
          taxes: [{ base, type: "IVA", rate: IVA_RATE, factor: "Tasa" }],
          currency: "MXN",
          exchange: 1,
        },
      ],
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

    const createRes = await fetch(`${FACTURAPI_BASE}/invoices`, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      console.error("Facturapi REP create error:", errBody);
      await supabase
        .from("payments")
        .update({
          rep_cfdi_status: "error",
          rep_error_message: errBody.slice(0, 1000),
        })
        .eq("id", payment_id);
      return new Response(
        JSON.stringify({
          error: `Facturapi error: ${createRes.status}`,
          detail: errBody,
        }),
        {
          status: 502,
          headers: jsonHeaders,
        },
      );
    }

    const repInvoice = await createRes.json();
    const repId = repInvoice.id as string;
    const repUuid = repInvoice.uuid as string;

    let xmlPath: string | null = null;
    let pdfPath: string | null = null;

    try {
      const xmlRes = await fetch(`${FACTURAPI_BASE}/invoices/${repId}/xml`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });
      if (xmlRes.ok) {
        const xmlTxt = await xmlRes.text();
        const p = `${invoice.id}/rep-${repUuid}.xml`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(
          p,
          new Blob([xmlTxt], { type: "application/xml" }),
          {
            contentType: "application/xml",
            upsert: true,
          },
        );
        if (!upErr) xmlPath = p;
      }
    } catch (e) {
      console.error("REP XML download failed:", e);
    }

    try {
      const pdfRes = await fetch(`${FACTURAPI_BASE}/invoices/${repId}/pdf`, {
        headers: { "Authorization": `Bearer ${apiKey}` },
      });
      if (pdfRes.ok) {
        const pdfBytes = new Uint8Array(await pdfRes.arrayBuffer());
        const p = `${invoice.id}/rep-${repUuid}.pdf`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(
          p,
          pdfBytes,
          {
            contentType: "application/pdf",
            upsert: true,
          },
        );
        if (!upErr) pdfPath = p;
      }
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
      return new Response(
        JSON.stringify({ error: "REP timbrado pero no se pudo guardar en DB" }),
        { status: 500, headers: jsonHeaders },
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        rep_cfdi_uuid: repUuid,
        rep_facturapi_id: repId,
        installment_number: installmentNumber,
      }),
      { headers: jsonHeaders },
    );
  } catch (err) {
    console.error("stamp-payment-complement error:", err);
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
