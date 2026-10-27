import { useRef } from "react";
import { useWatch } from "react-hook-form";
import { TotalsSummary } from "@/components/domain/TotalsSummary";
import { EmptyState } from "@/components/feedback/EmptyState";
import { FormActions } from "@/components/forms/FormActions";
import { FormPageHeader } from "@/components/layout/FormPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useLinkExtensionInvoice } from "@/features/bookings";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { useParams, useSearchParams } from "@/lib/router-compat";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { CfdiFieldsCard } from "../components/invoice-form/CfdiFieldsCard";
import { EditableLineItemsTable } from "../components/invoice-form/EditableLineItemsTable";
import { InvoiceDetailsCard } from "../components/invoice-form/InvoiceDetailsCard";
import { InvoiceSourceNotice } from "../components/invoice-form/InvoiceSourceNotice";
import { SaleAssignmentBlocked } from "../components/invoice-form/SaleAssignmentBlocked";
import { useDamagePrefill } from "../hooks/useDamagePrefill";
import { useInvoiceFormLogic } from "../hooks/useInvoiceFormLogic";
import type { InvoiceFormValues } from "../lib/invoiceFormSchema";

function invoiceSubmitBlock(chargeBlock: string | null, isEdit: boolean, version: number | null | undefined) {
  if (chargeBlock) return chargeBlock;
  return isEdit && version == null ? "Cargando la factura…" : undefined;
}

function StickySubmitBar({ total, currency, children }: { total: number; currency: string | undefined; children: React.ReactNode }) {
  return (
    <div className="sticky bottom-0 z-10 flex flex-col gap-3 rounded-t-lg border-t bg-background/95 py-3 backdrop-blur sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-muted-foreground">
        Total <span className="ml-1 font-mono text-base font-semibold text-foreground">{formatCurrencyWithCode(total, currency)}</span>
      </p>
      {children}
    </div>
  );
}

export default function InvoiceForm() {
  const navigate = useNavigateTransition();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromQuoteId = searchParams.get("from_quote");
  const damageId = searchParams.get("damage_id");
  const extensionId = searchParams.get("extension_id");

  const f = useInvoiceFormLogic({ id, fromQuoteId, extensionId });
  const linkExtensionInvoice = useLinkExtensionInvoice();

  useDamagePrefill({
    isEdit: f.isEdit,
    damageId,
    damageCustomerId: searchParams.get("customer_id"),
    customers: f.customers,
    form: f.form,
    handleCustomerSelect: f.handleCustomerSelect,
  });

  const taxRate = useWatch({ control: f.form.control, name: "taxRate" });
  const currency = useWatch({ control: f.form.control, name: "cfdi.moneda" });
  const isSubmitting = f.saveInvoice.isPending;
  const submitBlock = invoiceSubmitBlock(f.chargeBlock, f.isEdit, f.invoiceVersion);
  // R16 F-03: el guard acepta getter y lo evalúa DENTRO del callback del blocker,
  // así ve `justSavedRef.current=true` justo después de reset()+navigate().
  const justSavedRef = useRef(false);
  useUnsavedChangesGuard(
    () => f.form.formState.isDirty && !isSubmitting && !justSavedRef.current,
  );

  const onSubmit = (values: InvoiceFormValues) => {
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
      damageId: !f.isEdit && damageId && damageId !== "null" ? damageId : null,
    }, {
      onSuccess: async (data) => {
        if (f.isEdit) {
          finalize("Factura actualizada", data.id);
          return;
        }
        // El daño, cuando existe, ya quedó ligado por el mismo RPC que creó la
        // factura. Un conflicto revierte la factura completa y no llega aquí.
        // Bloque 1 · G: la extensión queda reservada a esta factura; sólo se
        // marca como facturada cuando la factura se emite (trigger en BD).
        if (extensionId && f.extension?.booking_id) {
          await linkExtensionInvoice.mutateAsync({
            extensionId,
            bookingId: f.extension.booking_id,
            invoiceId: data.id,
          });
        }
        if (f.fromQuoteId) f.updateQuote.mutate({ id: f.fromQuoteId, status: "accepted" });
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
          <InvoiceSourceNotice extension={f.extension} quoteNumber={f.sourceQuote?.quote_number ?? null} />
          <InvoiceDetailsCard
            isEdit={f.isEdit}
            form={f.form}
            customers={f.customers}
            availableBookings={f.availableBookings}
            handleCustomerSelect={f.handleCustomerSelect}
            handleBookingsChange={f.handleBookingsChange}
          />

          <CfdiFieldsCard />

          {(f.chargeBlock || f.bookingAvailabilityBlock) && (
            <div role="alert" className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 space-y-2">
              <p>{f.chargeBlock || f.bookingAvailabilityBlock}</p>
              <p className="text-sm text-muted-foreground">Los borradores también reservan cargos. Si hay partidas históricas sin vínculo, concílialas antes de continuar.</p>
              <Button type="button" variant="outline" size="sm" disabled={f.isLoadingChargeAvailability}
                onClick={() => void f.retryChargeAvailability()}>Reintentar consulta</Button>
            </div>
          )}
          <EditableLineItemsTable />

          <TotalsSummary
            subtotal={f.subtotal}
            taxRate={taxRate}
            taxAmount={f.taxAmount}
            total={f.total}
            currency={currency}
            onTaxRateChange={(v) => f.form.setValue("taxRate", v, { shouldDirty: true })}
          />

          {f.form.formState.errors.taxRate?.message && (
            <p role="alert" className="text-sm text-destructive">{f.form.formState.errors.taxRate.message}</p>
          )}

          <Card>
            <CardHeader><CardTitle className="text-base">Notas</CardTitle></CardHeader>
            <CardContent>
              <FormField control={f.form.control} name="notes" render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <Textarea placeholder="Notas adicionales…" rows={3} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )} />
            </CardContent>
          </Card>

          {/* R5-16: en edición, bloquear Guardar hasta que `existing` resuelva
              y haya invoiceVersion; sin ella el UPDATE iría sin bloqueo optimista. */}
          <StickySubmitBar total={f.total} currency={currency}>
            <FormActions submitLabel={f.isEdit ? "Actualizar factura" : "Crear factura"} isPending={f.isPending} onCancel={() => navigate(-1)}
              submitDisabled={!!submitBlock}
              submitDisabledReason={submitBlock}
            />
          </StickySubmitBar>
        </form>
      </Form>
    </PageContainer>
  );
}
