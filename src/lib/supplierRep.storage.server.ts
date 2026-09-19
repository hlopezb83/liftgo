/**
 * Subida de los archivos del REP a Storage, siempre bajo el prefijo de la
 * organización (`organizationStoragePath`).
 */
import { organizationStoragePath } from "@/lib/storage/organizationPath";
import { HttpError, type AdminClient } from "./server/adminGuards.server";
import { base64ToBytes, REP_BUCKET as BUCKET } from "./supplierRepXml";

export async function uploadRepFiles(
  supabase: AdminClient,
  organizationId: string,
  billId: string,
  paymentId: string,
  xmlText: string,
  pdfBase64: string | null | undefined,
): Promise<{ xmlPath: string; pdfPath: string | null }> {
  const xmlPath = organizationStoragePath(
    organizationId,
    `supplier-rep/${billId}/${paymentId}.xml`,
  );
  const { error: xmlErr } = await supabase.storage.from(BUCKET).upload(
    xmlPath,
    new Blob([xmlText], { type: "application/xml" }),
    { contentType: "application/xml", upsert: true },
  );
  if (xmlErr) {
    throw new HttpError(500, `No se pudo subir XML: ${xmlErr.message}`);
  }

  if (typeof pdfBase64 !== "string" || !pdfBase64) return { xmlPath, pdfPath: null };
  try {
    const p = organizationStoragePath(
      organizationId,
      `supplier-rep/${billId}/${paymentId}.pdf`,
    );
    const { error: pdfErr } = await supabase.storage.from(BUCKET).upload(
      p,
      base64ToBytes(pdfBase64),
      { contentType: "application/pdf", upsert: true },
    );
    return { xmlPath, pdfPath: pdfErr ? null : p };
  } catch (e) {
    console.error("PDF upload failed:", e);
    return { xmlPath, pdfPath: null };
  }
}
