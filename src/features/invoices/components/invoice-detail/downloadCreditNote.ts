import { notifyError } from "@/lib/ui/appFeedback";
import { downloadCfdiBlob, type CfdiFormat } from "../../lib/downloadCfdiBlob";

export async function downloadCreditNote(creditNoteId: string, format: CfdiFormat, number: string) {
  try {
    await downloadCfdiBlob({ credit_note_id: creditNoteId }, format, `${number}.${format}`);
  } catch (err: unknown) {
    notifyError({ error: err, message: "Error al descargar" });
  }
}
