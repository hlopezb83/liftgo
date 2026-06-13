import type { ErrorReport } from "@/lib/ui/errorReport";

function section(title: string, body: string): string {
  return `── ${title} ──────────────────────────────\n${body}`;
}

function fmtKV(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join("\n");
}

function headerBlock(r: ErrorReport): string {
  return fmtKV({
    requestId: r.requestId,
    errorCode: r.errorCode,
    title: r.title,
    phase: r.phase ?? "—",
    step: r.step ?? "—",
    method: r.method ?? "—",
    version: r.version,
    timestamp: r.timestampIso,
    timezone: r.timezone,
    route: r.route,
  });
}

function userBlock(r: ErrorReport): string {
  return fmtKV({
    id: r.user.id ?? "—",
    email: r.user.email ?? "—",
    role: r.user.effectiveRole ?? "—",
    organizationId: r.user.organizationId ?? "—",
    organizationName: r.user.organizationName ?? "—",
  });
}

function clientBlock(r: ErrorReport): string {
  return fmtKV({
    userAgent: r.client.userAgent,
    viewport: `${r.client.viewport.width}x${r.client.viewport.height}`,
    dpr: r.client.devicePixelRatio,
  });
}

function errorBlock(r: ErrorReport): string {
  const d = r.errorDetails;
  return fmtKV({
    message: d.message,
    name: d.name ?? "—",
    code: d.code ?? "—",
    status: d.status ?? "—",
    details: d.details ?? "—",
    hint: d.hint ?? "—",
  });
}

/** Formatea un ErrorReport como texto plano listo para copiar/pegar. */
export function formatReportText(report: ErrorReport): string {
  const d = report.errorDetails;
  const parts: string[] = [
    section("REPORTE DE ERROR — LiftGo", headerBlock(report)),
    section("USUARIO", userBlock(report)),
    section("CLIENTE", clientBlock(report)),
    section("ERROR", errorBlock(report)),
  ];

  if (d.validationErrors && d.validationErrors.length > 0) {
    parts.push(
      section(
        "VALIDACIÓN",
        d.validationErrors.map((v) => `• ${v.path || "(root)"}: ${v.message} [${v.code}]`).join("\n"),
      ),
    );
  }
  if (report.context && Object.keys(report.context).length > 0) {
    parts.push(section("CONTEXTO", JSON.stringify(report.context, null, 2)));
  }
  if (report.description) parts.push(section("DESCRIPCIÓN", report.description));
  if (d.stack) parts.push(section("STACK", d.stack));

  return parts.join("\n\n");
}
