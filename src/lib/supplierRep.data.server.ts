/**
 * Lecturas y escrituras de REP sobre `supplier_payments` / `supplier_bills`.
 *
 * Todas las consultas usan el cliente privilegiado, por lo que TODAS acotan
 * `organization_id` en la misma operación.
 */
import { HttpError, type AdminClient } from "./server/adminGuards.server";

/** Carga el pago y su factura, aplicando las guardas de estado (N-32). */
export async function loadPaymentAndBill(
  supabase: AdminClient,
  paymentId: string,
  organizationId: string,
  force: boolean | undefined,
) {
  const { data: payment, error: payErr } = await supabase
    .from("supplier_payments")
    .select("id, bill_id, organization_id, amount, rep_status, rep_required, rep_cfdi_uuid")
    .eq("id", paymentId)
    .eq("organization_id", organizationId)
    .single();
  if (payErr || !payment) throw new HttpError(404, "Pago no encontrado");
  if (!payment.rep_required) {
    throw new HttpError(400, "Este pago no requiere REP");
  }
  if (payment.rep_status === "received" && payment.rep_cfdi_uuid && !force) {
    throw new HttpError(
      409,
      `Este pago ya tiene un REP validado (${payment.rep_cfdi_uuid}). Envía force=true para reemplazarlo.`,
    );
  }

  const { data: bill } = await supabase
    .from("supplier_bills")
    .select("id, organization_id, cfdi_uuid, supplier_id, payment_method_sat, suppliers(rfc, name)")
    .eq("id", payment.bill_id)
    .eq("organization_id", organizationId)
    .single();
  if (!bill) throw new HttpError(404, "Factura no encontrada");
  if (!bill.cfdi_uuid) {
    throw new HttpError(400, "La factura no tiene UUID CFDI");
  }
  return { payment, bill, billUuid: bill.cfdi_uuid };
}

/** El UUID del REP no puede estar registrado en otro pago de la empresa. */
export async function assertRepUuidNotDuplicated(
  supabase: AdminClient,
  repUuid: string,
  organizationId: string,
  paymentId: string,
): Promise<void> {
  const { data: dup } = await supabase
    .from("supplier_payments")
    .select("id")
    .eq("rep_cfdi_uuid", repUuid)
    .eq("organization_id", organizationId)
    .neq("id", paymentId)
    .maybeSingle();
  if (dup) {
    throw new HttpError(409, `El UUID ${repUuid} ya está registrado en otro pago`);
  }
}

export async function markRepReceived(
  supabase: AdminClient,
  params: {
    paymentId: string;
    organizationId: string;
    repUuid: string;
    xmlPath: string;
    pdfPath: string | null;
    userId: string;
  },
): Promise<void> {
  const { error: updErr } = await supabase
    .from("supplier_payments")
    .update({
      rep_status: "received",
      rep_cfdi_uuid: params.repUuid,
      rep_xml_url: params.xmlPath,
      rep_pdf_url: params.pdfPath,
      rep_received_at: new Date().toISOString(),
      rep_notes: null,
      rep_uploaded_by: params.userId,
    })
    .eq("id", params.paymentId)
    .eq("organization_id", params.organizationId);

  if (updErr) {
    // N-32: carrera contra el índice único parcial de rep_cfdi_uuid.
    if ((updErr as { code?: string }).code === "23505") {
      throw new HttpError(
        409,
        `El UUID ${params.repUuid} ya está registrado en otro pago`,
      );
    }
    console.error("[validate-supplier-rep] supplier_payments update:", updErr);
    throw new HttpError(500, "No se pudo guardar el pago");
  }
}

/** Actividad del feed (best effort: nunca rompe la validación del REP). */
export async function recordRepActivity(
  supabase: AdminClient,
  params: {
    paymentId: string;
    organizationId: string;
    repUuid: string;
    billUuid: string | null;
    userId: string;
  },
): Promise<void> {
  try {
    await supabase.from("activity_feed").insert({
      event_type: "supplier_payment.rep_uploaded",
      entity_type: "supplier_payments",
      entity_id: params.paymentId,
      title: "REP cargado",
      description:
        `Complemento de pago ${params.repUuid} cargado para la factura ${params.billUuid}`,
      actor_id: params.userId,
      organization_id: params.organizationId,
    });
  } catch (e) {
    console.error("activity_feed insert failed:", e);
  }
}
