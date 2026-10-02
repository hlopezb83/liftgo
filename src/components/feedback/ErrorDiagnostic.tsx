import { useMemo, useState } from "react";
import { ErrorReportDialog } from "@/components/ui/ErrorDetailsDialog";
import { buildErrorReport, type BuildErrorReportInput } from "@/lib/ui/errorReport";
import { ErrorReportActions } from "./ErrorReportActions";

/** Works even when the app's providers have failed or a mutation is silent. */
export function ErrorDiagnostic(input: BuildErrorReportInput) {
  const { error, title, description, phase, step, method, errorCode, context } = input;
  const report = useMemo(() => buildErrorReport({ error, title, description, phase, step, method, errorCode, context }),
    [error, title, description, phase, step, method, errorCode, context]);
  const [open, setOpen] = useState(false);
  return <>
    <ErrorReportActions key={report.requestId} report={report} onDetails={() => setOpen(true)} />
    <ErrorReportDialog open={open} report={report} onClose={() => setOpen(false)} />
  </>;
}
