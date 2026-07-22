import { NotesCard } from "@/components/domain/NotesCard";
import { FormActions } from "@/components/forms/FormActions";
import { FormPageHeader } from "@/components/layout/FormPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { CustomerField } from "../components/quote-form/CustomerField";
import { LogisticsCard } from "../components/quote-form/LogisticsCard";
import { QuoteDetailsCard } from "../components/quote-form/QuoteDetailsCard";
import { QuoteTypeCard } from "../components/quote-form/QuoteTypeCard";
import { CostSummaryCard } from "../components/quotes/CostSummaryCard";
import { RentalLineItems } from "../components/quotes/RentalLineItems";
import { SaleLineItems } from "../components/quotes/SaleLineItems";
import { useQuoteFormLogic } from "../hooks/quoteForm/useQuoteFormLogic";

export default function QuoteForm() {
  const f = useQuoteFormLogic();
  const { form } = f;
  const isRental = f.quoteType === "rental";

  return (
    <PageContainer maxWidth="form">
      <FormPageHeader title={f.id ? "Editar Cotización" : "Nueva Cotización"} />
      <Form {...form}>
        <form onSubmit={f.handleSubmit} className="space-y-6">
          <QuoteTypeCard value={f.quoteType} onChange={f.handleTypeChange} />

          <CustomerField form={form} customers={f.customers ?? []} />

          <QuoteDetailsCard form={form} isRental={isRental} />

          {!isRental && (
            <FormField
              control={form.control}
              name="saleLines"
              render={({ field }) => (
                <FormItem>
                  <FormControl>
                    <SaleLineItems lines={field.value} onChange={field.onChange} models={f.equipmentModels || []} />
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
                      startDate={f.startDate}
                      endDate={f.endDate}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <LogisticsCard form={form} includeLogistics={f.includeLogistics} />

          <CostSummaryCard
            lineItems={f.lineItems}
            subtotal={f.subtotal}
            taxRate={f.taxRate}
            taxAmount={f.taxAmount}
            total={f.total}
            currency={f.currency}
          />

          <FormField
            control={form.control}
            name="notes"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <NotesCard value={field.value} onChange={field.onChange} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormActions
            submitLabel={f.id ? "Actualizar Cotización" : "Crear Cotización"}
            isPending={f.isPending}
            onCancel={() => f.navigate(-1)}
          />
        </form>
      </Form>
    </PageContainer>
  );
}
