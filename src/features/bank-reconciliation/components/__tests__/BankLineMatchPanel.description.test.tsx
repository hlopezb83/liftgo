// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { BankLineMatchPanel } from '../BankLineMatchPanel';
import type { BankStatementLine } from '../../hooks/useBankStatementLines';

const mocks = vi.hoisted(() => ({ mutate: vi.fn() }));
vi.mock('../../hooks/useBankReconciliationMutations', () => ({
  useConfirmBankMatch: () => ({ mutate: mocks.mutate, isPending: false }),
  useIgnoreBankLine: () => ({ mutate: mocks.mutate, isPending: false }),
  useUnmatchBankLine: () => ({ mutate: mocks.mutate, isPending: false }),
}));
vi.mock('../../hooks/useBankMatchCandidates', () => ({
  DATE_WINDOW_OPTIONS: [7, 15, 30],
  useBankMatchCandidates: () => ({ data: [], isFetching: false, isError: false, isPending: false }),
}));

const line: BankStatementLine = {
  id: 'fixture', import_id: 'fixture', bank_account_id: 'fixture', posted_date: '2026-10-18',
  description: '', reference: null, signed_amount: 15000, status: 'unmatched',
  matched_payment_id: null, matched_supplier_payment_id: null,
  suggested_payment_id: null, suggested_supplier_payment_id: null,
  match_score: null, matched_at: null, ignored_reason: null,
};

afterEach(() => { cleanup(); expect(mocks.mutate).not.toHaveBeenCalled(); });

describe('V06-D01 descripción completa del inspector (DOM, no geometría)', () => {
  it.each([
    ['descripción larga con saltos', 'Transferencia bancaria por servicio de logística y renta mensual. '.repeat(12) + '\nSegunda línea\nTercera línea'],
    ['cadena sin espacios', 'REFERENCIABANCARIA'.repeat(50)],
  ])('conserva %s íntegra y permite envolverla sin recorte', (_name, description) => {
    render(<BankLineMatchPanel line={{ ...line, description }} currency="MXN" onDone={vi.fn()} />);
    const text = screen.getByText((_content, element) => element?.tagName === 'P' && element.textContent === description);
    expect(text.textContent).toBe(description);
    expect(text).toHaveClass('whitespace-pre-wrap', '[overflow-wrap:anywhere]', 'text-sm', 'font-medium');
    expect(text).not.toHaveClass('truncate');
    expect(screen.getByText('Candidatos')).toBeInTheDocument();
  });

  it('conserva el marcador cuando no hay descripción', () => {
    render(<BankLineMatchPanel line={line} currency="MXN" onDone={vi.fn()} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});