import { useNavigate, useParams } from "react-router-dom";
import { useCustomers } from "@/hooks/useCustomers";
import { useAvailableForklifts } from "@/hooks/useAvailableForklifts";
import { useEquipmentModels } from "@/hooks/useEquipmentModels";
import { useQuote, useCreateQuote, useUpdateQuote, useNextQuoteNumber } from "@/hooks/useQuotes";
import { generateLineItems, computeTotals, type LineItem } from "@/lib/invoiceUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { APP_CONFIG } from "@/lib/config";
import { CustomerSelector } from "@/components/CustomerSelector";
import { DatePickerField } from "@/components/DatePickerField";
import { DateRangePickerField } from "@/components/DateRangePickerField";
import { FormActions } from "@/components/FormActions";
import { FormPageHeader } from "@/components/FormPageHeader";
import { ForkliftSelector } from "@/components/ForkliftSelector";
import { SaleLineItems, type SaleLine } from "@/components/SaleLineItems";
import { CostSummaryCard } from "@/components/CostSummaryCard";
import { NotesCard } from "@/components/NotesCard";
import { useState, useEffect, useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { format, addDays } from "date-fns";

const EMPTY_SALE_LINE: SaleLine = { modelId: "", quantity: 1, unitPrice: 0 };

export default function QuoteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: customers } = useCustomers();
  const { data: existingQuote } = useQuote(id);
  const { data: nextNumber } = useNextQuoteNumber();
  const createQuote = useCreateQuote();
  const updateQuote = useUpdateQuote();

  const [quoteType, setQuoteType] = useState<"rental" | "sale">("rental");
  const [forkliftId, setForkliftId] = useState("");
  const [saleLines, setSaleLines] = useState<SaleLine[]>([{ ...EMPTY_SALE_LINE }]);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [taxRate, setTaxRate] = useState("16");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState<Date>();

  const { data: equipmentModels } = useEquipmentModels();

  useEffect(() => {
    if (existingQuote) {
      const isSale = (existingQuote as any).quote_type === "sale";
      setQuoteType(isSale ? "sale" : "rental");
      setForkliftId(existingQuote.forklift_id || "");
      setCustomerId(existingQuote.customer_id || "");
      setCustomerName(existingQuote.customer_name || "");
      if (existingQuote.start_date && existingQuote.end_date) {
        setDateRange({ from: new Date(existingQuote.start_date), to: new Date(existingQuote.end_date) });
      }
      setTaxRate(String(existingQuote.tax_rate));
      setNotes(existingQuote.notes || "");
      setValidUntil(existingQuote.valid_until ? new Date(existingQuote.valid_until) : undefined);

      if (isSale && equipmentModels) {
        const items = (existingQuote.line_items as unknown as LineItem[]) || [];
        if (items.length > 0) {
          const rebuilt = items.map((item) => {
            const found = equipmentModels.find(
              (m) => item.description?.includes(m.manufacturer) && item.description?.includes(m.model)
            );
            return {
              modelId: found?.id || "",
              quantity: item.quantity || 1,
              unitPrice: item.unit_price || 0,
            };
          });
          setSaleLines(rebuilt);
        }
      }
    } else if (!validUntil) {
      setValidUntil(addDays(new Date(), 30));
    }
  }, [existingQuote, equipmentModels]);

  const { availableForklifts, forklifts: allForkliftsFromHook, datesSelected } = useAvailableForklifts(dateRange);

  const startDate = dateRange?.from;
  const endDate = dateRange?.to;

  useEffect(() => {
    if (quoteType === "rental" && forkliftId && datesSelected && !availableForklifts.some((f) => f.id === forkliftId)) {
      setForkliftId("");
    }
  }, [availableForklifts, forkliftId, datesSelected, quoteType]);

  const forklift = allForkliftsFromHook?.find((f) => f.id === forkliftId);

  const lineItems: LineItem[] = useMemo(() => {
    if (quoteType === "sale") {
      if (!equipmentModels) return [];
      return saleLines
        .filter((l) => l.modelId && l.unitPrice > 0 && l.quantity > 0)
        .map((l) => {
          const m = equipmentModels.find((em) => em.id === l.modelId);
          return {
            description: m ? `${m.manufacturer} ${m.model} - Venta de equipo` : "Venta de equipo",
            quantity: l.quantity,
            unit_price: l.unitPrice,
            total: l.quantity * l.unitPrice,
          };
        });
    }
    if (!forklift || !startDate || !endDate) return [];
    return generateLineItems(forklift, format(startDate, "yyyy-MM-dd"), format(endDate, "yyyy-MM-dd"));
  }, [forklift, startDate, endDate, quoteType, saleLines, equipmentModels]);

  const { subtotal, taxAmount, total } = computeTotals(lineItems, Number(taxRate) || 0);

  const handleTypeChange = (type: string) => {
    setQuoteType(type as "rental" | "sale");
    setForkliftId("");
    setSaleLines([{ ...EMPTY_SALE_LINE }]);
    setDateRange(undefined);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (quoteType === "rental" && !forkliftId) { toast.error("Selecciona un montacargas"); return; }
    if (quoteType === "rental" && (!startDate || !endDate)) { toast.error("Selecciona el periodo de renta"); return; }
    if (quoteType === "sale") {
      const validLines = saleLines.filter((l) => l.modelId && l.unitPrice > 0 && l.quantity > 0);
      if (validLines.length === 0) { toast.error("Agrega al menos un modelo con cantidad y precio"); return; }
    }

    const today = format(new Date(), "yyyy-MM-dd");
    const firstModelId = quoteType === "sale" ? (saleLines.find((l) => l.modelId)?.modelId || null) : null;

    const payload = {
      quote_number: existingQuote?.quote_number || nextNumber || "COT-0001",
      customer_id: customerId || null,
      customer_name: customerName || null,
      forklift_id: quoteType === "rental" ? forkliftId : null,
      equipment_model_id: firstModelId,
      start_date: quoteType === "rental" ? format(startDate!, "yyyy-MM-dd") : today,
      end_date: quoteType === "rental" ? format(endDate!, "yyyy-MM-dd") : today,
      line_items: lineItems as unknown as import("@/integrations/supabase/types").Json,
      subtotal, tax_rate: Number(taxRate), tax_amount: taxAmount, total,
      status: existingQuote?.status || "draft",
      valid_until: validUntil ? format(validUntil, "yyyy-MM-dd") : null,
      notes: notes || null,
      quote_type: quoteType,
    };

    if (id) {
      updateQuote.mutate({ id, ...payload }, { onSuccess: () => { toast.success("Cotización actualizada"); navigate(`/quotes/${id}`); } });
    } else {
      createQuote.mutate(payload as any, { onSuccess: () => { toast.success("Cotización creada"); navigate("/quotes"); } });
    }
  };

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

        <Card>
          <CardHeader><CardTitle className="text-base">Detalles de Cotización</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {quoteType === "rental" && (
              <DateRangePickerField label="Periodo de Renta *" dateRange={dateRange} onSelect={setDateRange} required />
            )}

            {quoteType === "rental" && (
              <ForkliftSelector
                value={forkliftId}
                onValueChange={setForkliftId}
                availableForklifts={availableForklifts}
                datesSelected={datesSelected}
              />
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>IVA</Label>
                <Select value={taxRate} onValueChange={setTaxRate}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {APP_CONFIG.TAX_RATE_OPTIONS.map((opt) => (
                      <SelectItem key={opt.value} value={String(opt.value)}>
                        {opt.label}
                      </SelectItem>
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

        <CustomerSelector
          customers={customers}
          customerId={customerId}
          customerName={customerName}
          onCustomerIdChange={setCustomerId}
          onCustomerNameChange={setCustomerName}
        />

        <CostSummaryCard lineItems={lineItems} subtotal={subtotal} taxRate={taxRate} taxAmount={taxAmount} total={total} />

        <NotesCard value={notes} onChange={setNotes} />

        <FormActions submitLabel={id ? "Actualizar Cotización" : "Crear Cotización"} isPending={createQuote.isPending || updateQuote.isPending} onCancel={() => navigate(-1)} />
      </form>
    </div>
  );
}
