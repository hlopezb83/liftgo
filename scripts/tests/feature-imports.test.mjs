import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';
import { checkFeatureImports, checkFeatureSource, moduleReferences } from '../check-feature-imports.mjs';

const root = process.cwd();
const file = path.join(root, 'src/features/fleet/pages/Detail.tsx');
const check = (source, filename = file) => checkFeatureSource(filename, source, root);

for (const [name, source] of Object.entries({
  utils: 'import { value } from "@/features/availability/utils/fleetAvailability";',
  multiline: 'import {\n  value,\n} from\n"@/features/availability/internal/value";',
  reexport: 'export { value } from "@/features/availability/state/value";',
  exportAll: 'export * from "@/features/availability/models";',
  dynamic: 'const load = () => import("@/features/availability/utils/value");',
  template: 'const load = () => import(`@/features/availability/utils/value`);',
  relative: 'import { value } from "../../availability/utils/value";',
  traversal: 'import { value } from "@/features/fleet/../availability/utils/value";',
  typeImport: 'type Value = import("../../availability/types/value").Value;',
  require: 'const value = require("@/features/availability/utils/value");',
  importEquals: 'import value = require("@/features/availability/utils/value");',
})) test(`rejects cross-feature ${name}`, () => assert.equal(check(source).filter(v => v.rule === 'G5').length, 1));

for (const specifier of ['@/features/availability', '@/features/availability/index', '@/features/availability/index.ts', '../../availability', '../../availability/index.js', '@/features/fleet/utils/value', '../utils/value']) {
  test(`allows public barrel or same-feature ${specifier}`, () => assert.deepEqual(check(`import { value } from "${specifier}";`), []));
}
test('does not treat comments or ordinary strings as imports', () => {
  assert.deepEqual(moduleReferences('// import x from "@/features/other/lib/x";\nconst example = "import x from other";'), []);
});
test('reports correct multiline source location', () => {
  assert.equal(check('import {\n value\n} from "../../availability/utils/value";')[0].line, 3);
});
for (const filename of ['src/features/fleet/__tests__/fixture.ts', 'src/features/fleet/pages/Detail.test.tsx', 'src/features/fleet/pages/Detail.spec.tsx']) {
  test(`explicit test-source exception ${filename}`, () => assert.deepEqual(check('import { value } from "@/features/availability/utils/value";', path.join(root, filename)), []));
}
for (const source of ['import { supabase } from "@/integrations/supabase/client";', 'const load = () => import("../../../integrations/supabase/client");', 'export * from "@/integrations/supabase/client";']) {
  test(`rejects Supabase UI boundary ${source}`, () => {
    const filename = path.join(root, 'src/features/fleet/pages/Detail.tsx');
    assert.equal(check(source, filename).filter(v => v.rule === 'G4').length, 1);
  });
}
test('only the exact auth page has a Supabase UI exception', () => {
  const source = 'import { supabase } from "@/integrations/supabase/client";';
  assert.deepEqual(check(source, path.join(root, 'src/features/auth/pages/AuthPage.tsx')), []);
  assert.equal(check(source, path.join(root, 'src/features/auth/pages/Other.tsx')).length, 1);
  assert.deepEqual(check(source, path.join(root, 'src/features/fleet/hooks/useFleet.ts')), []);
});
test('repository feature graph respects G4/G5', () => assert.deepEqual(checkFeatureImports(root), []));
