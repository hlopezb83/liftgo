/**
 * Alta de empresa y enlace de acceso del primer administrador.
 *
 * La autorización sigue viviendo en
 * `requirePlatformOperator` y en las funciones `platform_*` de la base.
 */
import { useState, type FormEvent } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { CreateOrganizationResult } from "@/lib/platformAdmin.functions";
import { useCreateOrganization } from "../hooks/usePlatformOperator";

const EMPTY_FORM = {
  name: "",
  slug: "",
  admin_email: "",
  admin_full_name: "",
};

function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63);
}

export function CreateOrganizationDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (result: CreateOrganizationResult) => void;
}) {
  const [form, setForm] = useState(EMPTY_FORM);
  const [slugTouched, setSlugTouched] = useState(false);
  const create = useCreateOrganization();

  const update = (field: keyof typeof EMPTY_FORM) => (value: string) => {
    setForm((prev) => {
      const next = { ...prev, [field]: value };
      if (field === "name" && !slugTouched) next.slug = slugify(value);
      return next;
    });
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    let result: CreateOrganizationResult;
    try {
      result = await create.mutateAsync(form);
    } catch {
      return;
    }
    setForm(EMPTY_FORM);
    setSlugTouched(false);
    onOpenChange(false);
    onCreated(result);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!create.isPending) onOpenChange(next);
      }}
    >
      <DialogContent>
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Nueva empresa</DialogTitle>
            <DialogDescription>
              Se crea la empresa y después se vincula su primer administrador.
              La empresa permanece sin acceso hasta completar el alta. Si falla,
              el servidor intenta compensar la operación.
            </DialogDescription>
          </DialogHeader>

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
                setSlugTouched(true);
                update("slug")(e.target.value.toLowerCase());
              }}
            />
            <p className="text-xs text-muted-foreground">
              Minúsculas, dígitos y guiones. No se puede cambiar después.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-admin-name">
              Nombre del primer administrador
            </Label>
            <Input
              id="org-admin-name"
              required
              maxLength={200}
              value={form.admin_full_name}
              onChange={(e) => update("admin_full_name")(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="org-admin-email">
              Correo del primer administrador
            </Label>
            <Input
              id="org-admin-email"
              type="email"
              required
              value={form.admin_email}
              onChange={(e) => update("admin_email")(e.target.value)}
            />
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={create.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creando…" : "Crear empresa"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function CreatedResultDialog({
  result,
  onClose,
}: {
  result: CreateOrganizationResult | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!result} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Empresa creada</DialogTitle>
          <DialogDescription>
            {result?.password_set_manually
              ? `La cuenta de ${result?.admin_email} ya tiene la contraseña que definiste. Compártela por un medio seguro.`
              : `Comparte el enlace de acceso con ${result?.admin_email}. Es de un solo uso y le permite definir su contraseña.`}
          </DialogDescription>
        </DialogHeader>
        {result?.password_set_manually ? (
          <Alert>
            <AlertTitle>Acceso listo</AlertTitle>
            <AlertDescription>
              El administrador puede entrar con su correo y la contraseña que
              acabas de asignar. Por seguridad no se muestra aquí; pídele que la
              cambie después del primer ingreso.
            </AlertDescription>
          </Alert>
        ) : result?.recovery_link ? (
          <Input
            readOnly
            value={result.recovery_link}
            onFocus={(e) => e.currentTarget.select()}
          />
        ) : (
          <Alert>
            <AlertTitle>Sin enlace de acceso</AlertTitle>
            <AlertDescription>
              La empresa y el administrador se crearon, pero no se pudo generar
              el enlace. El administrador puede usar "Olvidé mi contraseña" con
              su correo.
            </AlertDescription>
          </Alert>
        )}

        <DialogFooter>
          <Button onClick={onClose}>Listo</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
