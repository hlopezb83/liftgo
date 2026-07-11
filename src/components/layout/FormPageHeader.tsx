import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { BackIcon } from "@/components/icons";
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
 */
export function FormPageHeader({ title, subtitle, onBack }: FormPageHeaderProps) {
  const navigate = useNavigate();
  const handleBack = onBack ?? (() => navigate(-1));
  return (
    <div className="flex items-start gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={handleBack}
        className="-ml-2 h-7 px-2 text-muted-foreground hover:text-foreground"
      >
        <BackIcon className="h-3.5 w-3.5 mr-1" />
        Volver
      </Button>
      <div className="flex-1 min-w-0">
        <PageHeader title={title} subtitle={subtitle} />
      </div>
    </div>
  );
}
