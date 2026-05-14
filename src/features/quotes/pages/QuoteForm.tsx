import { useQuoteFormLogic } from "@/features/quotes/hooks/useQuoteFormLogic";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP_CONFIG } from "@/lib/config";
import { CustomerSelector } from "@/components/customers/CustomerSelector";
import { DatePickerField } from "@/components/DatePickerField";
import { DateRangePickerField } from "@/components/DateRangePickerField";
import { FormActions } from "@/components/FormActions";
import { FormPageHeader } from "@/components/FormPageHeader";
import { SaleLineItems } from "@/features/quotes/components/quotes/SaleLineItems";
import { RentalLineItems } from "@/features/quotes/components/quotes/RentalLineItems";
import { CostSummaryCard } from "@/components/CostSummaryCard";
import { NotesCard } from "@/components/NotesCard";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";

export default function QuoteForm() {
  const {
    id, quoteType, rentalLines, setRentalLines, saleLines, setSaleLines,
    customerId, setCustomerId, customerName, setCustomerName,
    dateRange, setDateRange, taxRate, setTaxRate, currency, setCurrency,
    notes, setNotes, validUntil, setValidUntil, includeLogistics, setIncludeLogistics,
    logisticsCost, setLogisticsCost, customers, equipmentModels,
    lineItems, subtotal, taxAmount, total, startDate, endDate,
    isPending, handleTypeChange, handleSubmit, navigate,
  } = useQuoteFormLogic();

  return (
    <div className="p-6 max-w-3xl">
      <FormPageHeader title={id ? "Editar Cotización" : "Nueva Cotización"} />
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Tipo de Cotización</CardTitle></CardHeader>
          <CardContent>
            <Tabs value={quoteType} onValueChange={handleTypeChange}>
              <TabsList className="w-full">
                <TabsTrigger value="rental" className="flex-1">Renta</TabsTrigger>
                <TabsTrigger value="sale" className="flex-1">Venta</TabsTrigger>
              </TabsList>
            </Tabs>
          </CardContent>
        </Card>

        <CustomerSelector
          customers={customers}
          customerId={customerId}
          customerName={customerName}
          onCustomerIdChange={setCustomerId}
          onCustomerNameChange={setCustomerName}
          required
          hideManualName
          helpText="Si tu cliente no aparece en la lista, selecciona 'Público en General' o regístralo primero en el módulo de Clientes."
        />

        <Card>
          <CardHeader><CardTitle className="text-base">Detalles de Cotización</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {quoteType === "rental" && (
              <DateRangePickerField label="Periodo de Renta *" dateRange={dateRange} onSelect={setDateRange} required />
            )}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="space-y-1.5">
                <Label>Moneda</Label>
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {APP_CONFIG.CURRENCY_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>IVA</Label>
                <Select value={taxRate} onValueChange={setTaxRate}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {APP_CONFIG.TAX_RATE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>{opt.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DatePickerField label="Válida Hasta" date={validUntil} onSelect={setValidUntil} placeholder="Seleccionar fecha" />
            </div>
          </CardContent>
        </Card>

        {quoteType === "sale" && (
          <SaleLineItems lines={saleLines} onChange={setSaleLines} models={equipmentModels || []} />
        )}

        {quoteType === "rental" && (
          <RentalLineItems
            lines={rentalLines}
            onChange={setRentalLines}
            models={equipmentModels || []}
            startDate={startDate}
            endDate={endDate}
          />
        )}

        <Card>
          <CardContent className="pt-6 space-y-3">
            <div className="flex items-center gap-2">
              <Checkbox
                id="include-logistics"
                checked={includeLogistics}
                onCheckedChange={(checked) => {
                  setIncludeLogistics(!!checked);
                  if (!checked) setLogisticsCost(0);
                }}
              />
              <Label htmlFor="include-logistics" className="cursor-pointer">Incluir Servicio de Logística</Label>
            </div>
            {includeLogistics && (
              <div className="space-y-1.5 max-w-xs">
                <Label>Monto del Servicio</Label>
                <Input
                  type="number"
                  min={0}
                  step="0.01"
                  placeholder="0.00"
                  value={logisticsCost || ""}
                  onChange={(e) => setLogisticsCost(Number(e.target.value) || 0)}
                />
              </div>
            )}
          </CardContent>
        </Card>

        <CostSummaryCard lineItems={lineItems} subtotal={subtotal} taxRate={taxRate} taxAmount={taxAmount} total={total} currency={currency} />
        <NotesCard value={notes} onChange={setNotes} />
        <FormActions submitLabel={id ? "Actualizar Cotización" : "Crear Cotización"} isPending={isPending} onCancel={() => navigate(-1)} />
      </form>
    </div>
  );
}
