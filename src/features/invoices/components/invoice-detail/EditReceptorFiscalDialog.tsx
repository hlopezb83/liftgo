import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { REGIMEN_FISCAL } from "@/lib/domain/satCatalogs";
import { notifySuccess } from "@/lib/ui/appFeedback";
import { useUpdateReceptorFiscalInfo } from "../../hooks/invoiceDetail/useReceptorTaxInfo";
import type { Tables } from "@/integrations/supabase/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Tables<"invoices">;
}

export function EditReceptorFiscalDialog({ open, onOpenChange, invoice }: Props) {
  const update = useUpdateReceptorFiscalInfo();
  const [razonSocial, setRazonSocial] = useState("");
  const [regimen, setRegimen] = useState("");
  const [cp, setCp] = useState("");
  const [syncCustomer, setSyncCustomer] = useState(true);

  useEffect(() => {
    if (open) {
      setRazonSocial(invoice.receptor_razon_social ?? invoice.customer_name ?? "");
      setRegimen(invoice.receptor_regimen_fiscal ?? "");
      setCp(invoice.receptor_domicilio_fiscal_cp ?? "");
      setSyncCustomer(true);
    }
  }, [open, invoice]);

  const canSubmit = razonSocial.trim().length > 0 && regimen && /^\d{5}$/.test(cp);

  const handleSubmit = () => {
    update.mutate(
      {
        invoiceId: invoice.id,
        customerId: invoice.customer_id ?? null,
        syncCustomer,
        patch: {
          receptor_razon_social: razonSocial.trim(),
          receptor_regimen_fiscal: regimen,
          receptor_domicilio_fiscal_cp: cp.trim(),
        },
      },
      {
        onSuccess: () => {
          notifySuccess("Datos fiscales del receptor actualizados");
          onOpenChange(false);
        },
      },
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar datos fiscales del receptor</DialogTitle>
          <DialogDescription>
            Estos valores se enviarán al PAC al timbrar CFDIs y notas de crédito
            de esta factura. Deben coincidir <strong>exactamente</strong> con la
            Constancia de Situación Fiscal del cliente.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>RFC</Label>
            <Input value={invoice.receptor_rfc ?? ""} disabled className="font-mono" />
            <p className="text-xs text-muted-foreground mt-1">
              El RFC no se edita aquí; modifícalo desde la ficha del cliente.
            </p>
          </div>

          <div>
            <Label>Razón social *</Label>
            <Input
              value={razonSocial}
              onChange={(e) => setRazonSocial(e.target.value.toUpperCase())}
              placeholder="EJ: LOGISTORAGE"
              maxLength={254}
            />
            <p className="text-xs text-muted-foreground mt-1">
              Mayúsculas, sin acentos, sin régimen societario (S.A. de C.V.).
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Régimen fiscal *</Label>
              <Select value={regimen} onValueChange={setRegimen}>
                <SelectTrigger>
                  <SelectValue placeholder="Seleccionar" />
                </SelectTrigger>
                <SelectContent>
                  {REGIMEN_FISCAL.map((r) => (
                    <SelectItem key={r.code} value={r.code}>
                      {r.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>CP fiscal *</Label>
              <Input
                value={cp}
                onChange={(e) => setCp(e.target.value.replace(/\D/g, "").slice(0, 5))}
                placeholder="64000"
                maxLength={5}
                inputMode="numeric"
              />
            </div>
          </div>

          {invoice.customer_id && (
            <div className="flex items-start gap-2 rounded-md border p-3 bg-muted/30">
              <Checkbox
                id="sync-customer"
                checked={syncCustomer}
                onCheckedChange={(v) => setSyncCustomer(v === true)}
              />
              <Label htmlFor="sync-customer" className="text-sm font-normal cursor-pointer">
                Actualizar también estos datos en la ficha del cliente para futuras facturas.
              </Label>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={update.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={handleSubmit} disabled={!canSubmit || update.isPending}>
            {update.isPending ? "Guardando…" : "Guardar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
