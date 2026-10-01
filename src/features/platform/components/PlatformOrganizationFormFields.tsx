import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { PlatformOnboardingInput } from "@/lib/platformOnboarding.types";

type Draft = Omit<PlatformOnboardingInput, "request_id">;
export function PlatformOrganizationFormFields({
  form,
  update,
  onSlugTouched,
  disabled,
}: {
  form: Draft;
  update: (field: keyof Draft) => (value: string) => void;
  onSlugTouched: () => void;
  disabled: boolean;
}) {
  return (
    <fieldset disabled={disabled} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="org-name">Nombre de la empresa</Label>
        <Input
          id="org-name"
          required
          minLength={2}
          maxLength={120}
          value={form.name}
          onChange={(e) => update("name")(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-slug">Identificador (slug)</Label>
        <Input
          id="org-slug"
          required
          pattern="[a-z0-9][a-z0-9-]{1,62}"
          value={form.slug}
          onChange={(e) => {
            onSlugTouched();
            update("slug")(e.target.value.toLowerCase());
          }}
        />
        <p className="text-xs text-muted-foreground">
          Minúsculas, dígitos y guiones. No se puede cambiar después.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-admin-name">Nombre del primer administrador</Label>
        <Input
          id="org-admin-name"
          required
          maxLength={200}
          value={form.admin_full_name}
          onChange={(e) => update("admin_full_name")(e.target.value)}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="org-admin-email">Correo del primer administrador</Label>
        <Input
          id="org-admin-email"
          type="email"
          maxLength={254}
          required
          value={form.admin_email}
          onChange={(e) => update("admin_email")(e.target.value)}
        />
      </div>
    </fieldset>
  );
}
