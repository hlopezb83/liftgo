import { useFormContext } from "react-hook-form";
import { TextField, SelectField, type SelectOption } from "@/components/forms/fields";
import { FormSection } from "@/components/forms/FormSection";
import { REGIMEN_FISCAL, USO_CFDI } from "@/lib/domain/satCatalogs";
import type { CustomerFormData } from "../../../lib/customerFormSchema";

const REGIMEN_OPTIONS: SelectOption[] = REGIMEN_FISCAL.map((r) => ({
  value: r.code,
  label: `${r.code} — ${r.label}`,
}));

const USO_CFDI_OPTIONS: SelectOption[] = USO_CFDI.map((u) => ({
  value: u.code,
  label: `${u.code} — ${u.label}`,
}));

export function FiscalSection() {
  const { control } = useFormContext<CustomerFormData>();
  return (
    <FormSection title="Datos Fiscales (CFDI)">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <TextField
          control={control}
          name="rfc"
          label="RFC"
          placeholder="XAXX010101000"
          description="Se normaliza a mayúsculas al guardar."
        />
        <TextField
          control={control}
          name="domicilio_fiscal_cp"
          label="C.P. Fiscal"
          placeholder="64000"
        />
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <SelectField
          control={control}
          name="regimen_fiscal"
          label="Régimen Fiscal"
          options={REGIMEN_OPTIONS}
          placeholder="Seleccionar"
        />
        <SelectField
          control={control}
          name="uso_cfdi"
          label="Uso CFDI"
          options={USO_CFDI_OPTIONS}
          placeholder="Seleccionar"
        />
      </div>
      <TextField
        control={control}
        name="representante_legal"
        label="Representante Legal (opcional)"
        placeholder="Lic. Juan Pérez"
      />
    </FormSection>
  );
}
