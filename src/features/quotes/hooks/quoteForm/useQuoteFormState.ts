import { useState } from "react";
import type { RentalLine } from "../../components/quotes/RentalLineItems";
import type { SaleLine } from "../../components/quotes/SaleLineItems";
import type { DateRange } from "react-day-picker";

export const EMPTY_SALE_LINE: SaleLine = { modelId: "", quantity: 1, unitPrice: 0, discount: 0, discountType: "%" };
export const EMPTY_RENTAL_LINE: RentalLine = { modelId: "", quantity: 1, dailyRate: 0, weeklyRate: 0, monthlyRate: 0, discount: 0, discountType: "%" };

export function useQuoteFormState() {
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

  const handleTypeChange = (type: string) => {
    setQuoteType(type as "rental" | "sale");
    setRentalLines([{ ...EMPTY_RENTAL_LINE }]);
    setSaleLines([{ ...EMPTY_SALE_LINE }]);
    setDateRange(undefined);
    setIncludeLogistics(false);
    setLogisticsCost(0);
  };

  return {
    quoteType, setQuoteType,
    rentalLines, setRentalLines,
    saleLines, setSaleLines,
    customerId, setCustomerId,
    customerName, setCustomerName,
    dateRange, setDateRange,
    taxRate, setTaxRate,
    currency, setCurrency,
    notes, setNotes,
    validUntil, setValidUntil,
    includeLogistics, setIncludeLogistics,
    logisticsCost, setLogisticsCost,
    handleTypeChange,
  };
}
