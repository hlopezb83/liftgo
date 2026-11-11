import { useRef } from "react";
import { useFormContext, useFormState } from "react-hook-form";
import { EmptyState } from "@/components/feedback/EmptyState";
import { FormActions } from "@/components/forms/FormActions";
import { FormPageHeader } from "@/components/layout/FormPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { useParams, useSearchParams } from "@/lib/router-compat";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { CfdiFieldsCard } from "../components/invoice-form/CfdiFieldsCard";
import { EditableLineItemsTable } from "../components/invoice-form/EditableLineItemsTable";
import { InvoiceAvailabilityNotice } from "../components/invoice-form/InvoiceAvailabilityNotice";
import { InvoiceDetailsCard } from "../components/invoice-form/InvoiceDetailsCard";
import { InvoiceSourceNotice } from "../components/invoice-form/InvoiceSourceNotice";
import { InvoiceStickySubmitBar, InvoiceTotalsProvider, InvoiceTotalsSummary } from "../components/invoice-form/InvoiceTotals";
import { SaleAssignmentBlocked } from "../components/invoice-form/SaleAssignmentBlocked";
import { invoiceLineItemSource } from "../hooks/invoiceForm/invoiceSatDefaults";
import { useDamagePrefill } from "../hooks/useDamagePrefill";
import { useInvoiceFormLogic } from "../hooks/useInvoiceFormLogic";
import type { InvoiceFormValues } from "../lib/invoiceFormSchema";

function invoiceSubmitBlock(chargeBlock: string | null, isEdit: boolean, version: number | null | undefined) {
  if (chargeBlock) return chargeBlock;
  return isEdit && version == null ? "Cargando la factura…" : undefined;
}

function readInvoiceSources(params: URLSearchParams) {
  const read = (name: string) => {
    const value = params.get(name)?.trim();
    return value && value !== "null" ? value : null;
  };
  return {
    fromQuoteId: read("from_quote"),
    extensionId: read("extension_id"),
    damageId: read("damage_id"),
  };
}

function invoiceSourceKey(sources: ReturnType<typeof readInvoiceSources>) {
  return JSON.stringify([sources.fromQuoteId, sources.extensionId, sources.damageId]);
}

function sourceKeyForSearch(search: string) {
  return invoiceSourceKey(readInvoiceSources(new URLSearchParams(search)));
}

function invoiceAvailability(form: ReturnType<typeof useInvoiceFormLogic>, damage: ReturnType<typeof useDamagePrefill>) {
  return {
    chargeBlock: damage.block || form.chargeBlock,
    bookingAvailabilityBlock: form.bookingAvailabilityBlock,
    isLoading: damage.isLoading || form.isLoadingChargeAvailability,
    onRetry: damage.block ? damage.retry : form.retryChargeAvailability,
  };
}

function InvoiceNotesCard() {
  const { control } = useFormContext<InvoiceFormValues>();
  return (
    <Card className="min-w-0 xl:col-start-1">
      <CardHeader><CardTitle className="text-base">Notas</CardTitle></CardHeader>
      <CardContent>
        <FormField control={control} name="notes" render={({ field }) => (
          <FormItem>
            <FormControl>
              <Textarea placeholder="Notas adicionales…" rows={3} {...field} />
            </FormControl>
            <FormMessage />
          </FormItem>
        )} />
      </CardContent>
    </Card>
  );
}

export default function InvoiceForm() {
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const sources = readInvoiceSources(id ? new URLSearchParams() : searchParams);
  const sourceKey = id ? `invoice:${id}` : invoiceSourceKey(sources);
  return <InvoiceFormSession key={sourceKey} id={id} sources={sources} />;
}

function InvoiceFormSession({ id, sources }: { id?: string; sources: ReturnType<typeof readInvoiceSources> }) {
  const navigate = useNavigateTransition();
  const { fromQuoteId, extensionId, damageId } = sources;

  const f = useInvoiceFormLogic({ id, fromQuoteId, extensionId, damageId });

  const damage = useDamagePrefill({
    damageId,
    form: f.form,
    handleCustomerSelect: f.handleCustomerSelect,
  });

  const isSubmitting = f.saveInvoice.isPending;
  const availability = invoiceAvailability(f, damage);
  const submitBlock = invoiceSubmitBlock(availability.chargeBlock, f.isEdit, f.invoiceVersion);
  // R16 F-03: el guard acepta getter y lo evalúa DENTRO del callback del blocker,
  // así ve `justSavedRef.current=true` justo después de reset()+navigate().
  const justSavedRef = useRef(false);
  const { isDirty } = useFormState({ control: f.form.control });
  useUnsavedChangesGuard(
    () => isDirty && !isSubmitting && !justSavedRef.current,
    undefined,
    id ? false : sourceKeyForSearch,
  );

  const onSubmit = (values: InvoiceFormValues) => {
    if (submitBlock) return;
    // Regresión v7.423.0 (P2/P3): compatibilidad de la selección y periodo
    // dentro del rango de TODAS las reservas — validado al guardar, no sólo
    // en el filtro visual. El servidor re-valida dentro del RPC.
    const selectionError = f.validateSelection(values);
    if (selectionError) {
      f.form.setError(selectionError.field, { type: "validate", message: selectionError.message });
      return;
    }
    const payload = f.onSubmit(values);
    const bookingIds = values.bookingIds ?? [];
    const finalize = (successMsg: string, invoiceId: string) => {
      justSavedRef.current = true;
      f.form.reset(values);
      notifySuccess(successMsg);
      navigate(`/invoices/${invoiceId}`);
    };
    // Regresión v7.423.0 (P1): factura + reservas viajan JUNTAS al RPC
    // transaccional `save_invoice_with_bookings`. Si el sync rechaza (reserva
    // ya facturada en el período, período fuera de rango, stale_write…), NADA
    // persiste: ni la factura nueva ni los cambios de la edición.
    f.saveInvoice.mutate({
      payload,
      bookingIds,
      invoiceId: f.isEdit ? f.id ?? null : null,
      expectedVersion: f.isEdit ? f.invoiceVersion : null,
      damageId,
      extensionId,
      acceptQuoteId: fromQuoteId,
      quoteExpectedVersion: fromQuoteId ? f.sourceQuoteVersion ?? null : null,
    }, {
      onSuccess: (data) => {
        if (f.isEdit) {
          finalize("Factura actualizada", data.id);
          return;
        }
        // Sources were committed atomically with the invoice, before this receipt.
        finalize(`Factura ${data.invoice_number} creada`, data.id);
      },
    });
  };

  // v7.381.1: además del bloqueo determinístico, el guard de BD pudo rechazar
  // el INSERT por carrera/estado obsoleto — se reusa la misma pantalla.
  if (f.saleAssignmentGuard.shouldBlock || f.serverSaleAssignmentBlock) {
    const { totalAssigned, totalRequired, missingByLine } = f.saleAssignmentGuard;
    return (
      <SaleAssignmentBlocked
        totalAssigned={totalAssigned}
        totalRequired={totalRequired}
        missingByLine={missingByLine}
        onGoToQuote={() => navigate(`/quotes/${f.fromQuoteId}`)}
        onBack={() => navigate(-1)}
      />
    );
  }

  // FIX R6-25: id inexistente o sin permisos en modo edición — mostrar estado
  // con salida (patrón de InvoiceDetail) en vez del form vacío con
  // "Cargando la factura…" indefinido y el botón de Guardar bloqueado.
  if (f.isEdit && !f.isLoadingInvoice && !f.existing) {
    return (
      <PageContainer>
        <EmptyState
          title="Factura no encontrada o sin permisos"
          subtitle="La factura no existe, fue eliminada o no tienes acceso a ella."
          actionLabel="Volver a facturas"
          onAction={() => navigate("/invoices")}
        />
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="wide">
      <FormPageHeader
        title={f.isEdit ? "Editar factura" : "Nueva factura"}
        subtitle={f.isEdit ? f.invoiceNumber ?? undefined : undefined}
      />

      <Form {...f.form}>
        {/* eslint-disable-next-line react-hooks/refs -- onSubmit only writes justSavedRef inside async callbacks */}
        <form onSubmit={f.form.handleSubmit(onSubmit)} className="space-y-6">
          <InvoiceTotalsProvider>
            <InvoiceSourceNotice extension={f.extension} quoteNumber={f.sourceQuote?.quote_number ?? null} />
            <InvoiceDetailsCard
              isEdit={f.isEdit}
              form={f.form}
              customers={f.customers}
              availableBookings={f.pickerBookings ?? f.availableBookings}
              bookingPicker={f.bookingPicker}
              handleCustomerSelect={f.handleCustomerSelect}
              handleBookingsChange={f.handleBookingsChange}
            />

            <CfdiFieldsCard />

            <InvoiceAvailabilityNotice {...availability} />
            <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <EditableLineItemsTable source={invoiceLineItemSource({
                invoiceId: id, existing: f.existing, isLoadingInvoice: f.isLoadingInvoice,
                quoteId: fromQuoteId, quote: f.sourceQuote, extensionId, damageId,
              })} />

              <InvoiceTotalsSummary />

              <InvoiceNotesCard />
            </div>

            {/* R5-16: en edición, bloquear Guardar hasta que `existing` resuelva
                y haya invoiceVersion; sin ella el UPDATE iría sin bloqueo optimista. */}
            <InvoiceStickySubmitBar>
              <FormActions submitLabel={f.isEdit ? "Actualizar factura" : "Crear factura"} isPending={f.isPending} onCancel={() => navigate(-1)}
                submitDisabled={!!submitBlock}
                submitDisabledReason={submitBlock}
              />
            </InvoiceStickySubmitBar>
          </InvoiceTotalsProvider>
        </form>
      </Form>
    </PageContainer>
  );
}
