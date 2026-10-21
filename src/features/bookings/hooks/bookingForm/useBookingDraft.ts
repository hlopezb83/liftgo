import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { useUnsavedChangesGuard } from "@/hooks/useUnsavedChangesGuard";
import { useVerifiedIdentityScope } from "@/lib/query/useVerifiedIdentityScope";
import { DraftStorageError, FORM_DRAFT_PREFIX, openFormDraftStore, type LocalFormDraft } from "@/lib/storage/formDraftStorage";
import { bookingDraftSchema, bookingFormHasChanges, emptyBookingForm, hasRecoverableBookingFields, restoreBookingDraft, toBookingDraft, type BookingDraftValues } from "../../lib/bookingDraft";
import type { BookingFormData } from "../../lib/bookingFormSchema";
import type { UseFormReturn } from "react-hook-form";

type Draft = LocalFormDraft<BookingDraftValues>;
type Status = "created-unavailable" | "loading" | "ready" | "saved" | "unavailable" | "conflict" | "expired" | "created";
type Store = ReturnType<typeof openFormDraftStore<BookingDraftValues>>;
interface Session { scope: string; store: Store; draft: Draft | null; paused: boolean; completed: boolean }

export function useBookingDraft(form: UseFormReturn<BookingFormData>) {
  const scope = useVerifiedIdentityScope();
  const session = useRef<Session | null>(null);
  const suppress = useRef(false);
  const [status, setStatus] = useState<Status>("loading");
  const [candidate, setCandidate] = useState<Draft | null>(null);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [hasChanges, setHasChanges] = useState(false);

  const handleError = useCallback((error: unknown) => {
    const reason = error instanceof DraftStorageError ? error.reason : "unavailable";
    if (session.current && reason !== "unavailable") session.current.paused = true;
    setStatus(reason);
  }, []);

  useEffect(() => {
    suppress.current = true;
    form.reset(emptyBookingForm());
    suppress.current = false;
    // This effect hydrates an external, identity-scoped browser store before editing.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setHasChanges(false);
    setCandidate(null);
    setExpiresAt(null);
    if (!scope) { session.current = null; setStatus("loading"); return; }
    const active = createDraftSession(scope);
    session.current = active;
    try {
      active.draft = active.store.read();
      active.paused = Boolean(active.draft);
      setCandidate(active.draft);
      setExpiresAt(active.draft?.expiresAt ?? null);
      setStatus("ready");
    } catch (error) { handleError(error); }
    const subscription = form.watch(() => {
      if (suppress.current || session.current !== active || active.paused || active.completed) return;
      const values = form.getValues();
      setHasChanges(bookingFormHasChanges(values));
      try {
        const payload = toBookingDraft(values);
        if (!hasRecoverableBookingFields(payload)) {
          active.store.clear(active.draft);
          active.draft = null;
          setExpiresAt(null);
          setStatus("ready");
          return;
        }
        if (active.draft && JSON.stringify(active.draft.values) === JSON.stringify(payload)) {
          active.store.assertCurrent(active.draft);
          return;
        }
        active.draft = active.store.write(payload, active.draft);
        setExpiresAt(active.draft.expiresAt);
        setStatus("saved");
      } catch (error) { handleError(error); }
    });
    const checkLease = () => {
      if (session.current !== active || active.completed) return;
      try { active.store.assertCurrent(active.draft); } catch (error) {
        setCandidate(null);
        handleError(error);
      }
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key.startsWith(FORM_DRAFT_PREFIX)) checkLease();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener("focus", checkLease);
    document.addEventListener("visibilitychange", checkLease);
    return () => {
      subscription.unsubscribe();
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("focus", checkLease);
      document.removeEventListener("visibilitychange", checkLease);
      if (session.current === active) session.current = null;
    };
  }, [scope, form, handleError]);

  useDraftExpiry(expiresAt, status, session, setCandidate, setStatus);

  const restore = () => {
    const active = session.current;
    if (!active || !candidate) return;
    try {
      active.store.assertCurrent(candidate);
      const latest = active.store.read();
      if (!latest) throw new DraftStorageError("expired");
      suppress.current = true;
      form.reset(restoreBookingDraft(latest.values));
      suppress.current = false;
      active.draft = latest;
      active.paused = false;
      setCandidate(null);
      setHasChanges(true);
      setStatus("saved");
    } catch (error) { suppress.current = false; setCandidate(null); handleError(error); }
  };
  const discard = () => {
    const active = session.current;
    if (!active || active.completed) return;
    // Never delete another tab's newer version while resolving a conflict.
    try { active.store.assertCurrent(active.draft); active.store.clear(active.draft); } catch (error) {
      if (!(error instanceof DraftStorageError) || error.reason === "conflict") { handleError(error); return; }
      // Unavailable persistence must not trap a user in a manual-only form.
      try { active.store.clear(active.draft); } catch { /* retain unavailable notice below */ }
    }
    active.draft = null;
    active.paused = false;
    suppress.current = true;
    form.reset(emptyBookingForm());
    suppress.current = false;
    setCandidate(null);
    setExpiresAt(null);
    setHasChanges(false);
    setStatus("ready");
  };
  // Capture before the request: a successful RPC must revoke even after unmount.
  const captureCompletion = () => {
    const active = session.current;
    const submittedDraft = active?.draft ?? null;
    return () => {
      if (!active) return;
      active.completed = true;
      let cleaned = true;
      try { active.store.clear(submittedDraft); } catch { cleaned = false; }
      if (session.current !== active) return;
      setCandidate(null);
      setHasChanges(false);
      setStatus(cleaned ? "created" : "created-unavailable");
    };
  };
  const reload = () => {
    const active = session.current;
    if (!active || active.completed) return;
    try {
      const latest = active.store.read();
      active.draft = latest;
      active.paused = Boolean(latest);
      suppress.current = true;
      form.reset(emptyBookingForm());
      suppress.current = false;
      setCandidate(latest);
      setExpiresAt(latest?.expiresAt ?? null);
      setHasChanges(false);
      setStatus("ready");
    } catch (error) { handleError(error); }
  };
  const canSubmit = () => {
    const active = session.current;
    if (!active || active.scope !== scope || active.paused || active.completed) return false;
    try { active.store.assertCurrent(active.draft); return true; } catch (error) {
      handleError(error);
      // Storage is optional. Verified, fresh manual entry must remain usable.
      return error instanceof DraftStorageError && error.reason === "unavailable";
    }
  };
  useDraftExitGuard(form, session, candidate);
  return { status, candidate, expiresAt, hasChanges, restore, discard, reload, captureCompletion, canSubmit,
    submitBlocked: Boolean(candidate || ["loading", "conflict", "expired", "created", "created-unavailable"].includes(status)) };
}

function useDraftExpiry(
  expiresAt: number | null, status: Status, session: RefObject<Session | null>,
  setCandidate: (value: Draft | null) => void, setStatus: (value: Status) => void,
) {
  // Long-lived tabs expire too. Restore never renews createdAt/expiresAt.
  useEffect(() => {
    if (!expiresAt || status.startsWith("created")) return;
    const timeout = window.setTimeout(() => {
      const active = session.current;
      if (!active || active.completed) return;
      expireDraft(active);
      setCandidate(null);
      setStatus("expired");
    }, Math.max(0, expiresAt - Date.now()));
    return () => window.clearTimeout(timeout);
  }, [expiresAt, status, session, setCandidate, setStatus]);

}
function useDraftExitGuard(form: UseFormReturn<BookingFormData>, session: RefObject<Session | null>, candidate: Draft | null) {
  useUnsavedChangesGuard(() => {
    const active = session.current;
    return Boolean(active && !active.completed && !candidate && bookingFormHasChanges(form.getValues()));
  }, {
    title: "¿Salir de la reserva sin crearla?",
    description: "La reserva todavía no existe. Sólo se recuperan del borrador local las fechas, el equipo, el cliente seleccionado y la recurrencia, si se pudieron guardar. El nombre libre y el contacto se perderán al salir.",
    confirmLabel: "Salir", cancelLabel: "Seguir editando",
  });
 }

function createDraftSession(scope: string): Session {
  return { scope, store: openFormDraftStore(scope, (value) => bookingDraftSchema.parse(value)), draft: null, paused: false, completed: false };
}
function expireDraft(active: Session) {
  active.paused = true;
  try { active.store.clear(active.draft); } catch { /* retain visible form */ }
}
