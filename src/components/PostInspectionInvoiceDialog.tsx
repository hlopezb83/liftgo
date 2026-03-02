import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateInvoice } from "@/hooks/useInvoices";
import { generateLineItems, computeTotals, type LineItem } from "@/lib/invoiceUtils";
import { formatCurrency } from "@/lib/formatCurrency";
import { Receipt, FileText } from "lucide-react";
import { toast } from "sonner";
import type { Forklift } from "@/hooks/useForklifts";
import { formatDateDisplay } from "@/lib/utils";

interface PostInspectionInvoiceDialogProps {
  open: boolean; onOpenChange: (open: boolean) => void;
  booking: { id: string; customer_name: string | null; customer_id: string | null; start_date: string; end_date: string; forklift_id: string };
  forklift: Forklift; damageCost: number;
}

export function PostInspectionInvoiceDialog({ open, onOpenChange, booking, forklift, damageCost }: PostInspectionInvoiceDialogProps) {
  const navigate = useNavigate();
  const createInvoice = useCreateInvoice();
  const [taxRate, setTaxRate] = useState(16);

  const rentalItems = generateLineItems(forklift, booking.start_date, booking.end_date);
  const allItems: LineItem[] = [
    ...rentalItems,
    ...(damageCost > 0 ? [{ description: "Cargos por daño", quantity: 1, unit_price: damageCost, total: damageCost }] : []),
  ];
  const { subtotal, taxAmount, total } = computeTotals(allItems, taxRate);

  const handleGenerate = () => {
    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 30);
    createInvoice.mutate(
      { booking_id: booking.id, customer_id: booking.customer_id, customer_name: booking.customer_name, line_items: JSON.parse(JSON.stringify(allItems)), subtotal, tax_rate: taxRate, tax_amount: taxAmount, total, due_date: dueDate.toISOString().split("T")[0], status: "draft" },
      { onSuccess: (data) => { toast.success("Factura generada desde inspección de devolución"); onOpenChange(false); navigate(`/invoices/${data.id}`); } }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Receipt className="h-5 w-5 text-primary" />¿Generar Factura Final?</DialogTitle>
          <DialogDescription>Crear una factura para {booking.customer_name || "esta renta"} basada en la reserva completada.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="rounded-lg bg-muted p-3 space-y-1 text-sm">
            <p className="font-medium">{forklift.name} — {forklift.model}</p>
            <p className="text-muted-foreground">{formatDateDisplay(booking.start_date)} → {formatDateDisplay(booking.end_date)}</p>
          </div>
          <div className="space-y-1 text-sm">
            {allItems.map((item, i) => (
              <div key={i} className="flex justify-between">
                <span>{item.description} (×{item.quantity})</span>
                <span className="font-mono">{formatCurrency(item.total)}</span>
              </div>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <Label className="shrink-0">IVA %</Label>
            <Input type="number" value={taxRate} onChange={(e) => setTaxRate(Number(e.target.value))} className="w-20" />
          </div>
          <div className="border-t pt-2 space-y-1 text-sm">
            <div className="flex justify-between"><span>Subtotal</span><span className="font-mono">{formatCurrency(subtotal)}</span></div>
            <div className="flex justify-between"><span>IVA ({taxRate}%)</span><span className="font-mono">{formatCurrency(taxAmount)}</span></div>
            <div className="flex justify-between font-semibold"><span>Total</span><span className="font-mono">{formatCurrency(total)}</span></div>
          </div>
        </div>
        <DialogFooter className="flex-col gap-2 sm:flex-row">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Omitir</Button>
          <Button onClick={handleGenerate} disabled={createInvoice.isPending}>
            <FileText className="h-4 w-4 mr-1" />{createInvoice.isPending ? "Generando..." : "Generar Factura"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
