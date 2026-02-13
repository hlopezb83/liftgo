import { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useBookings, useForklifts, useCreateInvoice, useUpdateInvoice, useInvoice } from "@/hooks/useForkliftData";
import { generateLineItems, computeTotals, type LineItem } from "@/lib/invoiceUtils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DatePickerField } from "@/components/DatePickerField";
import { FormActions } from "@/components/FormActions";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";

export default function InvoiceForm() {
  const { id } = useParams();
  const isEdit = !!id;
  const navigate = useNavigate();
  const { data: bookings } = useBookings();
  const { data: forklifts } = useForklifts();
  const { data: existing } = useInvoice(id);
  const createInvoice = useCreateInvoice();
  const updateInvoice = useUpdateInvoice();

  const [bookingId, setBookingId] = useState("");
  const [customerName, setCustomerName] = useState("");
  const [customerId, setCustomerId] = useState<string | null>(null);
  const [lineItems, setLineItems] = useState<LineItem[]>([]);
  const [taxRate, setTaxRate] = useState(0);
  const [dueDate, setDueDate] = useState<Date>();
  const [notes, setNotes] = useState("");

  // Populate on edit
  useEffect(() => {
    if (existing) {
      setCustomerName(existing.customer_name || "");
      setCustomerId(existing.customer_id);
      setBookingId(existing.booking_id || "");
      setLineItems((existing.line_items as unknown as LineItem[]) || []);
      setTaxRate(Number(existing.tax_rate) || 0);
      setDueDate(existing.due_date ? new Date(existing.due_date) : undefined);
      setNotes(existing.notes || "");
    }
  }, [existing]);

  const handleBookingSelect = (bId: string) => {
    setBookingId(bId);
    const booking = bookings?.find((b) => b.id === bId);
    if (!booking) return;
    setCustomerName(booking.customer_name || "");
    setCustomerId(booking.customer_id || null);
    const forklift = forklifts?.find((f) => f.id === booking.forklift_id);
    if (forklift) {
      setLineItems(generateLineItems(forklift, booking.start_date, booking.end_date));
    }
  };

  const updateItem = (idx: number, field: keyof LineItem, value: string | number) => {
    setLineItems((prev) => prev.map((item, i) => {
      if (i !== idx) return item;
      const updated = { ...item, [field]: value };
      if (field === "quantity" || field === "unit_price") {
        updated.total = Math.round(Number(updated.quantity) * Number(updated.unit_price) * 100) / 100;
      }
      return updated;
    }));
  };

  const addItem = () => setLineItems((prev) => [...prev, { description: "", quantity: 1, unit_price: 0, total: 0 }]);
  const removeItem = (idx: number) => setLineItems((prev) => prev.filter((_, i) => i !== idx));

  const { subtotal, taxAmount, total } = computeTotals(lineItems, taxRate);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (lineItems.length === 0) { toast.error("Add at least one line item"); return; }

    const payload = {
      booking_id: bookingId || null,
      customer_id: customerId,
      customer_name: customerName || null,
      line_items: lineItems as any,
      subtotal,
      tax_rate: taxRate,
      tax_amount: taxAmount,
      total,
      due_date: dueDate ? format(dueDate, "yyyy-MM-dd") : null,
      notes: notes || null,
    };

    if (isEdit) {
      updateInvoice.mutate({ id, ...payload }, {
        onSuccess: () => { toast.success("Invoice updated"); navigate(`/invoices/${id}`); },
      });
    } else {
      createInvoice.mutate(payload as any, {
        onSuccess: (data) => { toast.success(`Invoice ${data.invoice_number} created`); navigate(`/invoices/${data.id}`); },
      });
    }
  };

  const isPending = createInvoice.isPending || updateInvoice.isPending;

  return (
    <div className="p-6 max-w-4xl">
      <div className="flex items-center gap-3 mb-6">
        <Button variant="ghost" size="icon" onClick={() => navigate(-1)}><ArrowLeft className="h-4 w-4" /></Button>
        <h1 className="text-2xl font-bold">{isEdit ? "Edit Invoice" : "New Invoice"}</h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Card>
          <CardHeader><CardTitle className="text-base">Invoice Details</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            {!isEdit && (
              <div className="space-y-1.5">
                <Label>Generate from Booking</Label>
                <Select value={bookingId} onValueChange={handleBookingSelect}>
                  <SelectTrigger><SelectValue placeholder="Select a booking (optional)" /></SelectTrigger>
                  <SelectContent>
                    {bookings?.map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.forklifts?.name} — {b.customer_name || "No customer"} ({b.start_date} → {b.end_date})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Customer Name</Label>
                <Input value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Customer name" />
              </div>
              <DatePickerField label="Due Date" date={dueDate} onSelect={setDueDate} placeholder="Select due date" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Line Items</CardTitle>
              <Button type="button" variant="outline" size="sm" onClick={addItem}><Plus className="h-3 w-3 mr-1" />Add Row</Button>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Description</TableHead>
                  <TableHead className="w-24">Qty</TableHead>
                  <TableHead className="w-32">Unit Price</TableHead>
                  <TableHead className="w-32 text-right">Total</TableHead>
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {lineItems.map((item, idx) => (
                  <TableRow key={idx}>
                    <TableCell>
                      <Input value={item.description} onChange={(e) => updateItem(idx, "description", e.target.value)} className="h-8" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" min={1} value={item.quantity} onChange={(e) => updateItem(idx, "quantity", Number(e.target.value))} className="h-8" />
                    </TableCell>
                    <TableCell>
                      <Input type="number" step="0.01" min={0} value={item.unit_price} onChange={(e) => updateItem(idx, "unit_price", Number(e.target.value))} className="h-8" />
                    </TableCell>
                    <TableCell className="text-right font-mono">€{item.total.toFixed(2)}</TableCell>
                    <TableCell>
                      <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removeItem(idx)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
                {lineItems.length === 0 && (
                  <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-6">No line items yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-end gap-2">
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Subtotal</span>
                <span className="font-mono w-28 text-right">€{subtotal.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-4 text-sm">
                <span className="text-muted-foreground">Tax rate (%)</span>
                <Input type="number" step="0.1" min={0} value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} className="w-20 h-8 text-right" />
                <span className="font-mono w-28 text-right">€{taxAmount.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-4 text-base font-bold border-t pt-2">
                <span>Total</span>
                <span className="font-mono w-28 text-right">€{total.toFixed(2)}</span>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Additional notes…" className="mt-1.5" />
          </CardContent>
        </Card>

        <FormActions submitLabel={isEdit ? "Update Invoice" : "Create Invoice"} isPending={isPending} onCancel={() => navigate(-1)} />
      </form>
    </div>
  );
}
