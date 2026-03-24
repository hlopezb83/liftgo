import { useState, useEffect, useMemo } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCustomers } from "@/hooks/useCustomers";
import { useEquipmentModels } from "@/hooks/useEquipmentModels";
import { useQuote, useCreateQuote, useUpdateQuote, useNextQuoteNumber } from "@/hooks/useQuotes";
import { generateLineItemsFromModel, computeTotals, type LineItem } from "@/lib/invoiceUtils";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { parseDateLocal } from "@/lib/utils";
import type { DateRange } from "react-day-picker";
import type { SaleLine } from "@/components/quotes/SaleLineItems";
import type { RentalLine } from "@/components/quotes/RentalLineItems";

const EMPTY_SALE_LINE: SaleLine = { modelId: "", quantity: 1, unitPrice: 0, discount: 0, discountType: "%" };
const EMPTY_RENTAL_LINE: RentalLine = { modelId: "", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 0, discount: 0, discountType: "%" };

export function useQuoteFormLogic() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: customers } = useCustomers();
  const { data: existingQuote } = useQuote(id);
  const { data: nextNumber } = useNextQuoteNumber();
  const { data: equipmentModels } = useEquipmentModels();
  const createQuote = useCreateQuote();
  const updateQuote = useUpdateQuote();

  const [quoteType, setQuoteType] = useState<"rental" | "sale">("rental");
  const [rentalLines, setRentalLines] = useState<RentalLine[]>([{ ...EMPTY_RENTAL_LINE }]);
  const [saleLines, setSaleLines] = useState<SaleLine[]>([{ ...EMPTY_SALE_LINE }]);
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [taxRate, setTaxRate] = useState("16");
  const [currency, setCurrency] = useState("MXN");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState<Date>();
  const [includeLogistics, setIncludeLogistics] = useState(false);
  const [logisticsCost, setLogisticsCost] = useState(0);

  // Restore form state from existing quote
  useEffect(() => {
    if (existingQuote) {
      const isSale = existingQuote.quote_type === "sale";
      setQuoteType(isSale ? "sale" : "rental");
      setCustomerId(existingQuote.customer_id || "");
      setCustomerName(existingQuote.customer_name || "");
      if (existingQuote.start_date && existingQuote.end_date) {
        setDateRange({ from: parseDateLocal(existingQuote.start_date), to: parseDateLocal(existingQuote.end_date) });
      }
      setTaxRate(String(existingQuote.tax_rate));
      setCurrency((existingQuote as unknown as { currency?: string }).currency || "MXN");
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

      if (!isSale && equipmentModels) {
        const nonLogisticsItems = allItems.filter((item) => !item.description?.includes("Logística"));
        // Read rental_meta from dedicated column first, fallback to legacy _rentalMeta in line_items
        const meta = (existingQuote.rental_meta as unknown as RentalLine[] | undefined)
          || ((allItems as unknown as Array<LineItem & { _rentalMeta?: RentalLine[] }>)?.[0]?._rentalMeta);
        if (meta && meta.length > 0) {
          setRentalLines(meta);
        } else if (nonLogisticsItems.length > 0) {
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

    const payload = {
      quote_number: existingQuote?.quote_number || nextNumber || "COT-0001",
      customer_id: customerId || null,
      customer_name: customerName || null,
      forklift_id: null,
      equipment_model_id: firstModelId,
      start_date: quoteType === "rental" ? format(startDate!, "yyyy-MM-dd") : today,
      end_date: quoteType === "rental" ? format(endDate!, "yyyy-MM-dd") : today,
      line_items: lineItems as unknown as import("@/integrations/supabase/types").Json,
      subtotal, tax_rate: Number(taxRate), tax_amount: taxAmount, total,
      status: existingQuote?.status || "draft",
      valid_until: validUntil ? format(validUntil, "yyyy-MM-dd") : null,
      notes: notes || null,
      quote_type: quoteType,
      rental_meta: quoteType === "rental" ? (rentalLines as unknown as import("@/integrations/supabase/types").Json) : null,
    };

    if (id) {
      updateQuote.mutate({ id, ...payload }, { onSuccess: () => { toast.success("Cotización actualizada"); navigate(`/quotes/${id}`); } });
    } else {
      createQuote.mutate(payload, { onSuccess: () => { toast.success("Cotización creada"); navigate("/quotes"); } });
    }
  };

  return {
    id,
    quoteType,
    rentalLines,
    setRentalLines,
    saleLines,
    setSaleLines,
    customerId,
    setCustomerId,
    customerName,
    setCustomerName,
    dateRange,
    setDateRange,
    taxRate,
    setTaxRate,
    notes,
    setNotes,
    validUntil,
    setValidUntil,
    includeLogistics,
    setIncludeLogistics,
    logisticsCost,
    setLogisticsCost,
    customers,
    equipmentModels,
    lineItems,
    subtotal,
    taxAmount,
    total,
    startDate,
    endDate,
    isPending: createQuote.isPending || updateQuote.isPending,
    handleTypeChange,
    handleSubmit,
    navigate,
  };
}
