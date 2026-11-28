import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const SOURCE = /\.[cm]?[jt]sx?$/;
const TEST = /(?:^|\/)(?:__tests__|__fixtures__|test)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;
const GENERATED = new Set([
  'src/integrations/supabase/types.ts',
  'src/routeTree.gen.ts',
]);

// These checks cover static module specifiers, not computed runtime strings.
export function moduleReferences(source, filename = 'module.tsx') {
  const file = ts.createSourceFile(filename, source, ts.ScriptTarget.Latest, true);
  const references = [];
  function visit(node) {
    let specifier;
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) specifier = node.moduleSpecifier;
    else if (ts.isImportEqualsDeclaration(node) && ts.isExternalModuleReference(node.moduleReference)) specifier = node.moduleReference.expression;
    else if (ts.isImportTypeNode(node) && ts.isLiteralTypeNode(node.argument)) specifier = node.argument.literal;
    else if (ts.isCallExpression(node) && (node.expression.kind === ts.SyntaxKind.ImportKeyword || (ts.isIdentifier(node.expression) && node.expression.text === 'require'))) specifier = node.arguments[0];
    if (specifier && (ts.isStringLiteral(specifier) || ts.isNoSubstitutionTemplateLiteral(specifier))) {
      const { line } = file.getLineAndCharacterOfPosition(specifier.getStart(file));
      references.push({ specifier: specifier.text, line: line + 1 });
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return references;
}

export function checkFeatureSource(filename, source, root = process.cwd()) {
  const relative = path.relative(root, filename).split(path.sep).join('/');
  if (!relative.startsWith('src/') || GENERATED.has(relative) || TEST.test(relative)) return [];

  const sourceFeature = /^src\/features\/([^/]+)\//.exec(relative)?.[1];
  const inLowerSharedLayer = relative.startsWith('src/lib/') || relative.startsWith('src/integrations/');
  const inRouteTable = relative.startsWith('src/routes/') || relative.startsWith('src/app-routes/');
  const isUiSurface =
    (/^src\/features\/[^/]+\/(?:pages|components)\//.test(relative) && relative !== 'src/features/auth/pages/AuthPage.tsx') ||
    relative.startsWith('src/components/');

  const violations = [];
  for (const reference of moduleReferences(source, filename)) {
    const specifier = reference.specifier;
    const target = specifier.startsWith('@/') ? path.resolve(root, 'src', specifier.slice(2))
      : specifier.startsWith('.') ? path.resolve(path.dirname(filename), specifier) : undefined;
    if (!target) continue;
    const targetRelative = path.relative(root, target).split(path.sep).join('/').replace(/\.[cm]?[jt]sx?$/, '');
    const destination = /^src\/features\/([^/]+)(?:\/(.*))?$/.exec(targetRelative);

    if (destination) {
      const [, targetFeature, subpath] = destination;
      const isBarrel = !subpath || subpath === 'index';
      const isSameFeature = sourceFeature && targetFeature === sourceFeature;
      const isRoutePageSplit = inRouteTable && Boolean(subpath && /^pages\/[^/]+$/.test(subpath));
      const isEarlyRecoveryBootstrap =
        relative === 'src/instrument-client.ts' && targetRelative === 'src/features/auth/recoverySession';

      if (inLowerSharedLayer || (!isSameFeature && !isBarrel && !isRoutePageSplit && !isEarlyRecoveryBootstrap)) {
        violations.push({ rule: 'G5', file: relative, ...reference, target: targetRelative });
      }
    }

    if (isUiSurface && targetRelative === 'src/integrations/supabase/client') {
      violations.push({ rule: 'G4', file: relative, ...reference, target: targetRelative });
    }
  }
  return violations;
}

export function checkFeatureImports(root = process.cwd()) {
  const violations = [];
  function walk(directory) {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name);
      if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in sources: ${filename}`);
      if (entry.isDirectory()) {
        if (entry.name === '__tests__' || entry.name === '__fixtures__') continue;
        walk(filename);
      } else if (SOURCE.test(entry.name)) {
        const relative = path.relative(root, filename).split(path.sep).join('/');
        if (GENERATED.has(relative) || TEST.test(relative)) continue;
        violations.push(...checkFeatureSource(filename, fs.readFileSync(filename, 'utf8'), root));
      }
    }
  }
  walk(path.join(root, 'src'));
  return violations;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const violations = checkFeatureImports();
  for (const finding of violations) console.error(`${finding.rule} ${finding.file}:${finding.line}: ${finding.specifier}`);
  if (violations.length) {
    console.error(`FAIL — ${violations.length} module boundary violation(s). Use public feature barrels, keep src/lib and src/integrations independent of features, and keep Supabase I/O outside UI.`);
    process.exitCode = 1;
  } else console.log('OK — UI transport, full src/ feature boundaries and shared-layer independence (AST, literal specifiers).');
}
