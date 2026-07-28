import { useRef } from "react";
import { useWatch } from "react-hook-form";
import { useParams, useSearchParams } from "react-router";
import { TotalsSummary } from "@/components/domain/TotalsSummary";
import { FormActions } from "@/components/forms/FormActions";
import { FormPageHeader } from "@/components/layout/FormPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Textarea } from "@/components/ui/textarea";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { CfdiFieldsCard } from "../components/invoice-form/CfdiFieldsCard";
import { EditableLineItemsTable } from "../components/invoice-form/EditableLineItemsTable";
import { InvoiceDetailsCard } from "../components/invoice-form/InvoiceDetailsCard";
import { SaleAssignmentBlocked } from "../components/invoice-form/SaleAssignmentBlocked";
import { useDamagePrefill } from "../hooks/useDamagePrefill";
import { useInvoiceFormLogic } from "../hooks/useInvoiceFormLogic";
import type { InvoiceFormValues } from "../lib/invoiceFormSchema";

export default function InvoiceForm() {
  const navigate = useNavigateTransition();
  const { id } = useParams();
  const [searchParams] = useSearchParams();
  const fromQuoteId = searchParams.get("from_quote");

  const f = useInvoiceFormLogic({ id, fromQuoteId });

  useDamagePrefill({
    isEdit: f.isEdit,
    damageId: searchParams.get("damage_id"),
    damageCustomerId: searchParams.get("customer_id"),
    damageAmount: searchParams.get("amount"),
    form: f.form,
    handleCustomerSelect: f.handleCustomerSelect,
  });

  const taxRate = useWatch({ control: f.form.control, name: "taxRate" });
  const isSubmitting = f.createInvoice.isPending || f.updateInvoice.isPending;
  // R16 F-03: el guard acepta getter y lo evalúa DENTRO del callback del blocker,
  // así ve `justSavedRef.current=true` justo después de reset()+navigate().
  const justSavedRef = useRef(false);
  useUnsavedChangesGuard(
    () => f.form.formState.isDirty && !isSubmitting && !justSavedRef.current,
  );

  const onSubmit = (values: InvoiceFormValues) => {
    const payload = f.onSubmit(values);
    const bookingIds = values.bookingIds ?? [];
    const finalize = (successMsg: string, invoiceId: string) => {
      justSavedRef.current = true;
      f.form.reset(values);
      notifySuccess(successMsg);
      navigate(`/invoices/${invoiceId}`);
    };
    if (f.isEdit && f.id) {
      const invoiceId = f.id;
      f.updateInvoice.mutate({ id: invoiceId, ...payload }, {
        onSuccess: async () => {
          await f.syncInvoiceBookings.mutateAsync({ invoiceId, bookingIds });
          finalize("Factura actualizada", invoiceId);
        },
      });
    } else {
      f.createInvoice.mutate(payload, {
        onSuccess: async (data) => {
          await f.syncInvoiceBookings.mutateAsync({ invoiceId: data.id, bookingIds });
          if (f.fromQuoteId) f.updateQuote.mutate({ id: f.fromQuoteId, status: "accepted" });
          finalize(`Factura ${data.invoice_number} creada`, data.id);
        },
      });
    }
  };

  if (f.saleAssignmentGuard.shouldBlock) {
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

  return (
    <PageContainer maxWidth="wide">
      <FormPageHeader title={f.isEdit ? "Editar Factura" : "Nueva Factura"} />

      <Form {...f.form}>
        {/* eslint-disable-next-line react-hooks/refs -- onSubmit only writes justSavedRef inside async callbacks */}
        <form onSubmit={f.form.handleSubmit(onSubmit)} className="space-y-6">
          <InvoiceDetailsCard
            isEdit={f.isEdit}
            form={f.form}
            customers={f.customers}
            availableBookings={f.availableBookings}
            handleCustomerSelect={f.handleCustomerSelect}
            handleBookingsChange={f.handleBookingsChange}
          />

          <CfdiFieldsCard />

          <EditableLineItemsTable />

          <TotalsSummary
            subtotal={f.subtotal}
            taxRate={taxRate}
            taxAmount={f.taxAmount}
            total={f.total}
            onTaxRateChange={(v) => f.form.setValue("taxRate", v, { shouldDirty: true })}
          />

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

          <FormActions submitLabel={f.isEdit ? "Actualizar Factura" : "Crear Factura"} isPending={f.isPending} onCancel={() => navigate(-1)} />
        </form>
      </Form>
    </PageContainer>
  );
}
