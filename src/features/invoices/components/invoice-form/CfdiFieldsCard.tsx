import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FORMA_PAGO, METODO_PAGO, USO_CFDI, MONEDA } from "@/lib/domain/satCatalogs";

interface CfdiFieldsCardProps {
  serie: string;
  folio: string;
  formaPago: string;
  metodoPago: string;
  usoCfdi: string;
  moneda: string;
  tipoCambio: number;
  receptorRfc: string;
  receptorRazonSocial: string;
  receptorRegimenFiscal: string;
  receptorDomicilioFiscalCp: string;
  onUpdate: (field: string, value: string | number) => void;
}

export function CfdiFieldsCard({
  serie, folio, formaPago, metodoPago, usoCfdi, moneda, tipoCambio,
  receptorRfc, receptorRazonSocial, receptorRegimenFiscal, receptorDomicilioFiscalCp,
  onUpdate,
}: CfdiFieldsCardProps) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Datos CFDI 4.0</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <Label>Serie</Label>
            <Input value={serie} onChange={(e) => onUpdate("serie", e.target.value)} placeholder="A" />
          </div>
          <div className="space-y-1.5">
            <Label>Folio</Label>
            <Input value={folio} onChange={(e) => onUpdate("folio", e.target.value)} placeholder="001" />
          </div>
          <div className="space-y-1.5">
            <Label>Forma de Pago</Label>
            <Select value={formaPago} onValueChange={(v) => onUpdate("formaPago", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FORMA_PAGO.map((f) => <SelectItem key={f.code} value={f.code}>{f.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Método de Pago</Label>
            <Select value={metodoPago} onValueChange={(v) => onUpdate("metodoPago", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {METODO_PAGO.map((m) => <SelectItem key={m.code} value={m.code}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <Label>Uso CFDI</Label>
            <Select value={usoCfdi} onValueChange={(v) => onUpdate("usoCfdi", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {USO_CFDI.map((u) => <SelectItem key={u.code} value={u.code}>{u.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Moneda</Label>
            <Select value={moneda} onValueChange={(v) => { onUpdate("moneda", v); if (v === "MXN") onUpdate("tipoCambio", 1); }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONEDA.map((m) => <SelectItem key={m.code} value={m.code}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          {moneda !== "MXN" && (
            <div className="space-y-1.5">
              <Label>Tipo de Cambio</Label>
              <Input type="number" step="0.0001" value={tipoCambio} onChange={(e) => onUpdate("tipoCambio", Number(e.target.value))} />
            </div>
          )}
        </div>

        <p className="text-xs font-semibold uppercase text-muted-foreground tracking-wider pt-2">Receptor</p>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>RFC Receptor</Label>
            <Input value={receptorRfc} onChange={(e) => onUpdate("receptorRfc", e.target.value.toUpperCase())} placeholder="XAXX010101000" />
          </div>
          <div className="space-y-1.5">
            <Label>Razón Social</Label>
            <Input value={receptorRazonSocial} onChange={(e) => onUpdate("receptorRazonSocial", e.target.value)} placeholder="Nombre legal del receptor" />
          </div>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Régimen Fiscal Receptor</Label>
            <Input value={receptorRegimenFiscal} onChange={(e) => onUpdate("receptorRegimenFiscal", e.target.value)} placeholder="601" />
          </div>
          <div className="space-y-1.5">
            <Label>C.P. Fiscal Receptor</Label>
            <Input value={receptorDomicilioFiscalCp} onChange={(e) => onUpdate("receptorDomicilioFiscalCp", e.target.value)} placeholder="06600" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
