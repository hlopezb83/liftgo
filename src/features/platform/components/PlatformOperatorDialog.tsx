import { useState } from "react";
import { FormDialog, FormDialogFooter } from "@/components/forms/FormDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PLATFORM_PROFILE_LABELS } from "@/lib/platformAccess.types";
import { setPlatformOperatorProfileFn } from "@/lib/platformOperators.functions";
import {
  PLATFORM_PROFILE_SUMMARIES, platformProfileSchema, type PlatformOperatorRow,
} from "@/lib/platformOperators.types";

function allowedChange(account: PlatformOperatorRow, revoke: boolean, profile: string) {
  return revoke ? !!account.profile : account.eligible && profile!==account.profile;
}

export function PlatformOperatorDialog({ account, onClose, onSaved }: {
  account: PlatformOperatorRow; onClose: () => void; onSaved: () => void;
}) {
  const [profile, setProfile] = useState(account.profile ?? "observer");
  const [revoke, setRevoke] = useState(!account.eligible && !!account.profile);
  const [reason, setReason] = useState("");
  const [password, setPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const changeAllowed = allowedChange(account, revoke, profile);
  const canSave = !saving && password.length>0 && reason.trim().length>=5 && changeAllowed;

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError("");
    const confirmation = password;
    setPassword("");
    try {
      // Llamada directa: la contraseña no entra en variables del MutationCache.
      await setPlatformOperatorProfileFn({ data: {
        userId: account.id, profile: revoke ? null : profile,
        expectedRevision: account.revision, reason, password: confirmation,
      } });
      onSaved();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : "No se pudo guardar el acceso. Reintenta.");
    } finally { setSaving(false); }
  }

  function close() { setPassword(""); onClose(); }
  return (
    <FormDialog open onOpenChange={(open) => { if (!open) close(); }} title="Cambiar acceso de plataforma"
      description={<span className="break-words">{account.name} · {account.email}</span>} isPending={saving}>
      <form onSubmit={(event) => void save(event)} className="space-y-5">
        <p className="text-sm text-muted-foreground">El cambio se aplica al Centro de Plataforma. El rol y los datos de su empresa se conservan.</p>
        <div className="space-y-2">
          <Label htmlFor="operator-profile">Perfil de plataforma</Label>
          <select id="operator-profile" className="h-10 w-full rounded-md border bg-background px-3 text-sm"
            value={revoke ? "revoke" : profile} disabled={saving}
            onChange={(event) => {
              setRevoke(event.target.value === "revoke");
              const parsed = platformProfileSchema.safeParse(event.target.value);
              if (parsed.success) setProfile(parsed.data);
            }}>
            {account.eligible && platformProfileSchema.options.map((value) => <option key={value} value={value}>{PLATFORM_PROFILE_LABELS[value]}</option>)}
            {account.profile && <option value="revoke">Retirar acceso de plataforma</option>}
          </select>
          <p className="rounded-lg bg-muted p-3 text-sm">
            {revoke ? "La cuenta conserva el acceso que tenga al ERP de su empresa." : PLATFORM_PROFILE_SUMMARIES[profile]}
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="operator-reason">Motivo del cambio</Label>
          <Textarea id="operator-reason" value={reason} onChange={(event) => setReason(event.target.value)}
            minLength={5} maxLength={500} required disabled={saving} placeholder="Describe por qué cambia este acceso" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="operator-password">Mi contraseña actual</Label>
          <Input id="operator-password" type="password" autoComplete="current-password" value={password}
            onChange={(event) => setPassword(event.target.value)} required maxLength={1024} disabled={saving} />
          <p className="text-xs text-muted-foreground">Confirma con tu contraseña, no con la de esta cuenta.</p>
        </div>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <FormDialogFooter>
          <Button type="button" variant="outline" onClick={close} disabled={saving}>Cancelar</Button>
          <Button type="submit" variant={revoke ? "destructive" : "default"} disabled={!canSave}>
            {saving ? "Guardando…" : revoke ? "Retirar acceso" : "Guardar acceso"}
          </Button>
        </FormDialogFooter>
      </form>
    </FormDialog>
  );
}
