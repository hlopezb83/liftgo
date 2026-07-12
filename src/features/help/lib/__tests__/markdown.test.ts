import { describe, it, expect } from "vitest";
import { renderMarkdown, renderSafeMarkdown } from "../markdown";

describe("renderMarkdown", () => {
  it("convierte headings", () => {
    expect(renderMarkdown("## Título")).toContain("<h2");
    expect(renderMarkdown("### Sub")).toContain("<h3");
    expect(renderMarkdown("#### Sub2")).toContain("<h4");
  });

  it("convierte negritas e itálicas", () => {
    const out = renderMarkdown("**bold** *it*");
    expect(out).toContain("<strong>bold</strong>");
    expect(out).toContain("<em>it</em>");
  });

  it("convierte listas ordenadas y desordenadas", () => {
    expect(renderMarkdown("1. uno")).toMatch(/<ol[^>]*>[\s\S]*<li>uno<\/li>/);
    expect(renderMarkdown("- uno")).toMatch(/<ul[^>]*>[\s\S]*<li>uno<\/li>/);
  });

  it("convierte blockquote", () => {
    expect(renderMarkdown("> nota")).toContain("<blockquote");
  });
});

describe("renderSafeMarkdown", () => {
  it("sanitiza scripts maliciosos", () => {
    const out = renderSafeMarkdown("**hola** <script>alert(1)</script>");
    expect(out).not.toContain("<script>");
    expect(out).toContain("<strong>hola</strong>");
  });

  it("envuelve en contenedor prose", () => {
    const out = renderSafeMarkdown("Hola");
    expect(out).toContain('class="prose');
  });
});
