import { useRef } from "react";
import { NotesCard } from "@/components/domain/NotesCard";
import { EmptyState } from "@/components/feedback/EmptyState";
import { QueryErrorState } from "@/components/feedback/QueryErrorState";
import { FormErrorSummary } from "@/components/forms/FormErrorSummary";
import { FormErrorSummaryScope } from "@/components/forms/FormErrorSummaryScope";
import { FormPageHeader } from "@/components/layout/FormPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Skeleton } from "@/components/ui/skeleton";
import { CustomerField } from "../components/quote-form/CustomerField";
import { LogisticsCard } from "../components/quote-form/LogisticsCard";
import { QuoteDetailsCard } from "../components/quote-form/QuoteDetailsCard";
import { QuoteFormFooter } from "../components/quote-form/QuoteFormFooter";
import { QuoteTypeCard } from "../components/quote-form/QuoteTypeCard";
import { CostSummaryCard } from "../components/quotes/CostSummaryCard";
import { RentalLineItems } from "../components/quotes/RentalLineItems";
import { SaleLineItems } from "../components/quotes/SaleLineItems";
import { useQuoteFormLogic } from "../hooks/quoteForm/useQuoteFormLogic";
import { useQuoteFormVisibility } from "../hooks/quoteForm/useQuoteFormVisibility";
import { quoteFormErrorLabel, quoteFormErrorTarget } from "../lib/quoteFormErrorSummary";

function QuoteInitialState({ f }: { f: ReturnType<typeof useQuoteFormLogic> }) {
  if (f.readQuery.isError) return <QueryErrorState entity={f.readEntity} error={f.readQuery.error}
    isRetrying={f.readQuery.isFetching} onRetry={() => { void f.readQuery.refetch(); }} />;
  if (f.recordNotFound) return <EmptyState title="Cotización no encontrada" subtitle="El registro ya no está disponible."
    actionLabel="Volver a cotizaciones" onAction={() => f.navigate("/quotes")} />;
  return <div role="status" aria-label="Cargando cotización" className="space-y-4"><Skeleton className="h-12" /><Skeleton className="h-64" /></div>;
}

export default function QuoteForm() {
  const f = useQuoteFormLogic();
  const { form } = f;
  const isRental = f.quoteType === "rental";
  const formRef = useRef<HTMLFormElement>(null);
  const footerRef = useRef<HTMLDivElement>(null);
  useQuoteFormVisibility(formRef, footerRef, f.initialRecordReady);

  if (f.id && !f.initialRecordReady) return <PageContainer className="mx-auto max-w-7xl">
    <FormPageHeader title="Editar cotización" />
    <QuoteInitialState f={f} />
  </PageContainer>;

  return (
    <PageContainer className="mx-auto max-w-7xl">
      <FormPageHeader
        title={f.id ? "Editar cotización" : "Nueva cotización"}
        subtitle={f.id ? f.quoteNumber ?? undefined : undefined}
      />
      {f.id && f.readQuery.isError && <QueryErrorState entity={f.readEntity} error={f.readQuery.error}
        isRetrying={f.readQuery.isFetching} onRetry={() => { void f.readQuery.refetch(); }} />}
      <Form {...form}>
        <FormErrorSummaryScope>
        <form ref={formRef} onSubmit={f.handleSubmit} className="space-y-4">
          <FormErrorSummary labelFor={quoteFormErrorLabel} targetFor={quoteFormErrorTarget} />
          <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
            <div className="min-w-0 space-y-4">
              <QuoteTypeCard value={f.quoteType} onChange={(type) => { void f.handleTypeChange(type); }} />

              <CustomerField form={form} customers={f.customers} customerListQuery={f.customerListQuery} />

              <QuoteDetailsCard form={form} isRental={isRental} />

              {!isRental && (
                <FormField
                  control={form.control}
                  name="saleLines"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <SaleLineItems lines={field.value} onChange={field.onChange} models={f.equipmentModels || []} modelsLoading={f.equipmentModelsLoading} currency={f.currency} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {isRental && (
                <FormField
                  control={form.control}
                  name="rentalLines"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <RentalLineItems
                          lines={field.value}
                          onChange={field.onChange}
                          models={f.equipmentModels || []}
                          modelsLoading={f.equipmentModelsLoading}
                          startDate={f.startDate}
                          endDate={f.endDate}
                          currency={f.currency}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <LogisticsCard form={form} includeLogistics={f.includeLogistics} includeInsurance={f.includeInsurance} />

              {f.chargeIdentityError && <Alert variant="destructive"><AlertDescription>{f.chargeIdentityError}</AlertDescription></Alert>}

              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <NotesCard
                        value={field.value}
                        onChange={field.onChange}
                        title="Notas para el cliente"
                        placeholder="Estas notas aparecerán en la cotización que recibe el cliente…"
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

            </div>
            <aside aria-label="Resumen de la cotización" className="min-w-0 xl:sticky xl:top-16">
              <CostSummaryCard
                lineItems={f.lineItems}
                subtotal={f.subtotal}
                taxRate={f.taxRate}
                taxAmount={f.taxAmount}
                total={f.total}
                currency={f.currency}
              />
            </aside>
          </div>
          <QuoteFormFooter
            ref={footerRef}
            total={f.total}
            currency={f.currency}
            isAmountLocked={f.isAmountLocked}
            submitLabel={f.id ? "Actualizar cotización" : "Crear cotización"}
            isPending={f.isPending}
            chargeIdentityError={f.chargeIdentityError}
            onCancel={() => f.navigate(-1)}
          />
        </form>
        </FormErrorSummaryScope>
      </Form>
    </PageContainer>
  );
}
