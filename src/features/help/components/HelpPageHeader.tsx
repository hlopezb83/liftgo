import { RefreshIcon } from "@/components/icons";
import { PageHeader } from "@/components/layout/PageHeader";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { formatDateMty } from "@/lib/format/dateFormats";

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
  const subtitle = generatedAt
    ? `Generado el ${formatDateMty(generatedAt)}`
    : "Aún no se ha generado el manual";

  return (
    <PageHeader
      title={`Manual de Usuario v${manualVersion || "1.0"}`}
      subtitle={subtitle}
      actions={
        <>
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
          {isAdmin && (
            <Button onClick={onGenerate} disabled={isGenerating} size="sm">
              <RefreshIcon className={`h-4 w-4 mr-2 ${isGenerating ? "animate-spin" : ""}`} />
              {getButtonLabel(isGenerating, hasManual)}
            </Button>
          )}
        </>
      }
    />
  );
}
