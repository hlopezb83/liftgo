import { BackIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { useNavigateTransition } from "@/hooks/useNavigateTransition";
import { PageHeader } from "./PageHeader";

interface FormPageHeaderProps {
  title: string;
  subtitle?: string;
  onBack?: () => void;
}

/**
 * Header estándar para páginas de formulario. Reusa `PageHeader` para mantener
 * la misma tipografía y espaciado del resto del ERP, con un botón "Volver"
 * dedicado cuando se necesita un callback personalizado (no solo `navigate(-1)`).
 *
 * v7.302.2: el botón "Volver" pasa a su propio renglón (antes iba en línea con
 * el `<h1>`, lo que desalineaba el título contra las tarjetas del formulario).
 */
export function FormPageHeader({ title, subtitle, onBack }: FormPageHeaderProps) {
  const navigate = useNavigateTransition();
  const handleBack = onBack ?? (() => navigate(-1));
  return (
    <div className="space-y-1">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleBack}
        aria-label="Volver"
        className="-ml-2 h-7 px-2 text-muted-foreground hover:text-foreground"
      >
        <BackIcon className="h-3.5 w-3.5 mr-1" />
        Volver
      </Button>
      <PageHeader title={title} subtitle={subtitle} />
    </div>
  );
}
