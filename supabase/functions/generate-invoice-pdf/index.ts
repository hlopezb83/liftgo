import { handleCors } from "../_shared/cors.ts";
import { jsonError, jsonResponse } from "../_shared/http.ts";
import { requireAuth } from "../_shared/auth.ts";
import { isUUID } from "../_shared/validate.ts";

Deno.serve(async (req) => {
  const corsRes = handleCors(req);
  if (corsRes) return corsRes;

  try {
    const url = new URL(req.url);
    const invoiceId = url.searchParams.get("invoiceId");
    if (!isUUID(invoiceId)) {
      return jsonError(req, 400, "invoiceId must be a valid UUID");
    }

    const auth = await requireAuth(req);
    if (!auth.ok) return auth.response;
    const adminClient = auth.adminClient;

    const { data: roles } = await adminClient.from("user_roles").select("role")
      .eq("user_id", auth.userId);
    const userRoles = (roles || []).map((r: { role: string }) => r.role);
    const isStaff = userRoles.some((r: string) =>
      ["admin", "dispatcher", "administrativo", "ventas", "auditor"].includes(r)
    );

    const { data: invoice, error } = await adminClient.from("invoices").select(
      "*",
    ).eq("id", invoiceId).single();
    if (error || !invoice) return jsonError(req, 404, "Invoice not found");

    if (!isStaff) {
      const { data: customer } = await adminClient.from("customers").select(
        "id",
      ).eq("user_id", auth.userId).maybeSingle();
      if (!customer || invoice.customer_id !== customer.id) {
        return jsonError(req, 403, "Forbidden");
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

    return jsonResponse(req, safeInvoice);
  } catch (_err) {
    return jsonError(req, 500, "Internal server error");
  }
});
