import { HideIcon, ViewIcon } from "@/components/icons";

interface PasswordVisibilityToggleProps {
  visible: boolean;
  onToggle: () => void;
}

export function PasswordVisibilityToggle({ visible, onToggle }: PasswordVisibilityToggleProps) {
  return (
    <button
      type="button"
      aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
      onClick={onToggle}
      className="absolute right-1 top-1/2 grid -translate-y-1/2 place-items-center rounded-sm p-2.5 text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring touch:min-h-11 touch:min-w-11"
    >
      {visible ? <HideIcon aria-hidden="true" className="h-4 w-4" /> : <ViewIcon aria-hidden="true" className="h-4 w-4" />}
    </button>
  );
}
