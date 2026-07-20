import type { DateRange } from "react-day-picker";
import { NotesCard } from "@/components/domain/NotesCard";
import { DatePickerField } from "@/components/forms/DatePickerField";
import { DateRangePickerField } from "@/components/forms/DateRangePickerField";
import { FormActions } from "@/components/forms/FormActions";
import { FormPageHeader } from "@/components/layout/FormPageHeader";
import { PageContainer } from "@/components/layout/PageContainer";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CustomerSelector } from "@/features/customers";
import { APP_CONFIG } from "@/lib/config";
import { CostSummaryCard } from "../components/quotes/CostSummaryCard";
import { RentalLineItems } from "../components/quotes/RentalLineItems";
import { SaleLineItems } from "../components/quotes/SaleLineItems";
import { useQuoteFormLogic } from "../hooks/useQuoteFormLogic";

export default function QuoteForm() {
  const f = useQuoteFormLogic();
  const { form } = f;

  return (
    <PageContainer maxWidth="form">
      <FormPageHeader title={f.id ? "Editar Cotización" : "Nueva Cotización"} />
      <Form {...form}>
        <form onSubmit={f.handleSubmit} className="space-y-6">
          <Card>
            <CardHeader><CardTitle className="text-base">Tipo de Cotización</CardTitle></CardHeader>
            <CardContent>
              <Tabs value={f.quoteType} onValueChange={f.handleTypeChange}>
                <TabsList className="w-full">
                  <TabsTrigger value="rental" className="flex-1">Renta</TabsTrigger>
                  <TabsTrigger value="sale" className="flex-1">Venta</TabsTrigger>
                </TabsList>
              </Tabs>
            </CardContent>
          </Card>

          <FormField
            control={form.control}
            name="customerId"
            render={({ field }) => (
              <FormItem>
                <FormControl>
                  <CustomerSelector
                    customers={f.customers}
                    customerId={field.value}
                    customerName={form.getValues("customerName")}
                    onCustomerIdChange={field.onChange}
                    onCustomerNameChange={(name) => form.setValue("customerName", name, { shouldDirty: true })}
                    required
                    hideManualName
                    helpText="Si tu cliente no aparece en la lista, selecciona 'Público en General' o regístralo primero en el módulo de Clientes."
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <Card>
            <CardHeader><CardTitle className="text-base">Detalles de Cotización</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {f.quoteType === "rental" && (
                <FormField
                  control={form.control}
                  name="dateRange"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <DateRangePickerField
                          label="Periodo de Renta"
                          dateRange={field.value as DateRange | undefined}
                          onSelect={(v) => field.onChange(v)}
                          required
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <FormField
                  control={form.control}
                  name="currency"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <Label>Moneda</Label>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {APP_CONFIG.CURRENCY_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="taxRate"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5">
                      <Label>IVA</Label>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                        <SelectContent>
                          {APP_CONFIG.TAX_RATE_OPTIONS.map((opt) => (
                            <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="validUntil"
                  render={({ field }) => (
                    <FormItem>
                      <FormControl>
                        <DatePickerField
                          label="Válida Hasta"
                          date={field.value}
                          onSelect={(d) => field.onChange(d)}
                          placeholder="Seleccionar fecha"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {f.quoteType === "sale" && (
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

          {f.quoteType === "rental" && (
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

          <Card>
            <CardContent className="pt-6 space-y-3">
              <FormField
                control={form.control}
                name="includeLogistics"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center gap-2 space-y-0">
                    <FormControl>
                      <Checkbox
                        id="include-logistics"
                        checked={field.value}
                        onCheckedChange={(checked) => {
                          const on = !!checked;
                          field.onChange(on);
                          if (!on) form.setValue("logisticsCost", 0, { shouldDirty: true });
                        }}
                      />
                    </FormControl>
                    <Label htmlFor="include-logistics" className="cursor-pointer">Incluir Servicio de Logística</Label>
                  </FormItem>
                )}
              />
              {f.includeLogistics && (
                <FormField
                  control={form.control}
                  name="logisticsCost"
                  render={({ field }) => (
                    <FormItem className="space-y-1.5 max-w-xs">
                      <Label>Monto del Servicio</Label>
                      <FormControl>
                        <Input
                          type="number"
                          min={0}
                          step="0.01"
                          placeholder="0.00"
                          value={field.value || ""}
                          onChange={(e) => field.onChange(Number(e.target.value) || 0)}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}
            </CardContent>
          </Card>

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
