import { useNavigate, useParams } from "react-router-dom";
import { useForklifts, useCustomers, useBookings, useMaintenanceLogs } from "@/hooks/useForkliftData";
import { useQuote, useCreateQuote, useUpdateQuote, useNextQuoteNumber } from "@/hooks/useQuotes";
import { generateLineItems, computeTotals, type LineItem } from "@/lib/invoiceUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CustomerSelector } from "@/components/CustomerSelector";
import { DatePickerField } from "@/components/DatePickerField";
import { DateRangePickerField } from "@/components/DateRangePickerField";
import { FormActions } from "@/components/FormActions";
import { ArrowLeft } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import type { DateRange } from "react-day-picker";
import { toast } from "sonner";
import { format, addDays, parseISO, areIntervalsOverlapping, isPast, differenceInDays } from "date-fns";
import { formatCurrency } from "@/lib/formatCurrency";

export default function QuoteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: forklifts } = useForklifts();
  const { data: customers } = useCustomers();
  const { data: allBookings } = useBookings();
  const { data: maintenanceLogs } = useMaintenanceLogs();
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

  const startDate = dateRange?.from;
  const endDate = dateRange?.to;
  const datesSelected = !!startDate && !!endDate;

  // Forklifts due for maintenance
  const maintenanceDueIds = useMemo(() => {
    if (!maintenanceLogs) return new Set<string>();
    const ids = new Set<string>();
    const seen = new Set<string>();
    maintenanceLogs.forEach((log) => {
      if (!seen.has(log.forklift_id)) {
        seen.add(log.forklift_id);
        if (log.next_service_date && (isPast(parseISO(log.next_service_date)) || differenceInDays(parseISO(log.next_service_date), new Date()) <= 3)) {
          ids.add(log.forklift_id);
        }
      }
    });
    return ids;
  }, [maintenanceLogs]);

  // Filter to forklifts available for the selected dates
  const availableForklifts = useMemo(() => {
    if (!forklifts || !datesSelected) return [];
    return forklifts.filter((f) => {
      if (f.status !== "available" || maintenanceDueIds.has(f.id)) return false;
      const hasOverlap = allBookings?.some(
        (b) =>
          b.forklift_id === f.id &&
          b.status !== "completed" &&
          areIntervalsOverlapping(
            { start: startDate!, end: endDate! },
            { start: parseISO(b.start_date), end: parseISO(b.end_date) }
          )
      );
      return !hasOverlap;
    });
  }, [forklifts, datesSelected, startDate, endDate, allBookings, maintenanceDueIds]);

  // Reset forklift if no longer available after date change
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
    if (!forkliftId || !startDate || !endDate) { toast.error("Fill required fields"); return; }

    const payload = {
      quote_number: existingQuote?.quote_number || nextNumber || "QUO-0001",
      customer_id: customerId || null,
      customer_name: customerName || null,
      forklift_id: forkliftId,
      start_date: format(startDate, "yyyy-MM-dd"),
      end_date: format(endDate, "yyyy-MM-dd"),
      line_items: lineItems as any,
      subtotal, tax_rate: Number(taxRate), tax_amount: taxAmount, total,
      status: existingQuote?.status || "draft",
      valid_until: validUntil ? format(validUntil, "yyyy-MM-dd") : null,
      notes: notes || null,
    };

    if (id) {
      updateQuote.mutate({ id, ...payload }, { onSuccess: () => { toast.success("Quote updated"); navigate(`/quotes/${id}`); } });
    } else {
      createQuote.mutate(payload, { onSuccess: () => { toast.success("Quote created"); navigate("/quotes"); } });
    }
  };

  return (
    <div className="p-6 max-w-3xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-2xl font-bold">{id ? "Edit Quote" : "New Quote"}</h1>
      </div>
      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Quote Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <DateRangePickerField label="Rental Period *" dateRange={dateRange} onSelect={setDateRange} required />

            <div className="space-y-1.5">
              <Label>Forklift *</Label>
              <Select value={forkliftId} onValueChange={setForkliftId} disabled={!datesSelected}>
                <SelectTrigger>
                  <SelectValue placeholder={datesSelected ? "Select a forklift" : "Select dates first"} />
                </SelectTrigger>
                <SelectContent>
                  {availableForklifts.map((f) => <SelectItem key={f.id} value={f.id}>{f.name} — {f.model}</SelectItem>)}
                </SelectContent>
              </Select>
              {datesSelected && availableForklifts.length === 0 && (
                <p className="text-xs text-muted-foreground">No forklifts available for the selected dates.</p>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>VAT Rate (%)</Label>
                <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </div>
              <DatePickerField label="Valid Until" date={validUntil} onSelect={setValidUntil} />
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

        {lineItems.length > 0 && (
          <Card>
            <CardHeader><CardTitle className="text-base">Cost Preview</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {lineItems.map((item, i) => (
                <div key={i} className="flex justify-between text-sm">
                  <span>{item.description} × {item.quantity}</span>
                  <span className="font-mono">{formatCurrency(item.total)}</span>
                </div>
              ))}
              <div className="border-t pt-2 mt-2 space-y-1">
                <div className="flex justify-between text-sm"><span>Subtotal</span><span className="font-mono">{formatCurrency(subtotal)}</span></div>
                <div className="flex justify-between text-sm"><span>VAT ({taxRate}%)</span><span className="font-mono">{formatCurrency(taxAmount)}</span></div>
                <div className="flex justify-between font-bold"><span>Total</span><span className="font-mono">{formatCurrency(total)}</span></div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardHeader><CardTitle className="text-base">Notes</CardTitle></CardHeader>
          <CardContent>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes..." rows={3} />
          </CardContent>
        </Card>

        <FormActions submitLabel={id ? "Update Quote" : "Create Quote"} isPending={createQuote.isPending || updateQuote.isPending} onCancel={() => navigate(-1)} />
      </form>
    </div>
  );
}
