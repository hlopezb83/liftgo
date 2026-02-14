import { useNavigate, useParams } from "react-router-dom";
import { useForklifts, useCustomers } from "@/hooks/useForkliftData";
import { useQuote, useCreateQuote, useUpdateQuote, useNextQuoteNumber } from "@/hooks/useQuotes";
import { generateLineItems, computeTotals, type LineItem } from "@/lib/invoiceUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { ArrowLeft } from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { toast } from "sonner";
import { format, addDays } from "date-fns";
import { formatCurrency } from "@/lib/formatCurrency";

export default function QuoteForm() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data: forklifts } = useForklifts();
  const { data: customers } = useCustomers();
  const { data: existingQuote } = useQuote(id);
  const { data: nextNumber } = useNextQuoteNumber();
  const createQuote = useCreateQuote();
  const updateQuote = useUpdateQuote();

  const [forkliftId, setForkliftId] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [startDate, setStartDate] = useState<Date>();
  const [endDate, setEndDate] = useState<Date>();
  const [taxRate, setTaxRate] = useState("21");
  const [notes, setNotes] = useState("");
  const [validUntil, setValidUntil] = useState<Date>();

  useEffect(() => {
    if (existingQuote) {
      setForkliftId(existingQuote.forklift_id || "");
      setCustomerId(existingQuote.customer_id || "");
      setCustomerName(existingQuote.customer_name || "");
      setStartDate(new Date(existingQuote.start_date));
      setEndDate(new Date(existingQuote.end_date));
      setTaxRate(String(existingQuote.tax_rate));
      setNotes(existingQuote.notes || "");
      setValidUntil(existingQuote.valid_until ? new Date(existingQuote.valid_until) : undefined);
    } else if (!validUntil) {
      setValidUntil(addDays(new Date(), 30));
    }
  }, [existingQuote]);

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
      line_items: lineItems,
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
            <div className="space-y-1.5">
              <Label>Forklift *</Label>
              <Select value={forkliftId} onValueChange={setForkliftId}>
                <SelectTrigger><SelectValue placeholder="Select a forklift" /></SelectTrigger>
                <SelectContent>
                  {forklifts?.map((f) => <SelectItem key={f.id} value={f.id}>{f.name} — {f.model}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <DatePickerField label="Start Date *" date={startDate} onSelect={setStartDate} required />
              <DatePickerField label="End Date *" date={endDate} onSelect={setEndDate} required />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Tax Rate (%)</Label>
                <Input type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
              </div>
              <DatePickerField label="Valid Until" date={validUntil} onSelect={setValidUntil} />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="text-base">Customer</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {customers && customers.length > 0 && (
              <div className="space-y-1.5">
                <Label>Existing Customer</Label>
                <Select value={customerId} onValueChange={(v) => {
                  setCustomerId(v);
                  const c = customers.find((c) => c.id === v);
                  if (c) setCustomerName(c.name);
                }}>
                  <SelectTrigger><SelectValue placeholder="Choose customer (optional)" /></SelectTrigger>
                  <SelectContent>
                    {customers.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ""}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="space-y-1.5">
              <Label>Customer Name</Label>
              <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" />
            </div>
          </CardContent>
        </Card>

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
                <div className="flex justify-between text-sm"><span>Tax ({taxRate}%)</span><span className="font-mono">{formatCurrency(taxAmount)}</span></div>
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
