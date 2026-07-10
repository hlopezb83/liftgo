import { getCorsHeaders, handleCors } from "../_shared/cors.ts";
import { getAdminClient, getCallerClient } from "../_shared/supabaseClients.ts";
import { isUUID } from "../_shared/validate.ts";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;
  const corsHeaders = getCorsHeaders(req);

  try {
    const url = new URL(req.url);
    const invoiceId = url.searchParams.get("invoiceId");
    if (!isUUID(invoiceId)) {
      return new Response(
        JSON.stringify({ error: "invoiceId must be a valid UUID" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    const callerClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: claimsData, error: claimsError } = await callerClient.auth
      .getClaims(token);
    if (claimsError || !claimsData?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const user = { id: claimsData.claims.sub as string };

    const adminClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: roles } = await adminClient.from("user_roles").select("role")
      .eq("user_id", user.id);
    const userRoles = (roles || []).map((r: { role: string }) => r.role);
    const isStaff = userRoles.some((r: string) =>
      ["admin", "dispatcher", "administrativo", "ventas", "auditor"].includes(r)
    );

    const { data: invoice, error } = await adminClient.from("invoices").select(
      "*",
    ).eq("id", invoiceId).single();
    if (error || !invoice) {
      return new Response(JSON.stringify({ error: "Invoice not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!isStaff) {
      const { data: customer } = await adminClient.from("customers").select(
        "id",
      ).eq("user_id", user.id).maybeSingle();
      if (!customer || invoice.customer_id !== customer.id) {
        return new Response(JSON.stringify({ error: "Forbidden" }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }

    const safeInvoice = isStaff ? invoice : (() => {
      const {
        facturapi_invoice_id: _f,
        cfdi_xml: _x,
        cfdi_error_message: _e,
        cancellation_reason: _c,
        ...rest
      } = invoice;
      return rest;
    })();

    return new Response(JSON.stringify(safeInvoice), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (_err) {
    return new Response(JSON.stringify({ error: "Internal server error" }), {
      status: 500,
      headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
    });
  }
});
