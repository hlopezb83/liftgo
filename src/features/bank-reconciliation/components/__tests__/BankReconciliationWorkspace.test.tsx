// @vitest-environment jsdom
import { fireEvent, render, screen, within, waitFor, cleanup } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BankReconciliationWorkspace } from '../BankReconciliationWorkspace';
import type { BankStatementLine } from '../../hooks/useBankStatementLines';

const mocks = vi.hoisted(() => ({ mutate: vi.fn(), candidates: vi.fn() }));
vi.mock('../../hooks/mutations/useBankBulkActions', () => ({
  useConfirmBankMatches: () => ({ mutate: mocks.mutate, isPending: false }),
  useIgnoreBankLines: () => ({ mutate: mocks.mutate, isPending: false }),
}));
vi.mock('../../hooks/useBankReconciliationMutations', () => ({
  useConfirmBankMatch: () => ({ mutate: mocks.mutate, isPending: false }),
  useIgnoreBankLine: () => ({ mutate: mocks.mutate, isPending: false }),
  useUnmatchBankLine: () => ({ mutate: mocks.mutate, isPending: false }),
}));
vi.mock('../../hooks/useBankMatchCandidates', () => ({
  DATE_WINDOW_OPTIONS: [7, 15, 30],
  useBankMatchCandidates: mocks.candidates,
}));
const lines: BankStatementLine[] = ['uno', 'dos', 'tres'].map((id, index) => ({
  id, import_id: 'fixture', bank_account_id: 'fixture', posted_date: `2026-10-${18-index}`,
  description: `Movimiento ${id}`, reference: `Referencia ${id}`, signed_amount: 15000 + index,
  status: 'suggested', matched_payment_id: null, matched_supplier_payment_id: null,
  suggested_payment_id: null, suggested_supplier_payment_id: null, match_score: null,
  matched_at: null, ignored_reason: null,
}));
function row(id: string) {
  const node = document.querySelector(`[data-bank-line-id="${id}"]`)?.closest('tr');
  if (!node) throw new Error(`Missing row ${id}`);
  return node;
}
function mount(extra: Partial<React.ComponentProps<typeof BankReconciliationWorkspace>> = {}) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const props = { lines, bankAccountId: 'fixture', currency: 'MXN', isLoading: false,
    status: 'all' as const, search: '', onStatusChange: vi.fn(), onSearchChange: vi.fn(), ...extra };
  const view = render(<QueryClientProvider client={client}><BankReconciliationWorkspace {...props} /></QueryClientProvider>);
  return { ...view, props, rerenderWorkspace: (next: Partial<typeof props>) => view.rerender(
    <QueryClientProvider client={client}><BankReconciliationWorkspace {...props} {...next} /></QueryClientProvider>), };
}
async function closeAndFocus(id: string, key = true) {
  if (key) fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
  else fireEvent.click(screen.getByRole('button', { name: 'Cerrar', exact: true }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await waitFor(() => expect(row(id)).toHaveFocus());
}
beforeEach(() => {
  mocks.mutate.mockClear(); mocks.candidates.mockReset();
  mocks.candidates.mockReturnValue({ data: [{ id: 'candidate', kind: 'payment', label: 'Pago aislado',
    candidate_date: '2026-10-18', amount: 15000, score: 100, exact_amount: true, day_diff: 0,
    reference_hit: true }], isFetching: false, isError: false, isPending: false });
  vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{ width: 100, height: 44 }] as unknown as DOMRectList);
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); expect(mocks.mutate).not.toHaveBeenCalled(); });
describe('V06 inspector con tabla real y Radix, datos aislados', () => {
  it('no reserva panel vacío ni consulta candidatos sin selección', () => {
    mount(); expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.queryByTestId('bank-match-panel-slot')).not.toBeInTheDocument();
    expect(mocks.candidates).not.toHaveBeenCalled();
    expect(screen.getByTestId('bank-lines-table').parentElement).toHaveClass('w-full', 'min-w-0');
  });
  it.each(['click', 'Enter'])('abre con %s y restaura foco al cerrar', async (method) => {
    mount(); const first = row('uno'); first.focus();
    if (method === 'click') fireEvent.click(first); else fireEvent.keyDown(first, { key: 'Enter' });
    expect(screen.getByRole('dialog')).toContainElement(screen.getByText('Pago aislado'));
    await waitFor(() => expect(screen.getByRole('dialog')).toContainElement(document.activeElement as HTMLElement));
    await closeAndFocus('uno'); expect(row('uno')).toBe(first);
  });
  it('J/K y flechas cambian el destino de foco vigente; ciclos y X', async () => {
    mount(); fireEvent.click(row('uno'));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'j' });
    expect(within(screen.getByRole('dialog')).getByText('Movimiento dos')).toBeInTheDocument();
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'k' });
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'ArrowDown' });
    await closeAndFocus('dos', false);
    fireEvent.keyDown(row('dos'), { key: 'Enter' }); await closeAndFocus('dos');
  });
  it('escribir J/K/flechas en candidatos y textarea no cambia movimiento', async () => {
    mount(); fireEvent.click(row('uno'));
    for (const input of [screen.getByRole('textbox', { name: /Buscar candidatos/ }), screen.getByTestId('bank-panel-ignore-reason')]) {
      for (const key of ['j', 'k', 'ArrowDown', 'ArrowUp']) fireEvent.keyDown(input, { key });
    }
    expect(within(screen.getByRole('dialog')).getByText('Movimiento uno')).toBeInTheDocument();
    await closeAndFocus('uno');
  });
  it('preserva checkbox, barra, razón, orden, scroll y tabla en resize', async () => {
    mount(); const table = screen.getByTestId('bank-lines-table');
    const first = row('uno'); fireEvent.click(within(first).getByRole('checkbox'));
    fireEvent.change(screen.getByTestId('bank-bulk-reason'), { target: { value: 'texto retenido' } });
    const scroller = table.querySelector('div'); if (!scroller) throw new Error('Missing scroll');
    scroller.scrollLeft = 37; fireEvent.click(first);
    const candidateSearch = screen.getByRole('textbox', { name: /Buscar candidatos/ });
    fireEvent.change(candidateSearch, { target: { value: 'consulta retenida' } });
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 375 }); fireEvent(window, new Event('resize'));
    expect(screen.getByRole('textbox', { name: /Buscar candidatos/ })).toHaveValue('consulta retenida');
    await closeAndFocus('uno');
    expect(screen.getByTestId('bank-lines-table')).toBe(table); expect(scroller.scrollLeft).toBe(37);
    expect(within(first).getByRole('checkbox')).toBeChecked();
    expect(screen.getByTestId('bank-bulk-count')).toHaveTextContent('1 seleccionados');
    expect(screen.getByTestId('bank-bulk-reason')).toHaveValue('texto retenido');
    expect(Array.from(document.querySelectorAll('[data-bank-line-id]')).map(n => n.getAttribute('data-bank-line-id'))).toEqual(['uno', 'dos', 'tres']);
  });
  it('checkbox por teclado no abre inspector', () => {
    mount(); const checkbox = within(row('uno')).getByRole('checkbox');
    fireEvent.keyDown(checkbox, { key: 'Enter' }); fireEvent.keyDown(checkbox, { key: ' ' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
  it('cambio de búsqueda/estado cierra como antes y conserva callbacks', async () => {
    const view = mount(); fireEvent.click(row('uno')); await closeAndFocus('uno');
    fireEvent.change(screen.getByPlaceholderText('Descripción, referencia o monto…'), { target: { value: 'dos' } });
    expect(view.props.onSearchChange).toHaveBeenCalledWith('dos');
    fireEvent.click(row('uno')); view.rerenderWorkspace({ search: 'dos', lines: [lines[1]] });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });
  it('virtualiza más de 100 sin desmontar tabla ni perder selección', async () => {
    const many = Array.from({ length: 120 }, (_, i) => ({ ...lines[0], id: `line-${i}`, description: `Línea ${i}` }));
    mount({ lines: many, virtualized: true }); const table = screen.getByTestId('bank-lines-table');
    await waitFor(() => expect(document.querySelectorAll('[data-bank-line-id]').length).toBeGreaterThan(0));
    expect(document.querySelectorAll('[data-bank-line-id]').length).toBeLessThan(120);
    const first = row('line-0'); fireEvent.click(within(first).getByRole('checkbox'));
    fireEvent.click(first); await closeAndFocus('line-0');
    expect(screen.getByTestId('bank-lines-table')).toBe(table);
    expect(within(first).getByRole('checkbox')).toBeChecked();
  });
});
