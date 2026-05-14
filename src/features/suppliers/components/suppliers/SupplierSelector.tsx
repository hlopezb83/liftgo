import { useSuppliers } from "@/features/suppliers/hooks/useSuppliers";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface SupplierSelectorProps {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}

export function SupplierSelector({ value, onChange, label = "Proveedor" }: SupplierSelectorProps) {
  const { data: suppliers } = useSuppliers();

  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value || "_none"} onValueChange={(v) => onChange(v === "_none" ? "" : v)}>
        <SelectTrigger>
          <SelectValue placeholder="Sin proveedor" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="_none">Sin proveedor</SelectItem>
          {suppliers?.map((s) => (
            <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
