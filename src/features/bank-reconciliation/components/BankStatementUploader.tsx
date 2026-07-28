import { useRef } from "react";
import { UploadIcon, SpinnerIcon } from "@/components/icons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useStatementUpload } from "../hooks/useStatementUpload";
import { CSV_PROFILES, CSV_PROFILE_LABELS, type StatementProfile } from "../lib/bankReconciliationConstants";
import { BankStatementPreview } from "./BankStatementPreview";
import { BankXmlFieldMapper } from "./BankXmlFieldMapper";

// Oleada 1 (A-13): file picker on-brand para reemplazar el input nativo en inglés.
function BankFilePicker({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const ref = useRef<HTMLInputElement>(null);
  return (
    <>
      <input
        ref={ref}
        type="file"
        accept=".csv,.xml,text/csv,text/xml,application/xml"
        className="hidden"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <Button type="button" variant="outline" onClick={() => ref.current?.click()} className="justify-start">
        <UploadIcon className="h-4 w-4 mr-2" />
        <span className="truncate">{file?.name ?? "Elegir archivo…"}</span>
      </Button>
    </>
  );
}

interface Props {
  bankAccountId: string;
}

export function BankStatementUploader({ bankAccountId }: Props) {
  const up = useStatementUpload(bankAccountId);
  const showMapper = up.xmlFields.length > 0;

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <UploadIcon className="h-4 w-4" /> Subir estado de cuenta (CSV o XML)
          </CardTitle>
        </CardHeader>
        <CardContent className="grid sm:grid-cols-3 gap-3">
          <div className="grid gap-1.5">
            <Label>Perfil del banco</Label>
            <Select value={up.profile} onValueChange={(v) => up.setProfile(v as StatementProfile)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {CSV_PROFILES.map((p) => (
                  <SelectItem key={p} value={p}>{CSV_PROFILE_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="grid gap-1.5">
            <Label>Archivo (CSV o XML)</Label>
            {/* Oleada 1 (A-13): el input nativo sale en inglés ("Choose File") */}
            <BankFilePicker file={up.file} onChange={(f) => { up.reset(); up.setFile(f); }} />
          </div>
          <div className="flex items-end">
            <Button onClick={() => void up.analyze()} disabled={!up.file || up.isPending} className="w-full">
              {up.isPending ? <SpinnerIcon className="h-4 w-4 animate-spin mr-2" /> : <UploadIcon className="h-4 w-4 mr-2" />}
              Analizar archivo
            </Button>
          </div>
        </CardContent>
      </Card>

      {showMapper && (
        <BankXmlFieldMapper availableFields={up.xmlFields} mapping={up.mapping} onChange={up.remap} />
      )}

      {up.preview && up.preview.lines.length === 0 && up.preview.errors.length > 0 && (
        <p className="text-sm text-destructive">{up.preview.errors[0]}</p>
      )}

      {up.preview && up.preview.lines.length > 0 && (
        <BankStatementPreview
          result={up.preview}
          isPending={up.isPending}
          onConfirm={up.confirm}
          onCancel={up.reset}
        />
      )}
    </div>
  );
}
