import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

interface Customer { id: string; name: string; company?: string | null; email?: string | null; }

interface CustomerSelectorProps {
  customers: Customer[] | undefined;
  customerId: string;
  customerName: string;
  onCustomerIdChange: (id: string) => void;
  onCustomerNameChange: (name: string) => void;
  customerContact?: string;
  onCustomerContactChange?: (contact: string) => void;
}

export function CustomerSelector({ customers, customerId, customerName, onCustomerIdChange, onCustomerNameChange, customerContact, onCustomerContactChange }: CustomerSelectorProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Cliente</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {customers && customers.length > 0 && (
          <div className="space-y-1.5">
            <Label>Cliente Existente</Label>
            <Select value={customerId} onValueChange={(v) => {
              onCustomerIdChange(v);
              const c = customers.find((c) => c.id === v);
              if (c) { onCustomerNameChange(c.name); if (onCustomerContactChange && c.email) onCustomerContactChange(c.email); }
            }}>
              <SelectTrigger><SelectValue placeholder="Seleccionar cliente (opcional)" /></SelectTrigger>
              <SelectContent>
                {customers.map((c) => (
                  <SelectItem key={c.id} value={c.id}>{c.name}{c.company ? ` — ${c.company}` : ""}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        <div className={onCustomerContactChange ? "grid grid-cols-1 sm:grid-cols-2 gap-4" : ""}>
          <div className="space-y-1.5">
            <Label>Nombre del Cliente</Label>
            <Input value={customerName} onChange={(e) => onCustomerNameChange(e.target.value)} placeholder="Nombre del cliente" />
          </div>
          {onCustomerContactChange && (
            <div className="space-y-1.5">
              <Label>Contacto</Label>
              <Input placeholder="Correo o teléfono" value={customerContact || ""} onChange={(e) => onCustomerContactChange(e.target.value)} />
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
