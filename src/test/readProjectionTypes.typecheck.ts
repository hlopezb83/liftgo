// Compiled by the normal typecheck. These negative assertions must fail if a
// partial query ever promises the complete table row again. No runtime code.
import type { InvoiceListItem, useInvoices, useInvoicesInfinite, useInvoice, fetchInvoicesForExport } from "@/features/invoices";
import type { QuoteListItem, useQuotes, useQuote } from "@/features/quotes";

type ListedInvoice = NonNullable<ReturnType<typeof useInvoices>["data"]>[number];
type PagedInvoice = NonNullable<ReturnType<typeof useInvoicesInfinite>["data"]>["pages"][number]["rows"][number];
type ExportedInvoice = Awaited<ReturnType<typeof fetchInvoicesForExport>>[number];
type ListedQuote = NonNullable<ReturnType<typeof useQuotes>["data"]>[number];

export type ReadProjectionTypeAssertions = [
  // @ts-expect-error line_items belongs to the detail projection
  InvoiceListItem["line_items"],
  // @ts-expect-error cfdi_xml belongs to the detail projection
  ListedInvoice["cfdi_xml"],
  // @ts-expect-error pagination must not widen rows back to complete invoices
  PagedInvoice["line_items"],
  // @ts-expect-error exports use the same bounded list projection
  ExportedInvoice["cfdi_xml"],
  // @ts-expect-error quote list excludes line_items
  QuoteListItem["line_items"],
  // @ts-expect-error quote list excludes rental_meta
  ListedQuote["rental_meta"],
  // @ts-expect-error quote list does not select notes
  ListedQuote["notes"],
  NonNullable<ReturnType<typeof useInvoice>["data"]>["line_items"],
  NonNullable<ReturnType<typeof useInvoice>["data"]>["cfdi_xml"],
  NonNullable<ReturnType<typeof useQuote>["data"]>["line_items"],
  NonNullable<ReturnType<typeof useQuote>["data"]>["rental_meta"],
];
