import type { QuoteDocumentProps } from "@/lib/pdf/documents/QuoteDocument";
import { renderAndSave } from "@/lib/pdf/renderAndSave";

export async function buildQuotePdf(data: QuoteDocumentProps): Promise<void> {
  await renderAndSave({ kind: "quote", props: data }, `${data.quoteNumber}.pdf`);
}
