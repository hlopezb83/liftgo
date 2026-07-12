import { useState } from "react";
import { UploadIcon, SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { notifyError, notifyWarning } from "@/lib/ui/appFeedback";
import { useImportBankStatement } from "../hooks/useBankReconciliationMutations";
import { CSV_PROFILES, CSV_PROFILE_LABELS, type CsvProfile } from "../lib/bankReconciliationConstants";
import { parseBankCsv } from "../lib/csvParsers";

interface Props {
  bankAccountId: string;
}

export function BankStatementUploader({ bankAccountId }: Props) {
  const [profile, setProfile] = useState<CsvProfile>("generico");
  const [file, setFile] = useState<File | null>(null);
  const importMut = useImportBankStatement();

  const handleImport = async () => {
    if (!file) return;
    const content = await file.text();
    const parsed = parseBankCsv(content, profile);
    if (parsed.lines.length === 0) {
      notifyError({
        title: "No se pudieron leer movimientos del archivo",
        description: parsed.errors[0] ?? "Sin detalle.",
        phase: "parseBankCsv",
        severity: "warning",
        context: { profile, fileName: file.name },
      });
      return;
    }
    if (parsed.errors.length > 0) {
      notifyWarning(`${parsed.lines.length} movimientos cargados, ${parsed.errors.length} líneas con error fueron ignoradas.`);
    }
    importMut.mutate(
      {
        bankAccountId,
        fileName: file.name,
        lines: parsed.lines,
        periodStart: parsed.periodStart,
        periodEnd: parsed.periodEnd,
      },
      { onSuccess: () => setFile(null) },
    );
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2"><UploadIcon className="h-4 w-4" /> Subir estado de cuenta (CSV)</CardTitle>
      </CardHeader>
      <CardContent className="grid sm:grid-cols-3 gap-3">
        <div className="grid gap-1.5">
          <Label>Perfil del banco</Label>
          <Select value={profile} onValueChange={(v) => setProfile(v as CsvProfile)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {CSV_PROFILES.map((p) => (
                <SelectItem key={p} value={p}>{CSV_PROFILE_LABELS[p]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="grid gap-1.5">
          <Label>Archivo CSV</Label>
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        <div className="flex items-end">
          <Button onClick={handleImport} disabled={!file || importMut.isPending} className="w-full">
            {importMut.isPending ? <SpinnerIcon className="h-4 w-4 animate-spin mr-2" /> : <UploadIcon className="h-4 w-4 mr-2" />}
            Importar y emparejar
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
