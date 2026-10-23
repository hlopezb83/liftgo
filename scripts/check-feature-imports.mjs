import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import ts from 'typescript';

const SOURCE = /\.[cm]?[jt]sx?$/;
const TEST = /(?:^|\/)(?:__tests__|__fixtures__)\/|\.(?:test|spec)\.[cm]?[jt]sx?$/;

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
  const sourceFeature = /^src\/features\/([^/]+)\//.exec(relative)?.[1];
  if (!sourceFeature || TEST.test(relative)) return [];
  const violations = [];
  for (const reference of moduleReferences(source, filename)) {
    const specifier = reference.specifier;
    const target = specifier.startsWith('@/') ? path.resolve(root, 'src', specifier.slice(2))
      : specifier.startsWith('.') ? path.resolve(path.dirname(filename), specifier) : undefined;
    if (!target) continue;
    const targetRelative = path.relative(root, target).split(path.sep).join('/').replace(/\.[cm]?[jt]sx?$/, '');
    const destination = /^src\/features\/([^/]+)(?:\/(.*))?$/.exec(targetRelative);
    if (destination && destination[1] !== sourceFeature && destination[2] && destination[2] !== 'index') {
      violations.push({ rule: 'G5', file: relative, ...reference, target: targetRelative });
    }
    if (/^src\/features\/[^/]+\/(?:pages|components)\//.test(relative)
      && relative !== 'src/features/auth/pages/AuthPage.tsx'
      && targetRelative === 'src/integrations/supabase/client') {
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
      if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink in feature sources: ${filename}`);
      if (entry.isDirectory()) walk(filename);
      else if (SOURCE.test(entry.name)) violations.push(...checkFeatureSource(filename, fs.readFileSync(filename, 'utf8'), root));
    }
  }
  walk(path.join(root, 'src/features'));
  return violations;
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  const violations = checkFeatureImports();
  for (const finding of violations) console.error(`${finding.rule} ${finding.file}:${finding.line}: ${finding.specifier}`);
  if (violations.length) {
    console.error(`FAIL — ${violations.length} module boundary violation(s). Use a public feature barrel and keep Supabase I/O outside UI.`);
    process.exitCode = 1;
  } else console.log('OK — 0 Supabase UI imports; 0 cross-feature deep imports (AST, literal specifiers).');
}
