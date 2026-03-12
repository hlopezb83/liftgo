import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface DetailPageHeaderProps {
  title: string;
  subtitle?: string;
  badges?: ReactNode;
  backTo: string;
  actions?: ReactNode;
}

export function DetailPageHeader({ title, subtitle, badges, backTo, actions }: DetailPageHeaderProps) {
  const navigate = useNavigate();

  const handleBack = () => {
    const savedParams = sessionStorage.getItem(`list-filters:${backTo}`);
    navigate(savedParams ? `${backTo}?${savedParams}` : backTo);
  };

  return (
    <div className="flex items-center justify-between flex-wrap gap-2">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={handleBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {subtitle && <p className="text-sm text-muted-foreground">{subtitle}</p>}
          {badges && <div className="flex items-center gap-2">{badges}</div>}
        </div>
      </div>
      {actions && <div className="flex gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}
