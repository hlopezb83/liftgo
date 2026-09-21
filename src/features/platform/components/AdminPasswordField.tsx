/**
 * Campo de contraseña inicial del primer administrador en el alta de empresa.
 * La regla mostrada aquí es la misma que valida el servidor
 * (`isStrongAdminPassword`): 12-72 caracteres y cuatro clases de caracteres.
 */
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AdminPasswordField({
  value,
  onChange,
  error,
  visible,
  onToggleVisible,
}: {
  value: string;
  onChange: (value: string) => void;
  error: string | null;
  visible: boolean;
  onToggleVisible: () => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor="org-admin-password">Contraseña inicial (opcional)</Label>
      <Input
        id="org-admin-password"
        type={visible ? "text" : "password"}
        autoComplete="new-password"
        minLength={12}
        maxLength={72}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
      />
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs text-muted-foreground">
          12 a 72 caracteres con mayúsculas, minúsculas, números y símbolos.
          Evita contraseñas comunes. Si la dejas vacía, se genera un enlace de
          acceso de un solo uso.
        </p>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onToggleVisible}
        >
          {visible ? "Ocultar" : "Mostrar"}
        </Button>
      </div>
      {error ? <p className="text-xs text-destructive">{error}</p> : null}
    </div>
  );
}
