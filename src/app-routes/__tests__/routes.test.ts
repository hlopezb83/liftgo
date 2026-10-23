import ts from "typescript";
import { describe, expect, it } from "vitest";
import { ROUTES } from "@/app-routes/routes";
import { routeLoaders } from "@/app-routes/routes-config";
import manifestSource from "../routes-config.tsx?raw";
import treeSource from "../../routeTree.gen.ts?raw";

// Inspect the active tree without executing every page or its data hooks.
const routeSources = import.meta.glob<string>("../../routes/**/*.tsx", {
  eager: true, query: "?raw", import: "default",
});

type Node = string | ((id: string) => string) | { [k: string]: Node };
function collect(node: Node): string[] {
  if (typeof node === "string") return [node];
  if (typeof node === "function") return [node(":id")];
  return Object.values(node).flatMap(collect);
}
function normalize(path: string): string {
  return path.replace(/\/(?:_main|_portal)(?=\/|$)/g, "")
    .replace(/\$[\w]+|:[\w]+/g, ":id").replace(/\/$/, "") || "/";
}
function parse(source: string) {
  return ts.createSourceFile("route.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
}
function calls(source: string, predicate: (node: ts.CallExpression) => boolean): string[] {
  const found: string[] = [];
  const visit = (node: ts.Node) => {
    if (ts.isCallExpression(node) && predicate(node) && node.arguments[0]
      && ts.isStringLiteral(node.arguments[0])) found.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  };
  visit(parse(source));
  return found;
}
const routesByPath = new Map(Object.values(routeSources).flatMap(source =>
  calls(source, node => ts.isIdentifier(node.expression) && node.expression.text === "createFileRoute")
    .filter(path => path !== "/_main" && path !== "/_portal")
    .map(path => [normalize(path), source] as const),
));
const tree = parse(treeSource).statements.find((node): node is ts.InterfaceDeclaration =>
  ts.isInterfaceDeclaration(node) && node.name.text === "FileRoutesByFullPath",
);
const activePaths = new Set(tree?.members.flatMap(member =>
  member.name && ts.isStringLiteral(member.name) ? [normalize(member.name.text)] : [],
));

// Read exact loader destinations as well as checking keys. The registry may not
// quietly preload a different page while navigation still works normally.
const manifest = parse(manifestSource);
const prefetchTargets = new Map<string, string>();
function readPrefetch(node: ts.Node) {
  if (ts.isPropertyAssignment(node) && ts.isStringLiteral(node.name)) {
    const targets = calls(node.initializer.getText(manifest), call => call.expression.kind === ts.SyntaxKind.ImportKeyword);
    if (targets.length === 1) prefetchTargets.set(node.name.text, targets[0]);
  }
  ts.forEachChild(node, readPrefetch);
}
readPrefetch(manifest);

describe("ROUTES ↔ active TanStack routes", () => {
  it("reads the generated tree actually used by the router", () => {
    expect(tree).toBeDefined();
    expect(activePaths.size).toBeGreaterThan(50);
  });
  it.each(collect(ROUTES))("%s exists in the active tree and a route file", path => {
    expect(activePaths.has(normalize(path)), `Missing active route: ${path}`).toBe(true);
    expect(routesByPath.has(normalize(path)), `Missing route file: ${path}`).toBe(true);
  });
  it.each(["/expenses", "/customers/new"])("keeps intentional redirect %s explicit", path => {
    const source = routesByPath.get(path)!;
    expect(calls(source, node => ts.isIdentifier(node.expression) && node.expression.text === "createFileRoute")).toHaveLength(1);
    expect(source).toContain("throw redirect(");
  });
});

describe("static chunk prefetch", () => {
  it("contains only static loaders, without stale components or access metadata", () => {
    expect(Object.keys(routeLoaders).sort()).toEqual([...prefetchTargets.keys()].sort());
    expect(manifestSource).not.toMatch(/\b(?:appRoutes|minAccess|adminOnly|lazy)\b/);
  });
  it.each(Object.keys(routeLoaders))("%s preloads the active route's page", path => {
    expect(path).not.toContain(":");
    expect(typeof routeLoaders[path]).toBe("function");
    expect(activePaths.has(normalize(path))).toBe(true);
    const source = routesByPath.get(normalize(path));
    expect(source).toBeDefined();
    const imports = calls(source!, node => node.expression.kind === ts.SyntaxKind.ImportKeyword);
    expect(imports).toContain(prefetchTargets.get(path));
  });
});
