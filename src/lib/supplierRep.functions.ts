/**
 * Validación de REP de proveedor (antes Edge Function validate-supplier-rep).
 *
 * Este archivo es sólo el adaptador de transporte (server function): resuelve
 * rol, empresa y rate limit, y orquesta los módulos de validación pura
 * (`supplierRep.validation`), datos (`supplierRep.data.server`) y Storage
 * (`supplierRep.storage.server`). Mismas validaciones fiscales, mismos
 * mensajes y el mismo bucket de storage.
 */
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  assertEmisorMatchesSupplier,
  assertPagoMatchesInvoice,
  decodeRepXml,
  extractRepUuid,
  validateRepInput,
  type ValidateSupplierRepInput,
} from "./supplierRep.validation";
import {
  extractAllAttr,
  extractAttr,
  extractPagoNodes,
  isWellFormedXml,
} from "./supplierRepXml";

// Reexportados para las pruebas y consumidores existentes.
export { extractAllAttr, extractAttr, extractPagoNodes, isWellFormedXml };
export type { ValidateSupplierRepInput };

export const validateSupplierRepFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: ValidateSupplierRepInput) => data)
  .handler(async ({ data, context }) => {
    const g = await import("./server/adminGuards.server");
    const { admin: supabase } = await g.requireRole(
      context.supabase,
      context.userId,
      ["admin", "administrativo"],
    );
    const userId = context.userId;
    const { data: organizationId, error: organizationError } =
      await context.supabase.rpc("current_organization_id");
    if (organizationError || !organizationId) {
      throw new g.HttpError(
        403,
        "No se pudo resolver la organización activa para validar el REP.",
      );
    }
    // Mismo rate limit que parse-csf (5 req / 60s por usuario).
    await g.enforceRateLimit(supabase, "validate-supplier-rep", userId, 5, 60);

    const { payment_id, xml_base64, pdf_base64, force } = data ?? {};
    validateRepInput(g, data);

    const repData = await import("./supplierRep.data.server");
    const { payment, bill, billUuid } = await repData.loadPaymentAndBill(
      supabase,
      payment_id,
      organizationId,
      force,
    );

    const xmlText = decodeRepXml(g, xml_base64);
    assertEmisorMatchesSupplier(
      g,
      xmlText,
      bill.suppliers as { rfc?: string | null } | null,
    );

    const repUuid = extractRepUuid(g, xmlText);

    assertPagoMatchesInvoice(g, xmlText, billUuid, Number(payment.amount));

    await repData.assertRepUuidNotDuplicated(
      supabase,
      repUuid,
      organizationId,
      payment_id,
    );

    const { uploadRepFiles } = await import("./supplierRep.storage.server");
    const { xmlPath, pdfPath } = await uploadRepFiles(
      supabase,
      organizationId,
      bill.id,
      payment_id,
      xmlText,
      pdf_base64,
    );

    await repData.markRepReceived(supabase, {
      paymentId: payment_id,
      organizationId,
      repUuid,
      xmlPath,
      pdfPath,
      userId,
    });

    await repData.recordRepActivity(supabase, {
      paymentId: payment_id,
      organizationId,
      repUuid,
      billUuid: bill.cfdi_uuid,
      userId,
    });

    return {
      success: true,
      rep_cfdi_uuid: repUuid,
      xml_url: xmlPath,
      pdf_url: pdfPath,
    };
  });
