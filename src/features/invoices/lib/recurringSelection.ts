/**
 * R8-05 / R8-12: reconciliación pura de la selección del asistente de facturas
 * recurrentes.
 *
 * Problema original:
 *  - La selección vivía en un `Set<string>` que se reconstruía desde cero cuando
 *    cambiaba el conjunto de reservas elegibles: cualquier refresh del preview
 *    borraba las líneas que el operador había desmarcado a propósito (R8-12).
 *  - Si una línea cambiaba de periodo o de monto sin cambiar de `bookingId`, la
 *    llave de rehidratación no cambiaba y la fila seguía seleccionada en
 *    silencio con datos distintos a los que el usuario aprobó (R8-05).
 *
 * Invariantes que garantiza este módulo (todo puro, sin React):
 *  1. Sólo permanecen seleccionadas las reservas presentes y seleccionables en
 *     el preview actual.
 *  2. Una reserva cuya identidad material cambió (periodos, monto, IVA) se
 *     deselecciona y NO se vuelve a marcar sola.
 *  3. Lo que el usuario desmarcó explícitamente nunca se vuelve a marcar por un
 *     refresh ni por activar/desactivar la confirmación de tarifa modificada.
 *  4. Alternar la confirmación de tarifa modificada sólo puede agregar las
 *     reservas con `rateWarning` que el usuario no había desmarcado; el resto de
 *     la selección queda intacta.
 *
 * NOTA de negocio: esto es sólo estado de UI. Las reglas de elegibilidad, el
 * prorrateo y el candado de tarifa desactualizada siguen siendo autoridad del
 * Edge Function.
 */
import type { RecurringPreviewLine } from "../hooks/invoices/recurring/usePreviewRecurringInvoices";

export interface RecurringSelectionState {
  /** Reservas actualmente marcadas para facturar. */
  selected: ReadonlySet<string>;
  /** Reservas que el usuario desmarcó a propósito (no se re-agregan solas). */
  deselected: ReadonlySet<string>;
  /** Reservas que alguna vez fueron seleccionables (para no re-ofrecerlas). */
  known: ReadonlySet<string>;
  /** Firma material por reserva presente en el preview actual. */
  signatures: Readonly<Record<string, string>>;
  /**
   * R9-01: firma material de toda reserva vista durante la sesión abierta del
   * diálogo (incluidas las que desaparecieron del preview). Permite reconocer
   * una reserva que reaparece con la misma firma y respetar la intención del
   * usuario en vez de tratarla como fila nueva.
   */
  history: Readonly<Record<string, string>>;
  /** R9-01: última intención "marcada" del usuario, aunque la fila esté ausente. */
  intentSelected: ReadonlySet<string>;
}

export function emptyRecurringSelection(): RecurringSelectionState {
  return {
    selected: new Set(),
    deselected: new Set(),
    known: new Set(),
    signatures: {},
    history: {},
    intentSelected: new Set(),
  };
}


/** Una reserva es seleccionable si es elegible y, si trae aviso de tarifa
 *  modificada, sólo cuando el operador confirmó explícitamente. */
export function isLineSelectable(line: RecurringPreviewLine, allowStaleRate: boolean): boolean {
  return line.eligible && (!line.rateWarning || allowStaleRate);
}

/**
 * R9-18: la unidad de selección es la combinación reserva + periodo, no la
 * reserva completa. Desmarcar un periodo no puede afectar a los demás
 * periodos de la misma reserva.
 */
export function recurringLineKey(line: RecurringPreviewLine): string {
  return `${line.bookingId}|${line.periodStart}`;
}

/** Firma material de una línea: cambia si cambia el periodo, el monto o el IVA. */
function lineSignature(line: RecurringPreviewLine): string {
  return [
    line.periodStart,
    line.periodEnd,
    String(line.billedAmount),
    String(line.taxRate ?? ""),
    line.isProrated ? "p" : "-",
  ].join("~");
}

/** Firma por línea (reserva + periodo). */
export function buildSignatures(lines: readonly RecurringPreviewLine[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of lines) out[recurringLineKey(line)] = lineSignature(line);
  return out;
}

/**
 * Huella del preview: si no cambia, no hace falta reconciliar. Incluye la
 * confirmación de tarifa porque cambia el conjunto de seleccionables.
 */
export function recurringPreviewFingerprint(
  lines: readonly RecurringPreviewLine[],
  allowStaleRate: boolean,
): string {
  const sigs = buildSignatures(lines);
  const selectable = new Set(
    lines.filter((l) => isLineSelectable(l, allowStaleRate)).map(recurringLineKey),
  );
  return Object.keys(sigs)
    .sort()
    .map((id) => `${id}:${sigs[id]}:${selectable.has(id) ? "1" : "0"}`)
    .join(";");
}

type IdOutcome = "deselected" | "selected" | "known-only" | "absent-known";

/** Decide el destino de una reserva presente en el preview actual. */
function resolveId(
  prev: RecurringSelectionState,
  id: string,
  signature: string,
  isSelectable: boolean,
): IdOutcome {
  // R9-01: la firma de referencia viene del histórico de la sesión, así una
  // reserva que desapareció y volvió igual no se trata como fila nueva.
  const prevSig = prev.history[id] ?? prev.signatures[id];
  // Un cambio material obliga a re-aprobar: se olvida el histórico y la fila
  // queda desmarcada sin volver a auto-seleccionarse.
  const changed = prevSig !== undefined && prevSig !== signature;
  const wasKnown = prev.known.has(id) && !changed;

  if (changed || (prev.deselected.has(id) && !changed)) return "deselected";
  // No seleccionable ahora (ineligible o bloqueada por tarifa sin confirmar):
  // fuera de la selección, pero conservamos su historial de conocida.
  if (!isSelectable) return wasKnown ? "absent-known" : "known-only";
  if (!wasKnown) return "selected"; // Fila nueva y seleccionable: marcada por defecto.
  return prev.intentSelected.has(id) ? "selected" : "known-only";
}

/** Reconcilia el estado previo contra las filas actuales del preview. */
export function reconcileRecurringSelection(
  prev: RecurringSelectionState,
  lines: readonly RecurringPreviewLine[],
  allowStaleRate: boolean,
): RecurringSelectionState {
  const signatures = buildSignatures(lines);
  const selectable = new Set(
    lines.filter((l) => isLineSelectable(l, allowStaleRate)).map(recurringLineKey),
  );

  const selected = new Set<string>();
  const deselected = new Set<string>();
  const known = new Set<string>();
  const intentSelected = new Set<string>();

  for (const id of Object.keys(signatures)) {
    const isSelectable = selectable.has(id);
    const outcome = resolveId(prev, id, signatures[id], isSelectable);
    if (outcome === "deselected") {
      deselected.add(id);
      if (isSelectable) known.add(id);
      else if (prev.known.has(id)) known.add(id);
      continue;
    }
    if (isSelectable) known.add(id);
    else if (outcome === "absent-known") known.add(id);
    if (outcome === "selected") {
      selected.add(id);
      intentSelected.add(id);
    }
  }

  // R9-01: mientras el diálogo siga abierto conservamos la intención de las
  // reservas ausentes del preview actual (desmarcadas o marcadas). El reset por
  // sesión ocurre al reabrir el diálogo (R9-02).
  for (const id of prev.deselected) if (signatures[id] === undefined) deselected.add(id);
  for (const id of prev.known) if (signatures[id] === undefined) known.add(id);
  for (const id of prev.intentSelected) if (signatures[id] === undefined) intentSelected.add(id);

  const history = { ...prev.history, ...signatures };

  return { selected, deselected, known, signatures, history, intentSelected };
}


/** Alterna una reserva registrando la intención explícita del usuario. */
export function toggleRecurringSelection(
  state: RecurringSelectionState,
  id: string,
): RecurringSelectionState {
  const selected = new Set(state.selected);
  const deselected = new Set(state.deselected);
  const intentSelected = new Set(state.intentSelected);
  if (selected.has(id)) {
    selected.delete(id);
    intentSelected.delete(id);
    deselected.add(id);
  } else {
    selected.add(id);
    intentSelected.add(id);
    deselected.delete(id);
  }
  return { ...state, selected, deselected, intentSelected };
}

/** Alterna un grupo completo (cliente) respetando la misma semántica. */
export function toggleRecurringGroup(
  state: RecurringSelectionState,
  ids: readonly string[],
): RecurringSelectionState {
  const allSelected = ids.length > 0 && ids.every((id) => state.selected.has(id));
  const selected = new Set(state.selected);
  const deselected = new Set(state.deselected);
  const intentSelected = new Set(state.intentSelected);
  for (const id of ids) {
    if (allSelected) {
      selected.delete(id);
      intentSelected.delete(id);
      deselected.add(id);
    } else {
      selected.add(id);
      intentSelected.add(id);
      deselected.delete(id);
    }
  }
  return { ...state, selected, deselected, intentSelected };
}

