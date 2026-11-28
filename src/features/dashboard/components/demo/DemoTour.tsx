import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/contexts/AuthContext";
import { useOrganizationContext } from "@/contexts/OrganizationContext";
import { useHasModuleAccess, useUserRole } from "@/features/users";
import { formatDateMty } from "@/lib/format/dateFormats";
import { formatCurrencyWithCode } from "@/lib/format/formatCurrency";
import { useDemoEvidence, type DemoRequest } from "../../hooks/demo/useDemoEvidence";
import { DEMO_SCENARIOS, type DemoEvidence, type DemoScenario } from "../../lib/demoTour";

function EvidenceSteps({ evidence, scenario, step }: { evidence: DemoEvidence; scenario: DemoScenario; step: number }) {
  const { invoice, paid, balance, payments } = evidence;
  const currency = invoice.moneda ?? "MXN";
  const money = (amount: number) => `${formatCurrencyWithCode(amount, currency)} ${currency}`;
  return (
    <section className="space-y-3" aria-live="polite">
      <p className="text-sm font-medium">Paso {step + 1} de 3 · {DEMO_SCENARIOS[scenario].label}</p>
      {step === 0 && <>
        <h3 className="font-semibold">1. Revisa el documento existente</h3>
        <p className="text-sm break-words">{invoice.invoice_number} · {invoice.customer_name}</p>
        <p className="text-sm">Emitida: {formatDateMty(invoice.issued_at)}. Total: {money(Number(invoice.total))}.</p>
        <p className="text-sm text-muted-foreground">Resultado esperado: el folio, cliente y total coinciden con la factura de tu empresa activa.</p>
      </>}
      {step === 1 && <>
        <h3 className="font-semibold">2. Comprueba cobros y saldo</h3>
        <p className="text-sm">Cobrado: {money(paid)}. Saldo: {money(balance)}.</p>
        <p className="text-sm">Resultado esperado: {DEMO_SCENARIOS[scenario].expected}</p>
        <p className="text-sm text-muted-foreground">Consulta el historial de pagos de la factura. No registres pagos, REP ni timbrados durante el recorrido.</p>
      </>}
      {step === 2 && <>
        <h3 className="font-semibold">3. Contrasta con Resultados</h3>
        <p className="text-sm">Selecciona el mes de emisión ({formatDateMty(invoice.issued_at)}) en Devengado y los meses de los cobros en Flujo de efectivo.</p>
        <p className="text-sm">Resultado esperado: {scenario === "partial"
          ? "Devengado refleja la factura emitida; Flujo de efectivo sólo la parte cobrada, en las fechas de cobro."
          : scenario === "paid"
            ? "Al abarcar la emisión y todos los cobros, esta factura aparece en ambas bases según las reglas del reporte."
            : "La factura emitida aparece en Devengado, sin aportar cobros al Flujo de efectivo."}</p>
        <p className="text-sm">{payments.length ? `Fechas de cobro: ${[...new Set(payments.map((payment) => formatDateMty(payment.payment_date)))].join(", ")}.` : "No hay fechas de cobro registradas."}</p>
        <p className="text-sm text-muted-foreground">El saldo incluye impuestos; Resultados usa sus reglas de IVA, moneda y fecha. No compares el total de esta factura con el total de toda la empresa. Si el desglose ofrece documentos, busca este folio; si no está disponible, consulta la factura.</p>
        <a className="block text-sm underline" href="/income-statement" target="_blank" rel="noopener noreferrer">Abrir Resultados en otra pestaña</a>
      </>}
      <a className="block text-sm underline" href={`/invoices/${encodeURIComponent(invoice.id)}`} target="_blank" rel="noopener noreferrer">Abrir factura {invoice.invoice_number} en otra pestaña</a>
    </section>
  );
}

function DemoSession({ organizationId, userId, onExit }: { organizationId: string; userId: string; onExit: () => void }) {
  const [scenario, setScenario] = useState<DemoScenario>("paid");
  const [folio, setFolio] = useState("");
  const [request, setRequest] = useState<DemoRequest | null>(null);
  const [step, setStep] = useState<number | null>(null);
  const query = useDemoEvidence(organizationId, userId, request);
  const evidence = !query.isFetching && !query.isError ? query.data : null;
  const reset = () => { setStep(null); setRequest(null); setFolio(""); };
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Sólo consulta. Elegir, iniciar, reiniciar o salir cambia únicamente este recorrido; nunca crea ni borra operaciones.</p>
      {step === null ? <>
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">Escenario</legend>
          <div className="flex flex-wrap gap-3">
            {(Object.keys(DEMO_SCENARIOS) as DemoScenario[]).map((key) => <label key={key} className="flex items-center gap-2 text-sm">
              <input type="radio" name="demo-scenario" value={key} checked={scenario === key} onChange={() => { setScenario(key); setRequest(null); }} />
              {DEMO_SCENARIOS[key].label}
            </label>)}
          </div>
        </fieldset>
        <form className="space-y-3" onSubmit={(event) => {
          event.preventDefault();
          const next = { folio: folio.trim(), scenario };
          if (!next.folio) return;
          if (request?.folio === next.folio && request.scenario === next.scenario) void query.refetch();
          else setRequest(next);
        }}>
          <div className="space-y-1">
            <Label htmlFor="demo-folio">Folio de factura QA/DEMO existente</Label>
            <Input id="demo-folio" value={folio} maxLength={100} onChange={(event) => { setFolio(event.target.value); setRequest(null); }} placeholder="Escribe el folio exacto" />
          </div>
          <p className="text-xs text-muted-foreground">Usa un cliente identificado como QA o DEMO, en tu empresa activa, sin notas de crédito vigentes. Un CFDI timbrado debe ser Sandbox. Si falta el ejemplo, no se generará uno automáticamente.</p>
          <Button type="submit" variant="outline" disabled={!folio.trim() || query.isFetching}>Verificar ejemplo</Button>
        </form>
        {query.isFetching && <p role="status" className="text-sm">Verificando documento y cobros…</p>}
        {query.isError && <p role="alert" className="text-sm text-destructive">No se pudo verificar el ejemplo. Vuelve a intentar; no se modificaron datos.</p>}
        {request && query.isSuccess && !query.isFetching && !evidence && <p role="status" className="text-sm">Falta un ejemplo verificable para {DEMO_SCENARIOS[scenario].label}. Revisa el folio, la empresa, la marca QA/DEMO y su estado de cobro. No se creó ningún registro.</p>}
        {evidence && <div className="space-y-2">
          <p role="status" className="text-sm">Ejemplo verificado: {evidence.invoice.invoice_number} · {evidence.invoice.customer_name}.</p>
          <Button onClick={() => setStep(0)}>Iniciar recorrido</Button>
        </div>}
      </> : evidence ? <>
        <EvidenceSteps evidence={evidence} scenario={scenario} step={step} />
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={step === 0} onClick={() => setStep(Math.max(0, step - 1))}>Anterior</Button>
          {step < 2 && <Button onClick={() => setStep(Math.min(2, step + 1))}>Siguiente</Button>}
        </div>
      </> : <p role="status" className="text-sm">El ejemplo debe verificarse de nuevo antes de continuar.</p>}
      <div className="flex flex-wrap gap-2 border-t pt-3">
        <Button variant="outline" onClick={reset}>Reiniciar recorrido</Button>
        <Button variant="ghost" onClick={onExit}>Salir del recorrido</Button>
      </div>
    </div>
  );
}

/** Admin-only launcher; mounting it must not start a data query. No new role,
 * route, table or persistent tour state is introduced. */
export function DemoTour() {
  const [open, setOpen] = useState(false);
  const { user } = useAuth();
  const organization = useOrganizationContext();
  const role = useUserRole();
  const canReadInvoices = useHasModuleAccess("Facturas");
  const canReadReports = useHasModuleAccess("Reportes");
  if (!user || role.isLoading || role.isError || role.data !== "admin" ||
      organization.status !== "ready" || organization.memberType !== "internal" ||
      !canReadInvoices || !canReadReports) return null;
  return (
    <Dialog key={`${user.id}:${organization.organizationId}`} open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild><Button variant="outline">Recorrido demo</Button></DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Recorrido demo</DialogTitle>
          <DialogDescription>Pagado, Parcial y Pendiente con documentos existentes de tu empresa activa.</DialogDescription>
        </DialogHeader>
        {open && <DemoSession organizationId={organization.organizationId} userId={user.id} onExit={() => setOpen(false)} />}
      </DialogContent>
    </Dialog>
  );
}
