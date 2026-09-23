import { useState } from "react";
import { SaveIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useUpdateLegalTemplateOverrides } from "@/features/contracts";
import {
  EMPTY_LEGAL_TEMPLATE_OVERRIDES,
  type LegalTemplateOverrides,
} from "@/features/contracts/lib/legalTemplateOverrides";

const fields: Array<{
  key: keyof LegalTemplateOverrides;
  label: string;
  placeholder: string;
}> = [
  { key: "city", label: "Ciudad de firma", placeholder: "Monterrey, N.L." },
  { key: "jurisdiction", label: "Jurisdicción y tribunales", placeholder: "Monterrey, Nuevo León" },
  { key: "legal_representative", label: "Representante legal del arrendador", placeholder: "Nombre completo" },
  { key: "witness_1", label: "Testigo 1 predeterminado", placeholder: "Nombre completo" },
  { key: "witness_2", label: "Testigo 2 predeterminado", placeholder: "Nombre completo" },
];

interface Props {
  definitionId: string;
  overrides: LegalTemplateOverrides;
  canEdit: boolean;
}

export function LegalTemplateOverridesForm({ definitionId, overrides, canEdit }: Props) {
  const [values, setValues] = useState<LegalTemplateOverrides>({
    ...EMPTY_LEGAL_TEMPLATE_OVERRIDES,
    ...overrides,
  });
  const update = useUpdateLegalTemplateOverrides();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Datos legales de esta empresa</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm text-muted-foreground">
          Se aplican como valores iniciales a contratos nuevos y se congelan al firmar.
          Cada contrato puede ajustar ciudad y testigos antes de la firma.
        </p>
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field.key} className="space-y-1.5">
              <Label htmlFor={`legal-${field.key}`}>{field.label}</Label>
              <Input
                id={`legal-${field.key}`}
                value={values[field.key]}
                placeholder={field.placeholder}
                maxLength={240}
                disabled={!canEdit || update.isPending}
                onChange={(event) => setValues((current) => ({
                  ...current,
                  [field.key]: event.target.value,
                }))}
              />
            </div>
          ))}
        </div>
        {canEdit ? (
          <Button
            type="button"
            disabled={update.isPending}
            onClick={() => update.mutate({ definitionId, overrides: values })}
          >
            <SaveIcon className="mr-1 h-4 w-4" />
            {update.isPending ? "Guardando…" : "Guardar datos legales"}
          </Button>
        ) : (
          <p className="text-sm text-muted-foreground">
            Sólo Admin o Administrativo pueden modificar estos datos.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

