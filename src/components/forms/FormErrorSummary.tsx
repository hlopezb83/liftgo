import { useEffect, useRef } from "react";
import { useFormState } from "react-hook-form";
import { focusFormErrorTarget, useFormErrorTarget } from "@/lib/forms/formErrorTargets";

type Issue = { name: string; message: string };

function errorIssues(errors: unknown, path: string[] = []): Issue[] {
  if (!errors || typeof errors !== "object") return [];
  const value = errors as Record<string, unknown>;
  const own = typeof value.message === "string" ? [{ name: path.join("."), message: value.message }] : [];
  return own.concat(Object.entries(value).flatMap(([key, entry]) => {
    if (["message", "type", "types", "ref"].includes(key)) return [];
    return errorIssues(entry, key === "root" ? path : [...path, key]);
  }));
}

function ErrorLink({ issue, labelFor, targetFor }: {
  issue: Issue;
  labelFor: (name: string) => string;
  targetFor: (name: string) => string;
}) {
  const targetId = useFormErrorTarget(targetFor(issue.name));
  return (
    <a
      className="underline underline-offset-2 focus-visible:outline focus-visible:outline-2"
      href={targetId ? `#${encodeURIComponent(targetId)}` : undefined}
      onClick={(event) => {
        if (!targetId) return;
        const form = event.currentTarget.closest("form");
        const target = document.getElementById(targetId);
        if (target && form?.contains(target)) {
          event.preventDefault();
          focusFormErrorTarget(target);
        }
      }}
    >
      {labelFor(issue.name)}: {issue.message}
    </a>
  );
}

const sameTarget = (name: string) => name;

/** Focus once per rejected submit, never while the user is correcting a field. */
export function FormErrorSummary({ labelFor, targetFor = sameTarget }: {
  labelFor: (name: string) => string;
  targetFor?: (name: string) => string;
}) {
  const { errors, submitCount } = useFormState();
  const issues = errorIssues(errors);
  const headingId = useFormErrorTarget("error-summary-title");
  const summaryRef = useRef<HTMLElement>(null);
  const lastSubmit = useRef(0);
  useEffect(() => {
    if (submitCount > lastSubmit.current) summaryRef.current?.focus();
    lastSubmit.current = submitCount;
  }, [submitCount]);

  if (submitCount === 0 || issues.length === 0) return null;
  return (
    <section ref={summaryRef} tabIndex={-1} aria-labelledby={headingId} className="rounded-lg border border-destructive p-4 text-sm focus:outline focus:outline-2 focus:outline-destructive">
      <h2 id={headingId} className="font-semibold">Revisa los campos marcados</h2>
      <ul className="mt-2 list-disc space-y-1 pl-5 text-destructive">
        {issues.map((issue) => <li key={`${issue.name}:${issue.message}`}><ErrorLink issue={issue} labelFor={labelFor} targetFor={targetFor} /></li>)}
      </ul>
    </section>
  );
}
