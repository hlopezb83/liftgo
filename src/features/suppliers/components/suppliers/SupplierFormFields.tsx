import { useFormContext } from "react-hook-form";
import {
  TextField,
  TextareaField,
  SelectField,
  type SelectOption,
} from "@/components/forms/fields";
import { FormSection } from "@/components/forms/FormSection";
import { REGIMEN_FISCAL } from "@/lib/domain/satCatalogs";
import { SUPPLIER_CATEGORIES } from "../../hooks/useSuppliers";
import type { SupplierFormData } from "../../lib/supplierFormSchema";

const REGIMEN_OPTIONS: SelectOption[] = REGIMEN_FISCAL.map((r) => ({
  value: r.code,
  label: `${r.code} — ${r.label}`,
}));

const CATEGORY_OPTIONS: SelectOption[] = Object.entries(SUPPLIER_CATEGORIES).map(([k, v]) => ({
  value: k,
  label: v,
}));

export function SupplierFormFields() {
  const { control } = useFormContext<SupplierFormData>();

  return (
    <div className="space-y-5">
      <FormSection title="Identidad" first>
        <TextField
          control={control}
          name="name"
          label="Nombre / Razón Social"
          required
          placeholder="GRUPO INDUSTRIAL DEL NORTE"
        />
      </FormSection>

      <FormSection title="Datos Fiscales (CFDI)">
        <div className="grid grid-cols-2 gap-4">
          <TextField
            control={control}
            name="rfc"
            label="RFC"
            placeholder="XAXX010101000"
            description="Se normaliza a mayúsculas al guardar."
          />
          <SelectField
            control={control}
            name="regimen_fiscal"
            label="Régimen Fiscal"
            options={REGIMEN_OPTIONS}
            placeholder="Seleccionar"
          />
        </div>
      </FormSection>

      <FormSection title="Contacto">
        <TextField
          control={control}
          name="contact_person"
          label="Persona de Contacto"
          placeholder="Lic. Juan Pérez"
        />
        <div className="grid grid-cols-2 gap-4">
          <TextField
            control={control}
            name="email"
            label="Correo"
            type="email"
            placeholder="contacto@proveedor.com"
          />
          <TextField
            control={control}
            name="phone"
            label="Teléfono"
            placeholder="+52 81 1234 5678"
          />
        </div>
        <TextField
          control={control}
          name="website"
          label="Sitio Web"
          placeholder="https://proveedor.com"
        />
      </FormSection>

      <FormSection title="Dirección">
        <TextField
          control={control}
          name="address"
          label="Dirección"
          placeholder="Av. Industrial 123, Col. Centro, 64000, Monterrey"
        />
      </FormSection>

      <FormSection title="Condiciones Comerciales">
        <div className="grid grid-cols-2 gap-4">
          <SelectField
            control={control}
            name="category"
            label="Categoría"
            options={CATEGORY_OPTIONS}
            placeholder="Seleccionar"
          />
          <TextField
            control={control}
            name="default_payment_terms_days"
            label="Días de crédito"
            placeholder="Ej. 30"
            description="Se aplicará como vencimiento al registrar nuevas CxP."
          />
        </div>
      </FormSection>

      <FormSection title="Interno">
        <TextareaField
          control={control}
          name="notes"
          label="Notas"
          rows={3}
          placeholder="Notas internas sobre el proveedor…"
        />
      </FormSection>
    </div>
  );
}
