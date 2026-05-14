import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { FORKLIFT_STATUSES, FUEL_TYPES, STATUS_LABELS, FUEL_TYPE_LABELS } from "@/lib/constants";
import type { ForkliftFormData } from "@/lib/formSchemas";

interface Props {
  form: ForkliftFormData;
  set: <K extends keyof ForkliftFormData>(key: K, value: ForkliftFormData[K]) => void;
  isEdit: boolean;
  manufacturers: string[];
  filteredModels: { id: string; model: string }[];
  onManufacturerChange: (value: string) => void;
  onModelChange: (value: string) => void;
}

export function EquipmentDetailsSection({
  form, set, isEdit, manufacturers, filteredModels, onManufacturerChange, onModelChange,
}: Props) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Detalles del Equipo</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label>Nombre / ID *</Label>
          <Input placeholder="MC-007" value={form.name} onChange={(e) => set("name", e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Fabricante</Label>
          <Select value={form.manufacturer} onValueChange={onManufacturerChange}>
            <SelectTrigger><SelectValue placeholder="Seleccionar fabricante" /></SelectTrigger>
            <SelectContent>
              {manufacturers.map((m) => <SelectItem key={m} value={m}>{m}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Modelo *</Label>
          <Select key={form.manufacturer} value={form.model} onValueChange={onModelChange} disabled={!form.manufacturer}>
            <SelectTrigger><SelectValue placeholder={form.manufacturer ? "Seleccionar modelo" : "Primero selecciona fabricante"} /></SelectTrigger>
            <SelectContent>
              {filteredModels.map((m) => <SelectItem key={m.id} value={m.model}>{m.model}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label>Año</Label>
          <Input type="number" placeholder="2023" value={form.year} onChange={(e) => set("year", e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Capacidad (kg)</Label>
          <Input type="number" placeholder="2500" value={form.capacity_kg} onChange={(e) => set("capacity_kg", e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Altura del Mástil (m)</Label>
          <Input type="number" placeholder="4.5" value={form.mast_height_m} onChange={(e) => set("mast_height_m", e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Número de Serie</Label>
          <Input placeholder="HY-2023-007" value={form.serial_number} onChange={(e) => set("serial_number", e.target.value)} />
        </div>

        <div className="space-y-1.5">
          <Label>Tipo de Combustible</Label>
          <Select value={form.fuel_type} onValueChange={(v) => set("fuel_type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {FUEL_TYPES.map((f) => <SelectItem key={f} value={f}>{FUEL_TYPE_LABELS[f] || f}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>

        {!isEdit && (
          <div className="space-y-1.5">
            <Label>Estado Inicial</Label>
            <Select value={form.status} onValueChange={(v) => set("status", v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {FORKLIFT_STATUSES.map((s) => <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
