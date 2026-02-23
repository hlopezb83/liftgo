import { useNavigate, useParams } from "react-router-dom";
import { useCustomers, useAvailableForklifts } from "@/hooks/useForkliftData";
import { useQuote, useCreateQuote, useUpdateQuote, useNextQuoteNumber } from "@/hooks/useQuotes";
import { generateLineItems, computeTotals, type LineItem } from "@/lib/invoiceUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CustomerSelector } from "@/components/CustomerSelector";
import { DatePickerField } from "@/components/DatePickerField";
import { DateRangePickerField } from "@/components/DateRangePickerField";
import { FormActions } from "@/components/FormActions";
import { FormPageHeader } from "@/components/FormPageHeader";
import { ForkliftSelector } from "@/components/ForkliftSelector";
import { CostSummaryCard } from "@/components/CostSummaryCard";
import { NotesCard } from "@/components/NotesCard";
import { useState, useEffect, useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { format, addDays } from "date-fns";

export default function QuoteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: customers } = useCustomers();
  const { data: existingQuote } = useQuote(id);
  const { data: nextNumber } = useNextQuoteNumber();
  const createQuote = useCreateQuote();
  const updateQuote = useUpdateQuote();

  const [forkliftId, setForkliftId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [dateRange, setDateRange] = useState<DateRange | undefined>();
  const [taxRate, setTaxRate] = useState("16");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState<Date>();

  useEffect(() => {
    if (existingQuote) {
      setForkliftId(existingQuote.forklift_id || "");
      setCustomerId(existingQuote.customer_id || "");
      setCustomerName(existingQuote.customer_name || "");
      setDateRange({ from: new Date(existingQuote.start_date), to: new Date(existingQuote.end_date) });
      setTaxRate(String(existingQuote.tax_rate));
      setNotes(existingQuote.notes || "");
      setValidUntil(existingQuote.valid_until ? new Date(existingQuote.valid_until) : undefined);
    } else if (!validUntil) {
      setValidUntil(addDays(new Date(), 30));
    }
  }, [existingQuote]);

  const { availableForklifts, forklifts, datesSelected } = useAvailableForklifts(dateRange);
  const startDate = dateRange?.from;
  const endDate = dateRange?.to;

  useEffect(() => {
    if (forkliftId && datesSelected && !availableForklifts.some((f) => f.id === forkliftId)) {
      setForkliftId("");
    }
  }, [availableForklifts, forkliftId, datesSelected]);

  const forklift = forklifts?.find((f) => f.id === forkliftId);
  const lineItems: LineItem[] = useMemo(() => {
    if (!forklift || !startDate || !endDate) return [];
    return generateLineItems(forklift, format(startDate, "yyyy-MM-dd"), format(endDate, "yyyy-MM-dd"));
  }, [forklift, startDate, endDate]);

  const { subtotal, taxAmount, total } = computeTotals(lineItems, Number(taxRate) || 0);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!forkliftId || !startDate || !endDate) { toast.error("Llena los campos requeridos"); return; }

    const payload = {
      quote_number: existingQuote?.quote_number || nextNumber || "QUO-0001",
      customer_id: customerId || null,
      customer_name: customerName || null,
      forklift_id: forkliftId,
      start_date: format(startDate, "yyyy-MM-dd"),
      end_date: format(endDate, "yyyy-MM-dd"),
      line_items: lineItems as unknown as import("@/integrations/supabase/types").Json,
      subtotal, tax_rate: Number(taxRate), tax_amount: taxAmount, total,
      status: existingQuote?.status || "draft",
      valid_until: validUntil ? format(validUntil, "yyyy-MM-dd") : null,
      notes: notes || null,
    };

    if (id) {
      updateQuote.mutate({ id, ...payload }, { onSuccess: () => { toast.success("Cotización actualizada"); navigate(`/quotes/${id}`); } });
    } else {
      createQuote.mutate(payload, { onSuccess: () => { toast.success("Cotización creada"); navigate("/quotes"); } });
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      <FormPageHeader title={id ? "Editar Cotización" : "Nueva Cotización"} />
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Detalles de Cotización</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <DateRangePickerField label="Periodo de Renta *" dateRange={dateRange} onSelect={setDateRange} required />

            <ForkliftSelector
              value={forkliftId}
              onValueChange={setForkliftId}
              availableForklifts={availableForklifts}
              datesSelected={datesSelected}
            />

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>IVA (%)</Label>
                <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </div>
              <DatePickerField label="Válida Hasta" date={validUntil} onSelect={setValidUntil} placeholder="Seleccionar fecha" />
            </div>
          </CardContent>
        </Card>

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
