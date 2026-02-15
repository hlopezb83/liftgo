import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";

interface FormPageHeaderProps {
  title: string;
  onBack?: () => void;
}

export function FormPageHeader({ title, onBack }: FormPageHeaderProps) {
  const navigate = useNavigate();
  return (
    <div className="flex items-center gap-3 mb-6">
      <Button variant="ghost" size="icon" onClick={onBack || (() => navigate(-1))}>
        <ArrowLeft className="h-4 w-4" />
      </Button>
      <h1 className="text-2xl font-bold">{title}</h1>
    </div>
  );
}
