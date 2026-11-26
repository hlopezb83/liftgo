export function BankStatementErrors({ errors }: { errors: string[] }) {
  if (errors.length === 0) return null;

  return (
    <div className="space-y-1 text-xs">
      <p className="text-warning-text">Los movimientos con datos inválidos no se importarán.</p>
      <details className="rounded-md border border-warning/40 p-3">
        <summary className="cursor-pointer rounded-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Ver {errors.length} {errors.length === 1 ? "error" : "errores"}
        </summary>
        <div role="region" aria-label="Errores del archivo" className="mt-2 max-h-48 overflow-y-auto">
          <ul className="list-disc space-y-1 pl-4 [overflow-wrap:anywhere]">
            {errors.map((error, index) => <li key={`${index}-${error}`}>{error}</li>)}
          </ul>
        </div>
      </details>
    </div>
  );
}
