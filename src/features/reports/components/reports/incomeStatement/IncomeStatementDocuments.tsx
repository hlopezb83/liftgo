import { lazy, Suspense, useState } from "react";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatCurrency } from "@/lib/format/formatCurrency";
import {
  documentTotalMatches,
  statementDocumentHref,
  type StatementDocument,
  type StatementDocumentPage,
  type StatementDocumentScope,
  type StatementDocumentSelection,
} from "../../../hooks/incomeStatement/documentDrilldown";
import {
  STATEMENT_DOCUMENT_PAGE_SIZE,
  useIncomeStatementDocuments,
} from "../../../hooks/incomeStatement/useIncomeStatementDocuments";
import { useStatementBillFocus } from "../../../hooks/incomeStatement/useStatementBillFocus";

const SupplierBillDetailSheet = lazy(() =>
  import("@/features/accounts-payable").then((module) => ({
    default: module.SupplierBillDetailSheet,
  })),
);
const SOURCE_LABELS: Record<StatementDocument["source_type"], string> = {
  invoice: "Factura",
  payment: "Cobro de factura",
  credit_note: "Nota de crédito",
  supplier_bill: "Factura de proveedor",
  supplier_payment: "Pago a proveedor",
  operating_expense: "Gasto operativo",
};

function DocumentRow({
  document,
  onOpenBill,
  billTriggerRef,
}: {
  document: StatementDocument;
  onOpenBill: (id: string, rowKey: string) => void;
  billTriggerRef: (rowKey: string, element: HTMLButtonElement | null) => void;
}) {
  const href = statementDocumentHref(document);
  const isSupplier =
    document.source_type === "supplier_bill" ||
    document.source_type === "supplier_payment";
  return (
    <TableRow>
      <TableCell>
        <p>{SOURCE_LABELS[document.source_type]}</p>
        {href ? (
          <a
            className="underline underline-offset-4"
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={`Abrir ${document.folio} en otra pestaña`}
          >
            {document.folio}
          </a>
        ) : isSupplier ? (
          <button
            type="button"
            className="underline underline-offset-4"
            ref={(element) => billTriggerRef(document.row_key, element)}
            onClick={() => onOpenBill(document.document_id, document.row_key)}
          >
            {document.folio}
          </button>
        ) : (
          <details>
            <summary className="cursor-pointer">Registro sin folio</summary>
            <p className="text-xs break-all">{document.document_id}</p>
            <p>{document.label}</p>
          </details>
        )}
        <p className="text-xs text-muted-foreground">{document.label}</p>
        {document.payment_id && (
          <p className="text-xs text-muted-foreground break-all">
            Movimiento: {document.payment_id}
          </p>
        )}
      </TableCell>
      <TableCell className="whitespace-nowrap">
        <p>Documento: {document.document_date}</p>
        <p>Evento: {document.event_date}</p>
        <p>Mes imputado: {document.month_key}</p>
        {document.coverage_start && (
          <p className="text-xs">
            Cobertura: {document.coverage_start} a {document.coverage_end}
          </p>
        )}
      </TableCell>
      <TableCell>{document.currency}</TableCell>
      <TableCell className="text-right tabular-nums whitespace-nowrap">
        {formatCurrency(document.amount)} MXN
      </TableCell>
    </TableRow>
  );
}

function DocumentResults({
  data,
  expectedTotal,
  page,
  onPage,
  onOpenBill,
  billTriggerRef,
}: {
  data: StatementDocumentPage;
  expectedTotal: number;
  page: number;
  onPage: (page: number) => void;
  onOpenBill: (id: string, rowKey: string) => void;
  billTriggerRef: (rowKey: string, element: HTMLButtonElement | null) => void;
}) {
  return (
    <>
      <p
        role={
          documentTotalMatches(expectedTotal, data.total_amount)
            ? "status"
            : "alert"
        }
        className="mb-3 text-sm"
      >
        {documentTotalMatches(expectedTotal, data.total_amount)
          ? "Detalle coincide con el reporte"
          : "El detalle no coincide con el reporte. Actualiza el reporte antes de usar estos importes"}
        : {formatCurrency(data.total_amount)} MXN ({data.total_count}{" "}
        movimientos).
      </p>
      {data.rounding_adjustment !== 0 && (
        <p className="mb-3 text-xs">
          Ajuste de redondeo de los movimientos mostrados:{" "}
          {formatCurrency(data.rounding_adjustment)} MXN. Concilia centavos en
          el total de todas las páginas; no modifica los cálculos.
        </p>
      )}
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Documento / ficha</TableHead>
              <TableHead>Fechas</TableHead>
              <TableHead>Moneda origen</TableHead>
              <TableHead className="text-right">
                Importe atribuible MXN
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {data.items.map((document) => (
              <DocumentRow
                key={document.row_key}
                document={document}
                onOpenBill={onOpenBill}
                billTriggerRef={billTriggerRef}
              />
            ))}
          </TableBody>
        </Table>
      </div>
      {data.items.length === 0 && (
        <p className="py-4">No hay documentos en esta página.</p>
      )}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <Button
          variant="outline"
          disabled={page === 0}
          onClick={() => onPage(page - 1)}
        >
          Anterior
        </Button>
        <span className="text-sm">
          Página {page + 1} de{" "}
          {Math.max(
            1,
            Math.ceil(data.total_count / STATEMENT_DOCUMENT_PAGE_SIZE),
          )}
        </span>
        <Button
          variant="outline"
          disabled={
            (page + 1) * STATEMENT_DOCUMENT_PAGE_SIZE >= data.total_count
          }
          onClick={() => onPage(page + 1)}
        >
          Siguiente
        </Button>
      </div>
    </>
  );
}

export function IncomeStatementDocuments({
  scope,
  selection,
  onClose,
  returnFocus,
}: {
  scope: StatementDocumentScope;
  selection: StatementDocumentSelection;
  onClose: () => void;
  returnFocus?: () => void;
}) {
  const [page, setPage] = useState(0);
  const { billId, setBillId, inspectorRef, registerTrigger, openBill, onCloseAutoFocus } = useStatementBillFocus();
  const query = useIncomeStatementDocuments(scope, selection, page);
  const data = query.data;
  const loaded =
    !query.isPending && !query.isFetching && !query.isError && data;
  return (
    <>
      <Sheet
        open
        onOpenChange={(open) => {
          if (!open) onClose();
        }}
      >
        <SheetContent
          ref={inspectorRef}
          className="w-full sm:max-w-4xl overflow-y-auto"
          onCloseAutoFocus={(event) => {
            if (returnFocus) {
              event.preventDefault();
              returnFocus();
            }
          }}
        >
          <SheetHeader>
            <SheetTitle>Documentos de origen</SheetTitle>
            <SheetDescription>
              {selection.title}.{" "}
              {scope.accountingBasis === "cash"
                ? "Flujo de efectivo"
                : "Devengado"}
              . Período del reporte: {scope.startDate} a {scope.endDate}. Meses:{" "}
              {selection.months.join(", ")}.
            </SheetDescription>
          </SheetHeader>
          <p className="my-4 text-sm">
            Importe del reporte: {formatCurrency(selection.expectedTotal)} MXN.
            La columna de importe muestra solo la parte atribuible a este
            período/base, no el total de la factura. Las fichas de factura se
            abren en otra pestaña para conservar los filtros.
          </p>
          {query.isError ? (
            <QueryErrorState
              entity="los documentos de origen (el detalle puede requerir activación)"
              onRetry={() => {
                void query.refetch();
              }}
              isRetrying={query.isFetching}
            />
          ) : !loaded || !data ? (
            <p role="status">Cargando documentos…</p>
          ) : (
            <DocumentResults
              data={data}
              expectedTotal={selection.expectedTotal}
              page={page}
              onPage={setPage}
              onOpenBill={openBill}
              billTriggerRef={registerTrigger}
            />
          )}
        </SheetContent>
      </Sheet>
      {billId && (
        <Suspense fallback={<p role="status">Abriendo ficha…</p>}>
          <SupplierBillDetailSheet
            billId={billId}
            open
            onCloseAutoFocus={onCloseAutoFocus}
            onOpenChange={(open) => {
              if (!open) setBillId(null);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
