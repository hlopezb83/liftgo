import { useNavigate, useParams } from "react-router-dom";
import { useCustomers } from "@/hooks/useCustomers";
import { useAvailableForklifts } from "@/hooks/useAvailableForklifts";
import { useEquipmentModels } from "@/hooks/useEquipmentModels";
import { useQuote, useCreateQuote, useUpdateQuote, useNextQuoteNumber } from "@/hooks/useQuotes";
import { generateLineItems, computeTotals, applyDiscount, type LineItem } from "@/lib/invoiceUtils";
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
import { MultiForkliftSelector } from "@/components/ForkliftSelector";
import { SaleLineItems, type SaleLine } from "@/components/SaleLineItems";
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

export default function QuoteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: customers } = useCustomers();
  const { data: existingQuote } = useQuote(id);
  const { data: nextNumber } = useNextQuoteNumber();
  const createQuote = useCreateQuote();
  const updateQuote = useUpdateQuote();

  const [quoteType, setQuoteType] = useState<"rental" | "sale">("rental");
  const [forkliftIds, setForkliftIds] = useState<string[]>([]);
  const [saleLines, setSaleLines] = useState<SaleLine[]>([{ ...EMPTY_SALE_LINE }]);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [taxRate, setTaxRate] = useState("16");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState<Date>();
  const [includeLogistics, setIncludeLogistics] = useState(false);
  const [logisticsCost, setLogisticsCost] = useState(0);
  const [rentalDiscounts, setRentalDiscounts] = useState<Record<number, { value: number; type: "%" | "$" }>>({});

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

      // Restore logistics from existing line_items
      const allItems = (existingQuote.line_items as unknown as LineItem[]) || [];
      const logisticsItem = allItems.find((item) => item.description?.includes("Logística"));
      if (logisticsItem) {
        setIncludeLogistics(true);
        setLogisticsCost(logisticsItem.unit_price || logisticsItem.total || 0);
      }

      // Restore rental discounts from existing line_items
      if (!isSale) {
        const nonLogisticsItems = allItems.filter((item) => !item.description?.includes("Logística"));
        const restored: Record<number, { value: number; type: "%" | "$" }> = {};
        nonLogisticsItems.forEach((item, idx) => {
          if (item.discount && item.discount > 0) {
            restored[idx] = { value: item.discount, type: item.discount_type || "%" };
          }
        });
        if (Object.keys(restored).length > 0) setRentalDiscounts(restored);
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

      // Restore forklift ids for rental quotes
      if (!isSale && existingQuote.forklift_id) {
        // Start with the stored forklift_id; also try to find others from line_items
        const ids = new Set<string>([existingQuote.forklift_id]);
        // We'll refine after forklifts load via the other effect
        setForkliftIds(Array.from(ids));
      }
    } else if (!validUntil) {
      setValidUntil(addDays(new Date(), 30));
    }
  }, [existingQuote, equipmentModels]);

  const { availableForklifts, forklifts: allForkliftsFromHook, datesSelected } = useAvailableForklifts(dateRange);

  const startDate = dateRange?.from;
  const endDate = dateRange?.to;

  // Rebuild forkliftIds from line items when editing existing rental quote and forklifts are loaded
  useEffect(() => {
    if (!existingQuote || (existingQuote as any).quote_type === "sale" || !allForkliftsFromHook) return;
    const allItems = (existingQuote.line_items as unknown as LineItem[]) || [];
    const nonLogisticsItems = allItems.filter((item) => !item.description?.includes("Logística"));
    if (nonLogisticsItems.length === 0) return;

    const matchedIds = new Set<string>();
    if (existingQuote.forklift_id) matchedIds.add(existingQuote.forklift_id);

    for (const item of nonLogisticsItems) {
      const matched = allForkliftsFromHook.find((f) => item.description?.includes(f.name));
      if (matched) matchedIds.add(matched.id);
    }
    if (matchedIds.size > 0) {
      setForkliftIds(Array.from(matchedIds));
    }
  }, [existingQuote, allForkliftsFromHook]);

  // Remove selected forklifts that became unavailable
  useEffect(() => {
    if (quoteType === "rental" && datesSelected && forkliftIds.length > 0) {
      const availableSet = new Set(availableForklifts.map((f) => f.id));
      // When editing, also keep forklifts that are already in the quote
      const existingForkliftId = existingQuote?.forklift_id;
      const filtered = forkliftIds.filter((fid) => availableSet.has(fid) || fid === existingForkliftId);
      if (filtered.length !== forkliftIds.length) {
        setForkliftIds(filtered);
      }
    }
  }, [availableForklifts, forkliftIds, datesSelected, quoteType, existingQuote]);

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
      if (forkliftIds.length === 0 || !startDate || !endDate) return [];
      let rentalIdx = 0;
      for (const fid of forkliftIds) {
        const fl = allForkliftsFromHook?.find((f) => f.id === fid);
        if (fl) {
          const flItems = generateLineItems(fl, format(startDate, "yyyy-MM-dd"), format(endDate, "yyyy-MM-dd"));
          for (const item of flItems) {
            const d = rentalDiscounts[rentalIdx];
            if (d && d.value > 0) {
              item.discount = d.value;
              item.discount_type = d.type;
            }
            items.push(item);
            rentalIdx++;
          }
        }
      }
    }
    if (includeLogistics && logisticsCost > 0) {
      items.push({ description: "Servicio de Logística", quantity: 1, unit_price: logisticsCost, total: logisticsCost });
    }
    return items;
  }, [allForkliftsFromHook, forkliftIds, startDate, endDate, quoteType, saleLines, equipmentModels, includeLogistics, logisticsCost, rentalDiscounts]);

  const { subtotal, taxAmount, total } = computeTotals(lineItems, Number(taxRate) || 0);

  const handleTypeChange = (type: string) => {
    setQuoteType(type as "rental" | "sale");
    setForkliftIds([]);
    setSaleLines([{ ...EMPTY_SALE_LINE }]);
    setDateRange(undefined);
    setIncludeLogistics(false);
    setLogisticsCost(0);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerId) { toast.error("Selecciona un cliente"); return; }
    if (quoteType === "rental" && forkliftIds.length === 0) { toast.error("Selecciona al menos un montacargas"); return; }
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
      forklift_id: quoteType === "rental" ? (forkliftIds[0] || null) : null,
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

            {quoteType === "rental" && (
              <MultiForkliftSelector
                selectedIds={forkliftIds}
                onChange={setForkliftIds}
                availableForklifts={availableForklifts}
                allForklifts={allForkliftsFromHook}
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

        {/* 4. Equipos a Cotizar (solo venta) */}
        {quoteType === "sale" && (
          <SaleLineItems lines={saleLines} onChange={setSaleLines} models={equipmentModels || []} />
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
