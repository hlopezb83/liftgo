import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';

const root = fileURLToPath(new URL('../../', import.meta.url));
// Load the real flat config: a hand-built rules fixture cannot detect later
// blocks silently replacing restrictions in eslint.config.js.
const eslint = new ESLint({ cwd: root, cache: false });
const rule = (name) => `liftgo/${name}`;
const page = 'src/features/invoices/pages/GuardrailSentinel.tsx';
const hook = 'src/features/invoices/hooks/useGuardrailSentinel.ts';
const form = 'src/features/invoices/hooks/invoiceForm/guardrailSentinel.ts';
const lines = 'src/features/quotes/components/quotes/guardrailLineHelpers.ts';

async function messages(code, filePath) {
  const [result] = await eslint.lintText(code, { filePath });
  assert.equal(result.fatalErrorCount, 0, JSON.stringify(result.messages));
  assert.ok(!result.messages.some(({ ruleId }) => ruleId === null), JSON.stringify(result.messages));
  return result.messages.filter(({ ruleId }) => ruleId.startsWith('liftgo/'));
}

function guardrailSeverities(config) {
  return Object.fromEntries(Object.entries(config.rules)
    .filter(([name]) => name.startsWith('liftgo/'))
    .map(([name, [severity]]) => [name, severity]));
}

const common = {
  [rule('no-direct-ui-imports')]: 2,
  [rule('no-direct-sonner')]: 2,
  [rule('no-unlocalized-dates')]: 1,
  [rule('no-unwrapped-navigation')]: 1,
  [rule('no-raw-colors')]: 1,
};
for (const [filePath, expected] of [
  [page, { ...common, [rule('no-ui-supabase')]: 2 }],
  [hook, { ...common, [rule('no-deep-feature-imports')]: 1 }],
  [form, { ...common, [rule('no-deep-feature-imports')]: 1, [rule('no-inline-money')]: 2 }],
  [lines, { ...common, [rule('no-ui-supabase')]: 2, [rule('no-inline-money')]: 2 }],
  ['src/components/layout/GuardrailSentinel.tsx', { ...common, [rule('no-ui-supabase')]: 2 }],
]) {
  test(`effective config keeps every guardrail and severity: ${filePath}`, async () => {
    const effective = await eslint.calculateConfigForFile(filePath);
    assert.deepEqual(guardrailSeverities(effective), expected);
  });
}

const rejected = [
  ['UI Supabase', page, 'import { supabase } from "@/integrations/supabase/client";', 'no-ui-supabase', 2],
  ['component Supabase', 'src/components/GuardrailSentinel.tsx', 'import { supabase } from "@/integrations/supabase/client";', 'no-ui-supabase', 2],
  ['direct lucide', page, 'import { Plus } from "lucide-react";', 'no-direct-ui-imports', 2],
  ['raw registry name', page, 'import { Trash2 } from "@/components/icons";', 'no-direct-ui-imports', 2],
  ['direct sonner', page, 'import { toast } from "sonner";', 'no-direct-sonner', 2],
  ['deep feature hook', hook, 'import { value } from "@/features/quotes/hooks/useValue";', 'no-deep-feature-imports', 1],
  ['deep feature lib', 'src/features/invoices/lib/guardrail.ts', 'import { value } from "@/features/quotes/lib/value";', 'no-deep-feature-imports', 1],
  ['date format', page, 'import { format } from "date-fns";', 'no-unlocalized-dates', 1],
  ['date locale', page, 'import { es } from "date-fns/locale";', 'no-unlocalized-dates', 1],
  ['router DOM navigation', page, 'import { useNavigate } from "react-router-dom";', 'no-unwrapped-navigation', 1],
  ['router navigation', page, 'import { useNavigate } from "react-router";', 'no-unwrapped-navigation', 1],
  ['money multiply', form, 'export const total = 2 * 3;', 'no-inline-money', 2],
  ['money divide', lines, 'export const total = 2 / 3;', 'no-inline-money', 2],
  ['raw Tailwind literal', page, 'export const className = "bg-gray-500";', 'no-raw-colors', 1],
  ['raw Tailwind JSX attribute', page, 'const element = <div className="border-slate-200" />;', 'no-raw-colors', 1],
  ['sonner neighboring helper is not exempt', 'src/lib/ui/anotherFeedback.ts', 'import { toast } from "sonner";', 'no-direct-sonner', 2],
  ['wrapper still uses semantic icons', 'src/lib/ui/appFeedback.ts', 'import { Plus } from "lucide-react";', 'no-direct-ui-imports', 2],
];
for (const [label, filePath, code, expectedRule, severity] of rejected) {
  test(`rejects ${label} at the original severity`, async () => {
    const actual = await messages(code, filePath);
    assert.deepEqual(actual.map(({ ruleId, severity }) => ({ ruleId, severity })), [{ ruleId: rule(expectedRule), severity }]);
  });
}

test('import restrictions run simultaneously instead of last-block-wins', async () => {
  const actual = await messages([
    'import { supabase } from "@/integrations/supabase/client";',
    'import { Plus } from "lucide-react";',
    'import { toast } from "sonner";',
    'import { format } from "date-fns";',
    'import { useNavigate } from "react-router-dom";',
  ].join('\n'), page);
  assert.deepEqual(actual.map(({ ruleId }) => ruleId).sort(), [
    'no-ui-supabase', 'no-direct-ui-imports', 'no-direct-sonner',
    'no-unlocalized-dates', 'no-unwrapped-navigation',
  ].map(rule).sort());
});

test('money and Tailwind syntax restrictions run simultaneously', async () => {
  const actual = await messages('export const total = 2 * 3; export const className = "text-gray-500";', form);
  assert.deepEqual(actual.map(({ ruleId, severity }) => ({ ruleId, severity })), [
    { ruleId: rule('no-inline-money'), severity: 2 },
    { ruleId: rule('no-raw-colors'), severity: 1 },
  ]);
});

const allowed = [
  ['semantic icons', page, 'import { DeleteIcon } from "@/components/icons";'],
  ['feedback wrapper', page, 'import { notifySuccess } from "@/lib/ui/appFeedback";'],
  ['public feature barrel', hook, 'import { value } from "@/features/quotes";'],
  ['Monterrey date helper', page, 'import { formatDateMty } from "@/lib/format/dateFormats";'],
  ['date arithmetic imports', page, 'import { addDays } from "date-fns";'],
  ['navigation wrapper', page, 'import { useNavigateTransition } from "@/hooks/useNavigateTransition";'],
  ['non-navigation router imports', page, 'import { Link } from "react-router-dom";'],
  ['domain money helpers', form, 'import { lineItemTotal } from "@/lib/domain/invoiceTotals";'],
  ['semantic colors', page, 'export const className = "bg-primary text-muted-foreground border-warning/40";'],
  ['I/O hook', hook, 'import { supabase } from "@/integrations/supabase/client";'],
  ['auth page I/O', 'src/features/auth/pages/AuthPage.tsx', 'import { supabase } from "@/integrations/supabase/client";'],
  ['icon registry', 'src/components/icons/index.ts', 'export { Plus } from "lucide-react";'],
  ['sonner canonical implementation', 'src/lib/ui/appFeedback.ts', 'import { toast } from "sonner";'],
  ['date helper implementation', 'src/lib/format/dateFormats.ts', 'import { format } from "date-fns";'],
  ['root hooks date scope stays unchanged', 'src/hooks/useGuardrailSentinel.ts', 'import { format } from "date-fns";'],
  ['calendar exception', 'src/features/calendar/lib/guardrail.ts', 'import { format } from "date-fns";'],
  ['cash-flow exception', 'src/features/cash-flow/lib/guardrail.ts', 'import { es } from "date-fns/locale";'],
  ['navigation implementation', 'src/hooks/useNavigateTransition.ts', 'import { useNavigate } from "react-router-dom";'],
  ['auth navigation', 'src/features/auth/hooks/useGuardrailSentinel.ts', 'import { useNavigate } from "react-router";'],
  ['monetary domain', 'src/lib/domain/invoiceTotals.ts', 'export const total = 2 * 3;'],
  ['unprotected nested form scope stays unchanged', 'src/features/invoices/hooks/invoiceForm/nested/sentinel.ts', 'export const total = 2 * 3;'],
  ['PDF color exception', 'src/lib/pdf/guardrail.tsx', 'export const className = "bg-gray-500";'],
  ['test exceptions', 'src/features/invoices/hooks/guardrail.test.ts', [
    'import { format } from "date-fns";',
    'import { useNavigate } from "react-router-dom";',
    'import { value } from "@/features/quotes/hooks/useValue";',
    'export const className = "bg-gray-500";',
  ].join('\n')],
  ['__tests__ exceptions', 'src/features/invoices/hooks/__tests__/guardrail.ts', [
    'import { es } from "date-fns/locale";',
    'import { useNavigate } from "react-router";',
    'import { value } from "@/features/quotes/lib/value";',
    'export const className = "bg-gray-500";',
  ].join('\n')],
];
for (const [label, filePath, code] of allowed) {
  test(`preserves allowed usage or exception: ${label}`, async () => {
    assert.deepEqual(await messages(code, filePath), []);
  });
}

for (const filePath of [
  'src/components/ui/calendar.tsx',
  'src/components/ui/sonner.tsx',
  'src/integrations/supabase/client.ts',
  'src/integrations/supabase/types.ts',
  'src/routeTree.gen.ts',
]) {
  test(`preserves the global generated/UI ignore: ${filePath}`, async () => {
    assert.equal(await eslint.calculateConfigForFile(path.join(root, filePath)), undefined);
  });
}
