import { useNavigate, useParams } from "react-router-dom";
import { useCustomers } from "@/hooks/useCustomers";
import { useEquipmentModels } from "@/hooks/useEquipmentModels";
import { useQuote, useCreateQuote, useUpdateQuote, useNextQuoteNumber } from "@/hooks/useQuotes";
import { generateLineItemsFromModel, computeTotals, applyDiscount, type LineItem } from "@/lib/invoiceUtils";
import { formatCurrency } from "@/lib/formatCurrency";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
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
import { SaleLineItems, type SaleLine } from "@/components/SaleLineItems";
import { RentalLineItems, type RentalLine } from "@/components/RentalLineItems";
import { CostSummaryCard } from "@/components/CostSummaryCard";
import { NotesCard } from "@/components/NotesCard";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { useState, useEffect, useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { parseDateLocal } from "@/lib/utils";

const EMPTY_SALE_LINE: SaleLine = { modelId: "", quantity: 1, unitPrice: 0, discount: 0, discountType: "%" };
const EMPTY_RENTAL_LINE: RentalLine = { modelId: "", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 0, discount: 0, discountType: "%" };

export default function QuoteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: customers } = useCustomers();
  const { data: existingQuote } = useQuote(id);
  const { data: nextNumber } = useNextQuoteNumber();
  const createQuote = useCreateQuote();
  const updateQuote = useUpdateQuote();

  const [quoteType, setQuoteType] = useState<"rental" | "sale">("rental");
  const [rentalLines, setRentalLines] = useState<RentalLine[]>([{ ...EMPTY_RENTAL_LINE }]);
  const [saleLines, setSaleLines] = useState<SaleLine[]>([{ ...EMPTY_SALE_LINE }]);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [taxRate, setTaxRate] = useState("16");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState<Date>();
  const [includeLogistics, setIncludeLogistics] = useState(false);
  const [logisticsCost, setLogisticsCost] = useState(0);

  const { data: equipmentModels } = useEquipmentModels();

  useEffect(() => {
    if (existingQuote) {
      const isSale = (existingQuote as any).quote_type === "sale";
      setQuoteType(isSale ? "sale" : "rental");
      setCustomerId(existingQuote.customer_id || "");
      setCustomerName(existingQuote.customer_name || "");
      if (existingQuote.start_date && existingQuote.end_date) {
        setDateRange({ from: parseDateLocal(existingQuote.start_date), to: parseDateLocal(existingQuote.end_date) });
      }
      setTaxRate(String(existingQuote.tax_rate));
      setNotes(existingQuote.notes || "");
      setValidUntil(existingQuote.valid_until ? parseDateLocal(existingQuote.valid_until) : undefined);

      const allItems = (existingQuote.line_items as unknown as LineItem[]) || [];
      const logisticsItem = allItems.find((item) => item.description?.includes("Logística"));
      if (logisticsItem) {
        setIncludeLogistics(true);
        setLogisticsCost(logisticsItem.unit_price || logisticsItem.total || 0);
      }

      if (isSale && equipmentModels) {
        const nonLogisticsItems = allItems.filter((item) => !item.description?.includes("Logística"));
        if (nonLogisticsItems.length > 0) {
          const rebuilt = nonLogisticsItems.map((item) => {
            const found = equipmentModels.find(
              (m) => item.description?.includes(m.manufacturer) && item.description?.includes(m.model)
            );
            return {
              modelId: found?.id || "",
              quantity: item.quantity || 1,
              unitPrice: item.unit_price || 0,
              discount: item.discount || 0,
              discountType: (item.discount_type || "%") as "%" | "$",
            };
          });
          setSaleLines(rebuilt);
        }
      }

      // Restore rental lines from line_items metadata
      if (!isSale && equipmentModels) {
        const nonLogisticsItems = allItems.filter((item) => !item.description?.includes("Logística"));
        // Try to reconstruct rental lines from metadata stored in line_items
        const meta = (allItems as any)?.[0]?._rentalMeta as RentalLine[] | undefined;
        if (meta && meta.length > 0) {
          setRentalLines(meta);
        } else if (nonLogisticsItems.length > 0) {
          // Legacy: try to match models from descriptions
          const matchedModels = new Map<string, RentalLine>();
          for (const item of nonLogisticsItems) {
            const found = equipmentModels.find(
              (m) => item.description?.includes(m.manufacturer) && item.description?.includes(m.model)
            );
            if (found && !matchedModels.has(found.id)) {
              matchedModels.set(found.id, {
                modelId: found.id,
                quantity: 1,
                dailyRate: found.default_daily_rate ?? 0,
                weeklyRate: found.default_weekly_rate ?? 0,
                monthlyRate: found.default_monthly_rate ?? 0,
                discount: item.discount || 0,
                discountType: (item.discount_type || "%") as "%" | "$",
              });
            }
          }
          if (matchedModels.size > 0) {
            setRentalLines(Array.from(matchedModels.values()));
          }
        }
      }
    } else if (!validUntil) {
      setValidUntil(addDays(new Date(), 30));
    }
  }, [existingQuote, equipmentModels]);

  const startDate = dateRange?.from;
  const endDate = dateRange?.to;

  const lineItems: LineItem[] = useMemo(() => {
    let items: LineItem[] = [];
    if (quoteType === "sale") {
      if (!equipmentModels) return [];
      items = saleLines
        .filter((l) => l.modelId && l.unitPrice > 0 && l.quantity > 0)
        .map((l) => {
          const m = equipmentModels.find((em) => em.id === l.modelId);
          return {
            description: m ? `${m.manufacturer} ${m.model} - Venta de equipo` : "Venta de equipo",
            quantity: l.quantity,
            unit_price: l.unitPrice,
            total: l.quantity * l.unitPrice,
            discount: l.discount || 0,
            discount_type: l.discountType || "%",
          };
        });
    } else {
      if (!equipmentModels || !startDate || !endDate) return [];
      const validLines = rentalLines.filter((l) => l.modelId && (l.dailyRate > 0 || l.weeklyRate > 0 || l.monthlyRate > 0));
      for (const line of validLines) {
        const model = equipmentModels.find((m) => m.id === line.modelId);
        const modelName = model ? `${model.manufacturer} ${model.model}` : "Equipo";
        const generated = generateLineItemsFromModel(
          modelName, line.dailyRate, line.weeklyRate, line.monthlyRate,
          format(startDate, "yyyy-MM-dd"), format(endDate, "yyyy-MM-dd"), line.quantity
        );
        for (const item of generated) {
          if (line.discount && line.discount > 0) {
            item.discount = line.discount;
            item.discount_type = line.discountType;
          }
          items.push(item);
        }
      }
    }
    if (includeLogistics && logisticsCost > 0) {
      items.push({ description: "Servicio de Logística", quantity: 1, unit_price: logisticsCost, total: logisticsCost });
    }
    return items;
  }, [equipmentModels, rentalLines, startDate, endDate, quoteType, saleLines, includeLogistics, logisticsCost]);

  const { subtotal, taxAmount, total } = computeTotals(lineItems, Number(taxRate) || 0);

  const handleTypeChange = (type: string) => {
    setQuoteType(type as "rental" | "sale");
    setRentalLines([{ ...EMPTY_RENTAL_LINE }]);
    setSaleLines([{ ...EMPTY_SALE_LINE }]);
    setDateRange(undefined);
    setIncludeLogistics(false);
    setLogisticsCost(0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) { toast.error("Selecciona un cliente"); return; }
    if (quoteType === "rental" && (!startDate || !endDate)) { toast.error("Selecciona el periodo de renta"); return; }
    if (quoteType === "rental") {
      const validLines = rentalLines.filter((l) => l.modelId && (l.dailyRate > 0 || l.weeklyRate > 0 || l.monthlyRate > 0));
      if (validLines.length === 0) { toast.error("Agrega al menos un modelo con tarifas"); return; }
    }
    if (quoteType === "sale") {
      const validLines = saleLines.filter((l) => l.modelId && l.unitPrice > 0 && l.quantity > 0);
      if (validLines.length === 0) { toast.error("Agrega al menos un modelo con cantidad y precio"); return; }
    }

    const today = format(new Date(), "yyyy-MM-dd");
    const firstModelId = quoteType === "sale"
      ? (saleLines.find((l) => l.modelId)?.modelId || null)
      : (rentalLines.find((l) => l.modelId)?.modelId || null);

    // Store rental meta in the first line item for restoration on edit
    const finalLineItems = [...lineItems];
    if (quoteType === "rental" && finalLineItems.length > 0) {
      (finalLineItems[0] as any)._rentalMeta = rentalLines;
    }

    const payload = {
      quote_number: existingQuote?.quote_number || nextNumber || "COT-0001",
      customer_id: customerId || null,
      customer_name: customerName || null,
      forklift_id: null,
      equipment_model_id: firstModelId,
      start_date: quoteType === "rental" ? format(startDate!, "yyyy-MM-dd") : today,
      end_date: quoteType === "rental" ? format(endDate!, "yyyy-MM-dd") : today,
      line_items: finalLineItems as unknown as import("@/integrations/supabase/types").Json,
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
        {/* 1. Tipo de Cotización */}
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

        {/* 2. Cliente */}
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

        {/* 3. Detalles de Cotización */}
        <Card>
          <CardHeader><CardTitle className="text-base">Detalles de Cotización</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {quoteType === "rental" && (
              <DateRangePickerField label="Periodo de Renta *" dateRange={dateRange} onSelect={setDateRange} required />
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

        {/* 4. Equipos a Cotizar */}
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

        {/* 5. Servicio de Logística */}
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

        {/* 6. Resumen de Costos */}
        <CostSummaryCard lineItems={lineItems} subtotal={subtotal} taxRate={taxRate} taxAmount={taxAmount} total={total} />

        {/* 7. Notas */}
        <NotesCard value={notes} onChange={setNotes} />

        {/* 8. Acciones */}
        <FormActions submitLabel={id ? "Actualizar Cotización" : "Crear Cotización"} isPending={createQuote.isPending || updateQuote.isPending} onCancel={() => navigate(-1)} />
      </form>
    </div>
  );
}
