import { Book, RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

interface ManualVersion { id: string; version: string }
interface Props {
  manualVersion?: string;
  generatedAt?: string;
  versions: ManualVersion[];
  selectedVersion: string | null;
  onSelectVersion: (v: string | null) => void;
  isAdmin: boolean;
  isGenerating: boolean;
  hasManual: boolean;
  onGenerate: () => void;
}

function getButtonLabel(isGenerating: boolean, hasManual: boolean): string {
  if (isGenerating) return "Generando…";
  if (hasManual) return "Regenerar";
  return "Generar Manual";
}

export function HelpPageHeader({
  manualVersion, generatedAt, versions, selectedVersion, onSelectVersion,
  isAdmin, isGenerating, hasManual, onGenerate,
}: Props) {
  return (
    <div className="flex items-center justify-between flex-wrap gap-4">
      <div className="flex items-center gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Book className="h-6 w-6" />
            Manual de Usuario v{manualVersion || "1.0"}
          </h1>
          <p className="text-sm text-muted-foreground">
            {generatedAt
              ? `Generado el ${format(new Date(generatedAt), "dd/MM/yyyy")}`
              : "Aún no se ha generado el manual"}
          </p>
        </div>
        {versions.length > 1 && (
          <Select
            value={selectedVersion ?? "latest"}
            onValueChange={(val) => onSelectVersion(val === "latest" ? null : val)}
          >
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Versión" />
            </SelectTrigger>
            <SelectContent>
              {versions.map((v, i) => (
                <SelectItem key={v.id} value={i === 0 ? "latest" : v.id}>
                  v{v.version} {i === 0 ? "(actual)" : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>
      {isAdmin && (
        <Button onClick={onGenerate} disabled={isGenerating} size="sm">
          <RefreshCw className={`h-4 w-4 mr-2 ${isGenerating ? "animate-spin" : ""}`} />
          {getButtonLabel(isGenerating, hasManual)}
        </Button>
      )}
    </div>
  );
}
