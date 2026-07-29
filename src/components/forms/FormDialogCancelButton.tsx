import { Button } from "@/components/ui/button";
import { useFormDialogClose } from "./formDialogContext";

interface Props {
  /** Cierre propio del consumidor; sólo se usa fuera de un `FormDialog`. */
  onCancel: () => void;
  disabled?: boolean;
  label?: string;
}

/**
 * R24-A: los footers con layout propio (que no pueden usar `FormActions`)
 * deben cerrar por la misma puerta que Esc / click-fuera para que el guard de
 * "¿Descartar cambios?" se dispare. Fuera de un `FormDialog` cae al `onCancel`.
 */
export function FormDialogCancelButton({ onCancel, disabled, label = "Cancelar" }: Props) {
  const requestClose = useFormDialogClose();
  return (
    <Button type="button" variant="outline" disabled={disabled} onClick={requestClose ?? onCancel}>
      {label}
    </Button>
  );
}
