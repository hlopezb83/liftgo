const MAX_FOLIO_GAP_PREVIEW = 100;

export type MissingInvoiceFolioSummary = {
  count: number;
  preview: string[];
};

export function findInvoiceFolioGaps(
  rows: ReadonlyArray<{ invoice_number: string; status: string }>,
): MissingInvoiceFolioSummary {
  const folios = new Set<number>();

  for (const row of rows) {
    if (row.status === "draft") continue;

    const match = /^FAC-(\d+)$/u.exec(row.invoice_number);
    if (!match) continue;

    const folio = Number(match[1]);
    if (Number.isSafeInteger(folio) && folio > 0) folios.add(folio);
  }

  const sortedFolios = [...folios].sort((left, right) => left - right);
  const preview: string[] = [];
  let count = 0;

  for (let index = 1; index < sortedFolios.length; index++) {
    const previous = sortedFolios[index - 1];
    const current = sortedFolios[index];
    const missingBetween = current - previous - 1;

    if (missingBetween <= 0) continue;
    count += missingBetween;

    for (
      let folio = previous + 1;
      folio < current && preview.length < MAX_FOLIO_GAP_PREVIEW;
      folio++
    ) {
      preview.push(String(folio).padStart(4, "0"));
    }
  }

  return { count, preview };
}
