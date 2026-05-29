import type { ErrorReport } from "@/lib/ui/errorReport";

function section(title: string, body: string): string {
  return `── ${title} ──────────────────────────────\n${body}`;
}

function fmtKV(obj: Record<string, unknown>): string {
  return Object.entries(obj)
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join("\n");
}

/** Formatea un ErrorReport como texto plano listo para copiar/pegar. */
export function formatReportText(report: ErrorReport): string {
  const header = fmtKV({
    requestId: report.requestId,
    errorCode: report.errorCode,
    title: report.title,
    phase: report.phase ?? "—",
    step: report.step ?? "—",
    method: report.method ?? "—",
    version: report.version,
    timestamp: report.timestampIso,
    timezone: report.timezone,
    route: report.route,
  });

  const user = fmtKV({
    id: report.user.id ?? "—",
    email: report.user.email ?? "—",
    role: report.user.effectiveRole ?? "—",
    organizationId: report.user.organizationId ?? "—",
    organizationName: report.user.organizationName ?? "—",
  });

  const client = fmtKV({
    userAgent: report.client.userAgent,
    viewport: `${report.client.viewport.width}x${report.client.viewport.height}`,
    dpr: report.client.devicePixelRatio,
  });

  const d = report.errorDetails;
  const errorBlock = fmtKV({
    message: d.message,
    name: d.name ?? "—",
    code: d.code ?? "—",
    status: d.status ?? "—",
    details: d.details ?? "—",
    hint: d.hint ?? "—",
  });

  const parts: string[] = [
    section("REPORTE DE ERROR — LiftGo", header),
    section("USUARIO", user),
    section("CLIENTE", client),
    section("ERROR", errorBlock),
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

  if (report.description) {
    parts.push(section("DESCRIPCIÓN", report.description));
  }

  if (d.stack) {
    parts.push(section("STACK", d.stack));
  }

  return parts.join("\n\n");
}
