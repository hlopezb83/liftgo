import { useState } from "react";
import type { CashFlowSettings } from "../lib/queryKeys";

function fingerprint(settings: CashFlowSettings | undefined) {
  return JSON.stringify(settings ?? null);
}

function amountsMatch(initial: string, buffer: string, base: CashFlowSettings | undefined) {
  return base && initial.trim() !== "" && buffer.trim() !== ""
    && Number(initial) === base.initialBalance && Number(buffer) === base.safetyBuffer;
}

function fromSettings(settings: CashFlowSettings | undefined) {
  return {
    base: settings,
    observed: fingerprint(settings),
    initial: settings ? String(settings.initialBalance) : "",
    buffer: settings ? String(settings.safetyBuffer) : "",
  };
}

function editAmount(current: ReturnType<typeof fromSettings>, field: "initial" | "buffer", value: string, settings: CashFlowSettings | undefined) {
  const next = { ...current, [field]: value };
  return settings && amountsMatch(next.initial, next.buffer, next.base) && fingerprint(next.base) !== fingerprint(settings)
    ? fromSettings(settings)
    : next;
}

export function useCashFlowDraft(settings: CashFlowSettings | undefined) {
  const [draft, setDraft] = useState(() => fromSettings(settings));
  const dirty = Boolean(draft.base) && !amountsMatch(draft.initial, draft.buffer, draft.base);
  const observed = fingerprint(settings);
  if (settings && observed !== draft.observed) {
    setDraft(!dirty || settings.id !== draft.base?.id
      ? fromSettings(settings)
      : { ...draft, observed });
  }

  return {
    initial: draft.initial,
    buffer: draft.buffer,
    dirty,
    remoteChanged: dirty && Boolean(settings) && fingerprint(draft.base) !== observed,
    setInitial: (initial: string) => setDraft((current) => editAmount(current, "initial", initial, settings)),
    setBuffer: (buffer: string) => setDraft((current) => editAmount(current, "buffer", buffer, settings)),
    markSaved: (saved: CashFlowSettings) => setDraft((current) => current.base?.id === saved.id
      ? { ...current, base: saved }
      : current),
  };
}
